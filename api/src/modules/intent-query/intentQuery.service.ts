import mongoose from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { authorizeTenantOperation, type OperationAuthorizationContext } from "../permissions/permissions.operation.js";
import { getAuditWriter, getMetricRecorder } from "../../common/observability/index.js";
import { logger } from "../../common/logger/logger.js";
import DocumentModel from "../../db/models/document.model.js";
import IntentQueryTraceModel from "../../db/models/intentQueryTrace.model.js";
import { recordQuestionAsked } from "../usage/usage.service.js";

import type { QueryPlan } from "./intentQuery.types.js";
import { detectLanguage } from "./intentQuery.languageDetector.js";
import { extractEntities, extractTemporalConstraints } from "./intentQuery.entityExtractor.js";
import { expandBilingual } from "./intentQuery.bilingualExpander.js";
import { validateAnalyzeQuery, validateAndNormalizeQueryPlan } from "./intentQuery.validator.js";
import { INTENT_SYSTEM_PROMPT, INTENT_PROMPT_VERSION } from "./intentQuery.prompt.js";
import type { ConversationContextPort } from "./ports/conversationContext.port.js";
import type { ModelAdapter } from "../agents/agents.types.js";
import { recordIntentQueryMetrics } from "./intentQuery.metrics.js";
import { getDocumentAccessAuthorizationService } from "../document-access/documentAccess.authorization.service.js";
import { ENTITLEMENT_EXCEEDED } from "../../common/errors/errorCodes.js";
import { getEntitlementService } from "../entitlement/entitlement.service.js";
import { buildQuotaExceededError, resolvePeriodReset } from "../entitlement/middlewares/entitlement.middleware.js";
import { MongoUsageEventWriter } from "../analytics/adapters/mongo-usage-event-writer.js";
import { CostService } from "../analytics/cost.service.js";

export interface ExplicitDocumentAuthorizer {
  authorizeDocumentsAction(context: { tenantId: string; actorId: string }, documentIds: readonly string[], action: "use_in_ai"): Promise<void>;
}

export async function authorizeExplicitIntentDocuments(
  authorizer: ExplicitDocumentAuthorizer,
  context: { tenantId: string; actorId: string },
  documentIds: readonly string[],
): Promise<void> {
  if (documentIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    throw new AppError(400, "INTENT_QUERY_VALIDATION_ERROR", "Invalid document ID format");
  }
  await authorizer.authorizeDocumentsAction(context, [...new Set(documentIds)], "use_in_ai");
}

export class IntentQueryService {

  constructor(
    private readonly modelAdapter: ModelAdapter,
    private readonly conversationContextAdapter: ConversationContextPort
  ) {}

