import mongoose from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { authorizeTenantOperation, type OperationAuthorizationContext } from "../permissions/permissions.operation.js";
import { getAuditWriter, getMetricRecorder } from "../../common/observability/index.js";
import { logger } from "../../common/logger/logger.js";
import IntentQueryTraceModel from "../../db/models/intentQueryTrace.model.js";
import { recordQuestionAsked } from "../usage/usage.service.js";

import type { QueryLanguageValue, QueryPlan } from "./intentQuery.types.js";
import { detectLanguage } from "./intentQuery.languageDetector.js";
import { extractEntities, extractTemporalConstraints } from "./intentQuery.entityExtractor.js";
import { expandBilingual } from "./intentQuery.bilingualExpander.js";
import { detectSocialMessage } from "./intentQuery.socialDetector.js";
import { resolveAuthorizedDocumentHints, RETRIEVABLE_DOCUMENT_STATUSES } from "./intentQuery.documentHints.js";
import { validateAnalyzeQuery, validateAndNormalizeQueryPlan } from "./intentQuery.validator.js";
import { buildIntentSystemPrompt, INTENT_SYSTEM_PROMPT, INTENT_SYSTEM_PROMPT_AR, INTENT_PROMPT_VERSION, type DocumentManifestEntry } from "./intentQuery.prompt.js";
import { translateQuery, buildTranslatedQueries } from "./intentQuery.translator.js";
import DocumentModel from "../../db/models/document.model.js";
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

/**
 * Loads a bounded, tenant-scoped manifest of retrievable documents
 * (file name, title, aliases) so the intent router can recognize document
 * references the user phrases in their own words. Only document identifiers
 * are exposed — never content. Downstream document resolution still performs
 * tenant + actor authorization before any document is referenced.
 */
async function loadTenantDocumentManifest(
  tenantIdStr: string,
): Promise<DocumentManifestEntry[]> {
  try {
    const docs = await DocumentModel.find({
      tenantId: new mongoose.Types.ObjectId(tenantIdStr),
      deletedAt: null,
      isArchived: false,
      status: { $in: RETRIEVABLE_DOCUMENT_STATUSES },
    })
      .select("_id fileName metadata.title metadata.aliases")
      .sort({ createdAt: -1 })
      .limit(150)
      .lean()
      .exec();

    return docs.map((doc) => ({
      fileName: doc.fileName ?? "",
      title: (doc.metadata?.title as string | null) ?? null,
      aliases: Array.isArray(doc.metadata?.aliases)
        ? (doc.metadata.aliases as string[])
        : [],
    }));
  } catch (err) {
    logger.warn({ err, tenantId: tenantIdStr }, "Failed to load document manifest for intent analysis");
    return [];
  }
}