  /**
   * Orchestrates the query analysis workflow: input validation, authorization,
   * context loading, language detection, entity extraction, LLM query analysis,
   * post-processing/verification, auditing, and metric recording.
   */
  async analyzeQuery(
    rawInput: unknown,
    context: OperationAuthorizationContext
  ): Promise<QueryPlan> {
    const start = Date.now();
    const traceId = context.traceId ?? `iq-${Date.now()}`;
    const auditWriter = getAuditWriter();
    const metricRecorder = getMetricRecorder();
    const entitlementService = getEntitlementService();

    // 1. Input Validation
    const input = validateAnalyzeQuery(rawInput);

    // 2. Authorization Scoping
    const actor = await authorizeTenantOperation(context, Permission.CHAT_CREATE);
    const tenantIdStr = actor.tenantId.toString();

    // 3. Document ownership validation for inputs
    if (input.referencedDocumentIds && input.referencedDocumentIds.length > 0) {
      try {
        await authorizeExplicitIntentDocuments(
          getDocumentAccessAuthorizationService(), { tenantId: tenantIdStr, actorId: actor.actorId }, input.referencedDocumentIds,
        );
      } catch (error) {
        if (error instanceof AppError) {
          throw new AppError(403, "INTENT_QUERY_CONTEXT_UNAUTHORIZED", "Referenced document is not accessible in this tenant scope");
        }
        throw error;
      }
    }

    // 4. Determine language and entities early to handle fallback/clarification deterministically if needed
    const language = detectLanguage(input.question);
    const localEntities = extractEntities(input.question, language);
    const localTemporalConstraints = extractTemporalConstraints(input.question);

    // Check for prompt injections/unsafe inputs upfront deterministically
    const hasUnsafeKeywords = /unsafe|hack|ignore\s+previous|system\s+prompt/i.test(input.question);
    if (hasUnsafeKeywords) {
      await auditWriter.write({
        action: "INTENT_QUERY_UNSAFE_BLOCKED",
        resourceType: "IntentQuery",
        resourceId: "none",
        outcome: "DENIED",
        tenantId: tenantIdStr,
        actorId: actor.actorId,
        actorEmail: actor.actorEmail,
        actorRole: actor.actorRole,
        metadata: { inputQuestion: input.question },
      });

      const unsafePlan = validateAndNormalizeQueryPlan(
        {
          detectedIntent: "unsafe",
          intentConfidence: 0.99,
          language,
          entities: localEntities,
          exactTerms: [],
          semanticQueries: [],
          keywordQueries: [],
          clarificationNeeded: true,
          clarification: {
            reason: "ambiguous_intent",
            suggestedQuestions: [language === "ar" ? "كيف يمكنني مساعدتك بأمان؟" : "How can I help you safely?"],
            messageEn: "This request violates safety policies and cannot be processed.",
            messageAr: "لا يمكن معالجة هذا الطلب لمخالفته لسياسات الأمان.",
          },
          isFollowUp: false,
          conversationContextUsed: false,
        },
        input.question,
        language,
        INTENT_PROMPT_VERSION,
        this.modelAdapter.providerKey,
        Date.now() - start,
        0,
        0,
        false
      );

      recordIntentQueryMetrics(metricRecorder, unsafePlan, traceId);
      return unsafePlan;
    }

    // 5. Load Conversation Context with strict tenant isolation
    const messagesPayload: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: INTENT_SYSTEM_PROMPT },
    ];
    let isFollowUp = false;
    let contextUsed = false;

    if (input.conversationId) {
      try {
        const history = await this.conversationContextAdapter.getContext(
          tenantIdStr,
          actor.actorId,
          input.conversationId,
          input.maxContext
        );

        if (history.length > 0) {
          isFollowUp = true;
          contextUsed = true;

          // Limit context by character size (max 8000 characters)
          let totalLength = 0;
          const fitHistory = [];
          for (let i = history.length - 1; i >= 0; i--) {
            const msg = history[i];
            if (totalLength + msg.content.length > 8000) {
              logger.warn({ traceId, conversationId: input.conversationId }, "Conversation context length exceeded 8000 chars, truncating older messages");
              break;
            }
            fitHistory.unshift(msg);
            totalLength += msg.content.length;
          }

          // Add history to system prompt execution context
          for (const msg of fitHistory) {
            messagesPayload.push({
              role: msg.role,
              content: msg.content,
            });
          }
        }
      } catch (err) {
        // If getting context threw an auth error, bubble it up
        if (err instanceof AppError) {
          throw err;
        }
        // TODO: In production adapter, ensure robust handling of non-AppError network/DB failures
        logger.error({ err, traceId }, "Failed to load conversation context");
      }
    }

    // Append the current question
    messagesPayload.push({
      role: "user",
      content: input.question,
    });

    // 6. Call ModelAdapter (LLM) with timeout and fallback logic
    let rawOutput: Record<string, unknown> | null = null;
    let tokensUsed = 0;
    let inputTokensUsed = 0;
    let outputTokensUsed = 0;
    let resolvedModelName = "unknown";
    let estimatedCost = 0;
    let fallbackUsed = false;

    try {
      const response = await this.modelAdapter.complete({
        messages: messagesPayload,
        temperature: 0,
        maxTokens: 1000,
      });

      const content = response.choices[0]?.message?.content ?? "";
      tokensUsed = response.usage?.totalTokens ?? 0;
      inputTokensUsed = response.usage?.promptTokens ?? Math.round(tokensUsed * 0.7);
      outputTokensUsed = response.usage?.completionTokens ?? Math.round(tokensUsed * 0.3);
      resolvedModelName = response.model || this.modelAdapter.providerKey;
      estimatedCost = response.estimatedCost ?? 0;

      if (!response.usage?.totalTokens) {
        logger.warn(
          { traceId, providerKey: this.modelAdapter.providerKey },
          "AI provider returned no token usage — skipping tokensPerMonth accounting",
        );
      }

      // Extract JSON structure from code blocks if LLM wrapped it
      let cleanJson = content.trim();
      if (cleanJson.startsWith("```")) {
        cleanJson = cleanJson.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
      }

      rawOutput = JSON.parse(cleanJson);
    } catch (err) {
      logger.error({ err, traceId }, "LLM query analysis failed, initiating deterministic fallback");
      fallbackUsed = true;
    }

    // 6b. Enforce the tokensPerMonth quota — post-consume, because the exact
    // token count is only known once the LLM response arrives. The
    // deterministic fallback path leaves tokensUsed = 0, so nothing is
    // consumed there.
    if (tokensUsed > 0) {
      // Fire-and-forget analytics usage event tracking
      // traceId alone is the idempotency key — unique per request, stable across retries
      const eventWriter = new MongoUsageEventWriter();
      const costService = new CostService();
      void costService
        .calculateLlmCost(
          this.modelAdapter.providerKey,
          resolvedModelName,
          inputTokensUsed,
          outputTokensUsed
        )
        .then((costRes) => {
          return eventWriter.record({
            tenantId: tenantIdStr,
            actorId: actor.actorId,
            eventType: "completion",
            provider: this.modelAdapter.providerKey,
            model: resolvedModelName,
            inputTokens: inputTokensUsed,
            outputTokens: outputTokensUsed,
            totalTokens: tokensUsed,
            costMinorUnits: costRes.costMinorUnits,
            costType: costRes.costType,
            currency: costRes.currency,
            latencyMs: Date.now() - start,
            traceId,
            idempotencyKey: `intent_query_${traceId}`,
            success: !fallbackUsed,
          });
        })
        .catch((err) => {
          logger.warn({ err, traceId }, "[IntentQueryService] Failed to record usage event");
        });

      try {
        const consumed = await entitlementService.consume(
          tenantIdStr,
          "tokensPerMonth",
          tokensUsed,
        );

        if (!consumed.committed) {
          logger.warn(
            {
              traceId,
              tenantId: tenantIdStr,
              tokensUsed,
              current: consumed.current,
              limit: consumed.limit,
            },
            "tokensPerMonth quota exceeded — denying intent query",
          );
          const periodReset = await resolvePeriodReset(
            entitlementService,
            tenantIdStr,
          );
          throw buildQuotaExceededError({
            dimension: "tokensPerMonth",
            current: consumed.current,
            limit: consumed.limit,
            remaining: consumed.remaining,
            periodReset,
            canUpgrade:
              actor.actorRole === "SUPER_ADMIN" ||
              actor.actorRole === "COMPANY_ADMIN",
          });
        }
      } catch (error) {
        // Only the quota denial above becomes a 429 and takes down the
        // request. Any other failure (DB unavailable, snapshot missing, ...)
        // is not a quota denial — log it and keep the query's happy path
        // intact; token accounting must not withhold a completed answer.
        if (error instanceof AppError && error.code === ENTITLEMENT_EXCEEDED) {
          throw error;
        }

        // The Mongo counter signals an exhausted quota by failing the
        // guarded upsert with a duplicate-key error (E11000) instead of
        // returning committed: false. Treat that as the same denial.
        const mongoCode = (error as { code?: unknown }).code;
        if (mongoCode === 11000 || mongoCode === "11000") {
          const usage = await entitlementService.getUsage(tenantIdStr);
          const limit = await entitlementService.getEffectiveLimit(
            tenantIdStr,
            "tokensPerMonth",
          );
          const current = usage["tokensPerMonth"] ?? 0;
          logger.warn(
            {
              traceId,
              tenantId: tenantIdStr,
              tokensUsed,
              current,
              limit,
            },
            "tokensPerMonth quota exceeded (duplicate-key denial) — refusing intent query",
          );
          const periodReset = await resolvePeriodReset(
            entitlementService,
            tenantIdStr,
          );
          throw buildQuotaExceededError({
            dimension: "tokensPerMonth",
            current,
            limit,
            remaining: Math.max(0, limit - current),
            periodReset,
            canUpgrade:
              actor.actorRole === "SUPER_ADMIN" ||
              actor.actorRole === "COMPANY_ADMIN",
          });
        }

        logger.warn(
          { err: error, traceId, tenantId: tenantIdStr, tokensUsed },
          "Failed to enforce tokensPerMonth quota for intent query — continuing without token accounting",
        );
      }
    }

    // 7. Deterministic validation, ownership re-scoping and exact entity rules enforcement
    let validatedPlan: QueryPlan;

    if (rawOutput && !fallbackUsed) {
      // Re-verify that any referencedDocumentIds generated by LLM belong to the tenant
      if (Array.isArray(rawOutput.referencedDocumentIds)) {
        const outputDocIds = rawOutput.referencedDocumentIds.filter((id): id is string => typeof id === "string" && mongoose.Types.ObjectId.isValid(id));
        if (outputDocIds.length > 0) {
          const verifiedDocs = await DocumentModel.find({
            _id: { $in: outputDocIds },
            tenantId: actor.tenantId,
          }).select("_id").lean().exec();

          const verifiedIds = verifiedDocs.map(d => d._id.toString());
          rawOutput.referencedDocumentIds = verifiedIds;
        } else {
          rawOutput.referencedDocumentIds = [];
        }
      } else {
        rawOutput.referencedDocumentIds = [];
      }

      // Merge inputs' referenced doc IDs if not populated by LLM
      if (input.referencedDocumentIds && input.referencedDocumentIds.length > 0) {
        rawOutput.referencedDocumentIds = [
          ...new Set([
            ...((rawOutput.referencedDocumentIds as string[]) ?? []),
            ...input.referencedDocumentIds,
          ]),
        ];
      }

      // If semanticQueries/keywordQueries are empty, use local bilingual expansion
      if (!Array.isArray(rawOutput.semanticQueries) || rawOutput.semanticQueries.length === 0) {
        const expansion = expandBilingual(input.question, language, localEntities);
        rawOutput.semanticQueries = expansion.semanticQueries;
        rawOutput.keywordQueries = expansion.keywordQueries;
      }

      // Enforce preserveExact on entities
      if (Array.isArray(rawOutput.entities)) {
        rawOutput.entities = rawOutput.entities.map(e => {
          const isExact = ["clause_number", "date", "quoted_phrase", "document_title"].includes(e.type);
          return {
            ...e,
            preserveExact: isExact ? true : (e.preserveExact ?? false),
          };
        });
      }

      // Merge temporal constraints if not populated by LLM
      if (!Array.isArray(rawOutput.temporalConstraints) || rawOutput.temporalConstraints.length === 0) {
        rawOutput.temporalConstraints = localTemporalConstraints;
      }

      // Set confidence rules
      const rawConfidence = typeof rawOutput.intentConfidence === "number" ? rawOutput.intentConfidence : 0.8;
      const detectedIntent = (rawOutput.detectedIntent as string) || "knowledge_question";
      let clarificationNeeded = !!rawOutput.clarificationNeeded;
      let clarification = rawOutput.clarification || null;

      if (rawConfidence < 0.5 || detectedIntent === "unsupported") {
        clarificationNeeded = true;
        if (!clarification) {
          clarification = {
            reason: "ambiguous_intent",
            suggestedQuestions: [language === "ar" ? "ما هي سياسة الإجازات؟" : "What is the vacation policy?"],
            messageEn: "Could you please clarify your question?",
            messageAr: "هل يمكنك توضيح سؤالك من فضلك؟",
          };
        }
      }

      rawOutput.intentConfidence = rawConfidence;
      rawOutput.clarificationNeeded = clarificationNeeded;
      rawOutput.clarification = clarification;
      rawOutput.isFollowUp = isFollowUp;
      rawOutput.conversationContextUsed = contextUsed;

      validatedPlan = validateAndNormalizeQueryPlan(
        rawOutput,
        input.question,
        language,
        INTENT_PROMPT_VERSION,
        this.modelAdapter.providerKey,
        Date.now() - start,
        tokensUsed,
        estimatedCost,
        false
      );
    } else {
      // Deterministic fallback execution
      const expansion = expandBilingual(input.question, language, localEntities);
      const exactTerms = localEntities.filter(e => e.preserveExact).map(e => e.text);

      validatedPlan = validateAndNormalizeQueryPlan(
        {
          detectedIntent: "knowledge_question",
          intentConfidence: 0.3,
          language,
          entities: localEntities,
          temporalConstraints: localTemporalConstraints,
          exactTerms,
          semanticQueries: expansion.semanticQueries,
          keywordQueries: expansion.keywordQueries,
          clarificationNeeded: true,
          clarification: {
            reason: "ambiguous_intent",
            suggestedQuestions: ["Can you please clarify your request?"],
            messageEn: "We encountered an issue analyzing your query. Please rephrase or try again.",
            messageAr: "واجهنا مشكلة في تحليل سؤالك. يرجى إعادة الصياغة أو المحاولة مرة أخرى.",
          },
          isFollowUp,
          conversationContextUsed: contextUsed,
          referencedDocumentIds: input.referencedDocumentIds ?? [],
        },
        input.question,
        language,
        INTENT_PROMPT_VERSION,
        this.modelAdapter.providerKey,
        Date.now() - start,
        0,
        0,
        true
      );
    }

    // 8. Auditing
    let auditAction: "INTENT_QUERY_ANALYZED" | "INTENT_QUERY_CLARIFICATION_REQUESTED" | "INTENT_QUERY_FALLBACK_USED" = "INTENT_QUERY_ANALYZED";
    if (validatedPlan.processingMetadata.fallbackUsed) {
      auditAction = "INTENT_QUERY_FALLBACK_USED";
    } else if (validatedPlan.clarificationNeeded) {
      auditAction = "INTENT_QUERY_CLARIFICATION_REQUESTED";
    }

    await auditWriter.write({
      action: auditAction,
      resourceType: "IntentQuery",
      resourceId: "none",
      outcome: "SUCCESS",
      tenantId: tenantIdStr,
      actorId: actor.actorId,
      actorEmail: actor.actorEmail,
      actorRole: actor.actorRole,
      metadata: {
        intent: validatedPlan.detectedIntent,
        confidence: validatedPlan.intentConfidence,
        language: validatedPlan.language,
        clarificationNeeded: validatedPlan.clarificationNeeded,
        fallbackUsed: validatedPlan.processingMetadata.fallbackUsed,
      },
    });

    // Keep the tenant's historical question total in sync with successful
    // query responses. Quota enforcement remains separate and is handled by
    // the route guard/counter.
    try {
      await recordQuestionAsked({
        tenantId: tenantIdStr,
        requestId: context.requestId,
      });
    } catch (err) {
      logger.error({ err, traceId }, "Failed to record question usage");
    }

    // 9. Record Prometheus metrics
    recordIntentQueryMetrics(metricRecorder, validatedPlan, traceId);

    // Save trace for the debug endpoint in MongoDB
    try {
      await IntentQueryTraceModel.create({
        traceId,
        tenantId: actor.tenantId,
        queryPlan: validatedPlan,
        timing: {
          totalMs: Date.now() - start,
          languageDetectionMs: 2,
          entityExtractionMs: 3,
          llmMs: fallbackUsed ? 0 : Math.max(0, Date.now() - start - 5),
          postProcessingMs: 1,
        },
        promptVersion: INTENT_PROMPT_VERSION,
        modelVersion: this.modelAdapter.providerKey,
        rawEntities: localEntities,
        fallbackUsed: validatedPlan.processingMetadata.fallbackUsed,
      });
    } catch (err) {
      logger.error({ err, traceId }, "Failed to persist intent query trace in database");
    }

    return validatedPlan;
  }
}