function normalizeManifestText(text: string): string {
  return String(text ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Deterministic guard: did the user's question reference any known document
 * identifier (file name, title, alias)? Used to rescue questions the router
 * misclassifies as "unsupported" — if the user clearly pointed at a document,
 * the query must reach retrieval.
 */
function matchesManifestQuestion(
  question: string,
  manifest: DocumentManifestEntry[],
): boolean {
  if (manifest.length === 0) return false;
  const q = normalizeManifestText(question);
  if (!q) return false;

  for (const entry of manifest) {
    const identifiers = [entry.fileName, entry.title, ...entry.aliases]
      .filter((s): s is string => Boolean(s && s.trim()))
      .map((s) => normalizeManifestText(s));
    for (const identifier of identifiers) {
      if (identifier.length < 3) continue;
      if (q.includes(identifier)) return true;
      const identifierWords = identifier.split(" ");
      if (
        identifierWords.length > 1 &&
        identifierWords.every((w) => w.length >= 3 && q.includes(w))
      ) {
        return true;
      }
    }
  }
  return false;
}

export class IntentQueryService {

  constructor(
    private readonly modelAdapter: ModelAdapter,
    private readonly conversationContextAdapter: ConversationContextPort
  ) {}

  /**
   * Augments the validated query plan with cross-lingual translations of the
   * user question so retrieval can find content in the complementary language
   * (e.g. an English question searched against Arabic documents). Fail-open:
   * any translation failure leaves the plan unchanged.
   */
  private async augmentPlanWithTranslation(
    plan: QueryPlan,
    question: string,
    language: QueryLanguageValue,
    traceId: string,
  ): Promise<void> {
    if (plan.detectedIntent === "social" || plan.detectedIntent === "unsafe") {
      return;
    }
    const counterpart = language === "en" ? "ar" : language === "ar" ? "en" : "mixed";

    let translated;
    try {
      translated = await translateQuery(
        this.modelAdapter.complete.bind(this.modelAdapter),
        question,
        language,
      );
    } catch (err) {
      logger.warn({ err, traceId }, "Query translation failed, continuing without it");
      return;
    }

    const { semanticTexts, keywordTerms } = buildTranslatedQueries(
      question,
      language,
      translated,
    );

    for (const text of semanticTexts) {
      if (plan.semanticQueries.length >= 10) break;
      plan.semanticQueries.push({
        text,
        language: counterpart,
        weight: 0.85,
      });
    }
    for (const terms of keywordTerms) {
      if (plan.keywordQueries.length >= 10) break;
      plan.keywordQueries.push({
        terms,
        language: counterpart,
        mustMatch: false,
      });
    }
  }

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

    // 4b. Deterministic social fast-path — pure social exchanges never enter
    // retrieval, so no sources are ever attached to the response. Substantive
    // questions (including social-prefixed ones) are never classified here.
    const social = detectSocialMessage(input.question);
    if (social.isSocial) {
      const socialPlan = validateAndNormalizeQueryPlan(
        {
          detectedIntent: "social",
          intentConfidence: 0.95,
          language,
          socialSubtype: social.subtype ?? "acknowledgement",
          entities: [],
          temporalConstraints: [],
          referencedDocumentIds: [],
          referencedDocumentTitles: [],
          departments: [],
          categories: [],
          exactTerms: [],
          semanticQueries: [],
          keywordQueries: [],
          clarificationNeeded: false,
          clarification: null,
          isFollowUp: false,
          conversationContextUsed: false,
          normalizedQuestion: input.question.trim(),
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

      recordIntentQueryMetrics(metricRecorder, socialPlan, traceId);

      try {
        await IntentQueryTraceModel.create({
          traceId,
          tenantId: actor.tenantId,
          queryPlan: socialPlan,
          timing: {
            totalMs: Date.now() - start,
            languageDetectionMs: 2,
            entityExtractionMs: 0,
            llmMs: 0,
            postProcessingMs: 1,
          },
          promptVersion: INTENT_PROMPT_VERSION,
          modelVersion: this.modelAdapter.providerKey,
          rawEntities: localEntities,
          fallbackUsed: false,
        });
      } catch (err) {
        logger.error({ err, traceId }, "Failed to persist intent query trace in database");
      }

      return socialPlan;
    }

    // 5. Deterministic unsupported external/current-data detector
    //
    // Conservative rule: questions that explicitly ask about current external
    // facts (prices now, weather today, latest news, yesterday's match score)
    // are outside the tenant document scope and should route to 'unsupported'.
    // Exemptions: when the user explicitly references documents or reports.
    function isLikelyExternalCurrent(question: string): boolean {
      const q = question.toLowerCase();
      // Temporal markers that imply 'current' or 'latest' (no word-boundary
      // anchors because Arabic tokens may not be matched by \b reliably).
      const temporal = /(today|now|yesterday|latest|this (morning|evening)|الآن|اليوم|أمس|آخر)/i;
      // Topics typically requiring live external data
      const topics = /(gold|الذهب|dollar|دollar|weather|طقس|news|أخبار|score|نتيجة|مباراة|أسعار)/i;
      // Phrases that indicate the user is asking about a document/report
      const docIndicators = /(report|document|ملف|مستند|تقرير|في المستند|في التقرير|ما ورد في)/i;

      if (!temporal.test(q)) return false;
      if (!topics.test(q)) return false;
      if (docIndicators.test(q)) return false;
      return true;
    }

    // Deterministic short-circuit: clear live external-data questions with NO
    // explicit document context must route to 'unsupported' and skip retrieval.
    if (isLikelyExternalCurrent(input.question)) {
      // If the user explicitly references a document or report, do not short-circuit.
      const docIndicators = /(report|document|ملف|مستند|تقرير|في المستند|في التقرير|ما ورد في)/i;
      if (!docIndicators.test(input.question)) {
        const unsupportedPlan = validateAndNormalizeQueryPlan(
          {
            detectedIntent: "unsupported",
            intentConfidence: 0.99,
            language,
            entities: localEntities,
            exactTerms: [],
            semanticQueries: [],
            keywordQueries: [],
            clarificationNeeded: false,
            clarification: null,
            isFollowUp: false,
            conversationContextUsed: false,
            normalizedQuestion: input.question.trim(),
          },
          input.question,
          language,
          INTENT_PROMPT_VERSION,
          this.modelAdapter.providerKey,
          Date.now() - start,
          0,
          0,
          false,
        );

        recordIntentQueryMetrics(metricRecorder, unsupportedPlan, traceId);

        try {
          await IntentQueryTraceModel.create({
            traceId,
            tenantId: actor.tenantId,
            queryPlan: unsupportedPlan,
            timing: {
              totalMs: Date.now() - start,
              languageDetectionMs: 1,
              entityExtractionMs: 1,
              llmMs: 0,
              postProcessingMs: 1,
            },
            promptVersion: INTENT_PROMPT_VERSION,
            modelVersion: this.modelAdapter.providerKey,
            rawEntities: localEntities,
            fallbackUsed: false,
          });
        } catch (err) {
          logger.error({ err, traceId }, "Failed to persist intent query trace in database");
        }

        return unsupportedPlan;
      }
    }

    // 5. Load Conversation Context with strict tenant isolation
    const systemPrompt = (language === "ar" || language === "mixed") ? INTENT_SYSTEM_PROMPT_AR : INTENT_SYSTEM_PROMPT;
    const tenantDocumentManifest = await loadTenantDocumentManifest(tenantIdStr);
    const systemPromptWithManifest = buildIntentSystemPrompt(systemPrompt, tenantDocumentManifest);
    const messagesPayload: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPromptWithManifest },
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
    let titleClarificationNeeded = false;
    let titleHintsUnresolved = false;

    if (rawOutput && !fallbackUsed) {
      // Re-verify referencedDocumentIds generated by the LLM: tenant-scoped,
      // actor/`use_in_ai` authorized, and title-resolved. Inaccessible
      // documents are silently dropped — model-generated IDs are never trusted.
      const mergedOutputIds = Array.isArray(rawOutput.referencedDocumentIds)
        ? [
            ...new Set([
              ...(rawOutput.referencedDocumentIds as string[]),
              ...((input.referencedDocumentIds as string[] | undefined) ?? []),
            ]),
          ]
        : (input.referencedDocumentIds ?? []);

      const llmTitleHints = Array.isArray(rawOutput.referencedDocumentTitles)
        ? (rawOutput.referencedDocumentTitles as string[])
        : [];

      const hints = await resolveAuthorizedDocumentHints(mergedOutputIds, {
        tenantId: tenantIdStr,
        actorId: actor.actorId,
        tenantObjectId: new mongoose.Types.ObjectId(tenantIdStr),
      }, llmTitleHints);
      rawOutput.referencedDocumentIds = hints.referencedDocumentIds;
      rawOutput.referencedDocumentTitles = hints.referencedDocumentTitles;

      // Deterministic title resolution governs explicit document references:
      // an ambiguous hint (more than one authorized document) is a signal to
      // clarify — never fabricate a match. Unresolved hints are NOT a dead-end:
      // they degrade to (optionally filtered) RAG so retrieval can still find
      // the right content.
      if (llmTitleHints.length > 0) {
        titleHintsUnresolved = hints.unresolvedTitleHints.length > 0;
        if (hints.ambiguousTitleMatches) {
          titleClarificationNeeded = true;
        }
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

    // 7b. Social subtype resolution: the deterministic detector is the
    // authority on social subtype; an LLM-reported social route gets its
    // subtype from the detector when available, otherwise keeps the
    // validated subtype (never fabricate a subtype).
    if (validatedPlan.route === "social") {
      const social = detectSocialMessage(input.question);
      validatedPlan.socialSubtype =
        social.isSocial && social.subtype
          ? social.subtype
          : validatedPlan.socialSubtype;
    }

    // 7b-2. Cross-lingual query translation: augment retrieval queries with a
    // translated counterpart so content in the other language is searchable.
    await this.augmentPlanWithTranslation(
      validatedPlan,
      input.question,
      language,
      traceId,
    );

    // 7c. Title-hint resolution outcomes. Genuine ambiguity between multiple
    // authorized documents forces a clarification — never guess. Unresolved
    // hints are not a dead-end: they keep the RAG path so retrieval (and the
    // cross-lingual translation above) can still surface the right content.
    if (titleClarificationNeeded) {
      validatedPlan.route = "clarification";
      validatedPlan.clarificationNeeded = true;
      validatedPlan.clarification = {
        reason: "multiple_interpretations",
        suggestedQuestions: [language === "ar" ? "أي وثيقة تقصد؟" : "Which document are you referring to?"],
        messageEn: "I couldn't identify the exact document you're referring to. Could you clarify the document name?",
        messageAr: "لم أتمكن من تحديد الوثيقة المقصودة بدقة. هل يمكنك توضيح اسم الوثيقة؟",
      };
    } else if (titleHintsUnresolved) {
      validatedPlan.route = "rag";
      validatedPlan.clarificationNeeded = false;
      validatedPlan.clarification = null;
    }

    // 7d. The router may classify a document-referential question as
    // "unsupported" when it cannot map the user's phrasing to a title. When
    // the question deterministically references a document in the tenant
    // manifest, rescue it to RAG so retrieval can answer from content.
    if (
      validatedPlan.detectedIntent === "unsupported" &&
      !validatedPlan.processingMetadata.fallbackUsed &&
      matchesManifestQuestion(input.question, tenantDocumentManifest)
    ) {
      validatedPlan.detectedIntent = "knowledge_question";
      validatedPlan.route = "rag";
      validatedPlan.clarificationNeeded = false;
      validatedPlan.clarification = null;
      validatedPlan.intentConfidence = Math.max(
        validatedPlan.intentConfidence,
        0.5,
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
