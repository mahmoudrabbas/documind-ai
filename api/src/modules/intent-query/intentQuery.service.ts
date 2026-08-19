import mongoose from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { authorizeTenantOperation, type OperationAuthorizationContext } from "../permissions/permissions.operation.js";
import { getAuditWriter, getMetricRecorder } from "../../common/observability/index.js";
import { logger } from "../../common/logger/logger.js";
import IntentQueryTraceModel from "../../db/models/intentQueryTrace.model.js";
import { recordQuestionAsked } from "../usage/usage.service.js";

import type { QueryPlan } from "./intentQuery.types.js";
import { extractEntities, extractTemporalConstraints } from "./intentQuery.entityExtractor.js";
import { expandBilingual } from "./intentQuery.bilingualExpander.js";
import { detectSocialMessage } from "./intentQuery.socialDetector.js";
import { detectAssistantIntent } from "./intentQuery.assistantDetector.js";
import { preprocessIntentText } from "./intentQuery.preprocessor.js";
import {
  assessPositiveKnowledgeSeeking,
  assistantRequestsUserResponse,
  hasDomainAgnosticQuestionShape,
  hasEnterpriseSubjectTerm,
  hasInterrogativeQuestionShape,
  hasSemanticRetrievalSubject,
  isContextualAcknowledgement,
  buildContextualFollowUpQuestion,
  hasSubstantivePriorTurn,
  isBareGeneralDefinitionText,
  isLikelyContextualFollowUp,
  isLikelyPriorDocumentTurn,
  isLikelyGibberish,
  isLikelySensitivePersonalDataRequest,
  isMaliciousSecurityRequest,
  isDirectCredentialValueRequest,
  isRetrievableIntent,
  selectSafeRetrievalQuestion,
} from "./intentQuery.knowledgeSignals.js";
import {
  extractNaturalDocumentTitleHints,
  resolveAuthorizedDocumentHints,
  RETRIEVABLE_DOCUMENT_STATUSES,
} from "./intentQuery.documentHints.js";
import { validateAnalyzeQuery, validateAndNormalizeQueryPlan } from "./intentQuery.validator.js";
import { buildIntentSystemPrompt, INTENT_SYSTEM_PROMPT, INTENT_SYSTEM_PROMPT_AR, INTENT_PROMPT_VERSION, type DocumentManifestEntry } from "./intentQuery.prompt.js";
import DocumentModel from "../../db/models/document.model.js";
import type { ConversationContextPort } from "./ports/conversationContext.port.js";
import type { ModelAdapter } from "../agents/agents.types.js";
import { recordIntentQueryMetrics } from "./intentQuery.metrics.js";
import {
  getDocumentAccessAuthorizationService,
  type DocumentAccessAuthorizationService,
} from "../document-access/documentAccess.authorization.service.js";
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
  actorId: string,
  authorizationService: DocumentAccessAuthorizationService,
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

    const authorizedDocs = await Promise.all(
      docs.map(async (doc) => {
        try {
          await authorizationService.authorizeDocumentAction(
            { tenantId: tenantIdStr, actorId },
            doc._id.toString(),
            "use_in_ai",
          );
          return doc;
        } catch (err) {
          logger.debug(
            {
              err,
              tenantId: tenantIdStr,
              actorId,
              documentId: doc._id.toString(),
            },
            "Excluded unauthorized document from intent manifest",
          );
          return null;
        }
      }),
    );

    return authorizedDocs.filter((doc): doc is NonNullable<typeof doc> => doc !== null).map((doc) => ({
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

/**
 * Provider intent labels that keep priority over the deterministic gibberish
 * clarification rewrite. Safety, assistant, and social routes are product-owned
 * boundaries, and Arabic social misspellings ("شجرا") are deliberately social.
 */
const GIBBERISH_PRESERVED_INTENTS: ReadonlySet<string> = new Set([
  "unsafe",
  "social",
  "assistant_identity",
  "assistant_capabilities",
]);

export class IntentQueryService {

  constructor(
    private readonly modelAdapter: ModelAdapter,
    private readonly conversationContextAdapter: ConversationContextPort,
    private readonly options: {
      /** Suppresses durable side effects only; authorization remains mandatory. */
      persistenceMode?: "production" | "ephemeral";
      authorizationService?: DocumentAccessAuthorizationService;
    } = {},
  ) {}

  /**
   * Orchestrates the query analysis workflow: input validation, authorization,
   * context loading, language detection, entity extraction, LLM query analysis,
   * post-processing/verification, auditing, and metric recording.
   */
  async analyzeQuery(
    rawInput: unknown,
    context: OperationAuthorizationContext,
    executionOptions: {
      tokenAccounting?: "internal" | "external";
    } = {},
  ): Promise<QueryPlan> {
    const start = Date.now();
    const traceId = context.traceId ?? `iq-${Date.now()}`;
    const auditWriter = getAuditWriter();
    const metricRecorder = getMetricRecorder();
    const entitlementService = getEntitlementService();
    const persistRuntimeArtifacts = this.options.persistenceMode !== "ephemeral";

    // 1. Input Validation
    const input = validateAnalyzeQuery(rawInput);

    // 2. Authorization Scoping
    const actor = await authorizeTenantOperation(context, Permission.CHAT_CREATE);
    const tenantIdStr = actor.tenantId.toString();

    // 3. Document ownership validation for inputs
    if (input.referencedDocumentIds && input.referencedDocumentIds.length > 0) {
      try {
        await authorizeExplicitIntentDocuments(
          this.options.authorizationService ?? getDocumentAccessAuthorizationService(), { tenantId: tenantIdStr, actorId: actor.actorId }, input.referencedDocumentIds,
        );
      } catch (error) {
        if (error instanceof AppError) {
          throw new AppError(403, "INTENT_QUERY_CONTEXT_UNAUTHORIZED", "Referenced document is not accessible in this tenant scope");
        }
        throw error;
      }
    }

    // 4. Determine language and entities early to handle fallback/clarification deterministically if needed
    const assistantIntent = detectAssistantIntent(input.question);
    const routingQuestion = assistantIntent.knowledgeRemainder ?? input.question;
    const preprocessed = preprocessIntentText(input.question);
    const language = preprocessed.language;
    const localEntities = extractEntities(routingQuestion, language);
    const localTemporalConstraints = extractTemporalConstraints(routingQuestion);
    const deterministicTitleHints = extractNaturalDocumentTitleHints(routingQuestion);

    // Check for prompt injections/unsafe inputs upfront deterministically.
    // Word-anchored so legitimate compound words ("hackathon policy") never
    // trigger the unsafe short-circuit while genuine injection attempts do.
    // Malicious/credential-theft requests and direct credential-VALUE requests
    // (asking for a stored secret, e.g. a database password or API key) are
    // also short-circuited: their answer is a secret, never a document fact.
    const hasUnsafeKeywords =
      containsUnsafeRoutingKeyword(input.question) ||
      isMaliciousSecurityRequest(input.question) ||
      isDirectCredentialValueRequest(input.question);
    if (hasUnsafeKeywords) {
      if (persistRuntimeArtifacts) await auditWriter.write({
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

      if (persistRuntimeArtifacts) {
        recordIntentQueryMetrics(metricRecorder, unsafePlan, traceId);
      }
      return unsafePlan;
    }

    // 4b. Deterministic assistant identity/capabilities route. This is a
    // product-owned response boundary: it executes no model, retrieval,
    // evidence, answer-writer, citation, or compliance work. Mixed turns are
    // deliberately excluded and continue below with their knowledge remainder.
    if (assistantIntent.isAssistantOnly && assistantIntent.kind) {
      const assistantPlan = validateAndNormalizeQueryPlan(
        {
          detectedIntent:
            assistantIntent.kind === "identity"
              ? "assistant_identity"
              : "assistant_capabilities",
          assistantKind: assistantIntent.kind,
          intentConfidence: 0.99,
          language,
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
        false,
      );

      if (persistRuntimeArtifacts) {
        recordIntentQueryMetrics(metricRecorder, assistantPlan, traceId);
      }
      if (persistRuntimeArtifacts) {
        try {
          await IntentQueryTraceModel.create({
            traceId,
            tenantId: actor.tenantId,
            queryPlan: assistantPlan,
            timing: {
              totalMs: Date.now() - start,
              languageDetectionMs: 1,
              entityExtractionMs: 0,
              llmMs: 0,
              postProcessingMs: 1,
            },
            promptVersion: INTENT_PROMPT_VERSION,
            modelVersion: this.modelAdapter.providerKey,
            rawEntities: [],
            fallbackUsed: false,
          });
        } catch (err) {
          logger.error({ err, traceId }, "Failed to persist intent query trace in database");
        }
      }
      return assistantPlan;
    }

    // 4c. Deterministic social fast-path — pure social exchanges never enter
    // retrieval, so no sources are ever attached to the response. Substantive
    // questions (including social-prefixed ones) are never classified here.
    const social = detectSocialMessage(input.question);
    const deferSocialForContext = Boolean(
      social.isSocial &&
      input.conversationId &&
      isContextualAcknowledgement(input.question),
    );
    const buildAndPersistSocialPlan = async (): Promise<QueryPlan> => {
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

      if (persistRuntimeArtifacts) {
        recordIntentQueryMetrics(metricRecorder, socialPlan, traceId);
      }

      if (persistRuntimeArtifacts) {
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
      }

      return socialPlan;
    };
    if (social.isSocial && !deferSocialForContext) {
      return buildAndPersistSocialPlan();
    }

    // 5. Deterministic unsupported request detector
    //
    // Conservative rule: questions that explicitly ask about current external
    // facts (prices now, weather today, latest news, yesterday's match score)
    // are outside the tenant document scope and should route to 'unsupported'.
    // Exemptions: when the user explicitly references documents or reports.
    function isLikelyExternalCurrent(question: string): boolean {
      return isLikelyExternalCurrentQuestion(question);
    }

    // Deterministic short-circuit: clear live external-data questions with NO
    // explicit document context must route to 'unsupported' and skip retrieval.
    const sensitivePersonalDataRequest = isLikelySensitivePersonalDataRequest(input.question);
    if (isLikelyExternalCurrent(input.question) || sensitivePersonalDataRequest) {
      // If the user explicitly references a document or report, do not short-circuit.
      const docIndicators = /(report|document|contract|agreement|policy|policies|ملف|مستند|تقرير|عقد|اتفاقية|في المستند|في التقرير|ما ورد في)/i;
      if (sensitivePersonalDataRequest || !docIndicators.test(input.question)) {
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

        if (persistRuntimeArtifacts) {
          recordIntentQueryMetrics(metricRecorder, unsupportedPlan, traceId);
        }

        if (persistRuntimeArtifacts) {
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
        }

        return unsupportedPlan;
      }
    }

    // 5. Load Conversation Context with strict tenant isolation
    const systemPrompt = (language === "ar" || language === "mixed") ? INTENT_SYSTEM_PROMPT_AR : INTENT_SYSTEM_PROMPT;
    const authorizationService =
      this.options.authorizationService ?? getDocumentAccessAuthorizationService();
    const tenantDocumentManifest = await loadTenantDocumentManifest(
      tenantIdStr,
      actor.actorId,
      authorizationService,
    );
    const systemPromptWithManifest = buildIntentSystemPrompt(systemPrompt, tenantDocumentManifest);
    const messagesPayload: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPromptWithManifest },
    ];
    let conversationHistoryAvailable = false;
    let latestAssistantMessage = "";
    let latestUserMessage = "";
    // Anchor for the deterministic contextual bridge: the most recent user
    // turn that itself carries document-knowledge signals, so a deictic
    // follow-up ("So it is 8 hours, correct?") after an acknowledgment or a
    // non-substantive turn still resolves against the topic turn (e.g. the
    // original P1/P2 question) instead of losing the subject.
    let contextualBridgeAnchor = "";

    if (input.conversationId) {
      try {
        const storedHistory = await this.conversationContextAdapter.getContext(
          tenantIdStr,
          actor.actorId,
          input.conversationId,
          input.maxContext
        );
        const history = [...storedHistory];
        if (
          input.currentMessageAlreadyPersisted &&
          history.at(-1)?.role === "user" &&
          history.at(-1)?.content.trim() === input.question.trim()
        ) {
          history.pop();
        }

        if (history.length > 0) {
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
          conversationHistoryAvailable = fitHistory.length > 0;
          latestAssistantMessage =
            [...fitHistory].reverse().find((message) => message.role === "assistant")?.content ?? "";
          latestUserMessage =
            [...fitHistory].reverse().find((message) => message.role === "user")?.content ?? "";
          // The bridge anchor is the latest user turn that itself carries
          // document-knowledge signals; a deictic continuation stays resolved
          // to the substantive topic turn even across an acknowledgment or a
          // non-substantive intermediate user message.
          contextualBridgeAnchor =
            [...fitHistory]
              .reverse()
              .find(
                (message) =>
                  message.role === "user" &&
                  isLikelyPriorDocumentTurn(message.content),
              )?.content ?? latestUserMessage;

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

    if (
      deferSocialForContext &&
      (!conversationHistoryAvailable || !assistantRequestsUserResponse(latestAssistantMessage))
    ) {
      return buildAndPersistSocialPlan();
    }

    // Generic contextual bridge, evaluated before provider routing. The
    // current turn is a short continuation-led question whose subject lives
    // in the most recent substantive user turn that carried document intent —
    // for ANY document topic (travel, procurement, onboarding, remote work,
    // ...). Provider labels must not be able to turn this valid cross-document
    // follow-up into an unsupported request or a 502.
    const deterministicContextualFollowUp =
      conversationHistoryAvailable &&
      contextualBridgeAnchor.length > 0 &&
      isLikelyContextualFollowUp(routingQuestion) &&
      hasSubstantivePriorTurn(contextualBridgeAnchor) &&
      !detectAssistantIntent(contextualBridgeAnchor).isAssistantOnly &&
      isLikelyPriorDocumentTurn(contextualBridgeAnchor);
    const deterministicFollowUpQuestion = deterministicContextualFollowUp
      ? buildContextualFollowUpQuestion(contextualBridgeAnchor, routingQuestion)
      : "";

    // Append the current question
    messagesPayload.push({
      role: "user",
      content: routingQuestion,
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
        maxTokens: Math.min(1000, input.maxTokens ?? 1000),
        structuredOutput: { type: "json_object" },
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
    if (tokensUsed > 0 && persistRuntimeArtifacts) {
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

      if (executionOptions.tokenAccounting !== "external") {
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
    }

    // 7. Deterministic validation, ownership re-scoping and exact entity rules enforcement
    let validatedPlan: QueryPlan;
    let titleClarificationNeeded = false;

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
      // A clear, explicitly marked natural-language document reference is
      // request-local and deterministic. Prefer it over provider wording so
      // identical requests cannot alternately constrain different documents
      // (or lose the constraint entirely) as model output varies.
      const titleHints = deterministicTitleHints.length > 0
        ? deterministicTitleHints
        : llmTitleHints;

      const hints = await resolveAuthorizedDocumentHints(mergedOutputIds, {
        tenantId: tenantIdStr,
        actorId: actor.actorId,
        tenantObjectId: new mongoose.Types.ObjectId(tenantIdStr),
      }, titleHints, { authorizationService: this.options.authorizationService });
      rawOutput.referencedDocumentIds = hints.referencedDocumentIds;
      rawOutput.referencedDocumentTitles = hints.referencedDocumentTitles;

      const providerIntent = rawOutput.detectedIntent;
      const semanticTopicWithoutExplicitTitle =
        (providerIntent === "summarization" || providerIntent === "knowledge_question") &&
        deterministicTitleHints.length === 0 &&
        hasSemanticRetrievalSubject(routingQuestion);

      // Deterministic title resolution governs explicit document references:
      // a title hint that resolves to more than one authorized document, or to
      // none at all, is a signal to clarify — never fabricate a match.
      if (
        deterministicTitleHints.length > 0 &&
        (hints.ambiguousTitleMatches || hints.unresolvedTitleHints.length > 0)
      ) {
        titleClarificationNeeded = true;
      }

      if (
        !semanticTopicWithoutExplicitTitle &&
        deterministicTitleHints.length === 0 &&
        (hints.ambiguousTitleMatches || hints.unresolvedTitleHints.length > 0)
      ) {
        titleClarificationNeeded = true;
      }

      const rawDetectedIntent = providerIntent;
      if (rawDetectedIntent === "assistant_identity") {
        rawOutput.assistantKind = "identity";
      } else if (rawDetectedIntent === "assistant_capabilities") {
        rawOutput.assistantKind = "capabilities";
      }
      // Unintelligible text must resolve the same way regardless of which label
      // the provider happened to attach to it: a retrievable label previously
      // clarified while `unsupported` (or any unversioned label) refused the
      // identical input as out-of-domain, making the route provider-dependent.
      const gibberishClarifiableIntent =
        typeof rawDetectedIntent !== "string" ||
        !GIBBERISH_PRESERVED_INTENTS.has(rawDetectedIntent);
      if (
        gibberishClarifiableIntent &&
        isLikelyGibberish(routingQuestion) &&
        !deterministicContextualFollowUp
      ) {
        // Unintelligible input is a clarification (ask the user to restate),
        // never an out-of-domain refusal and never RAG: gibberish must not be
        // sent to retrieval, and the user gets a chance to restate rather than
        // a misleading "outside the scope of company documents" reply. The
        // degraded deterministic fallback below stays source-less `unsupported`
        // instead: with no provider it cannot distinguish unintelligible input
        // from an unrecognized question, so it fails closed.
        rawOutput = {
          detectedIntent: "knowledge_question",
          normalizedQuestion: routingQuestion.trim(),
          intentConfidence: 0.99,
          language,
          entities: [],
          exactTerms: [],
          semanticQueries: [],
          keywordQueries: [],
          clarificationNeeded: true,
          clarification: {
            reason: "vague_reference",
            suggestedQuestions: [routingQuestion],
            messageEn: "I couldn't understand that. Could you please restate your question?",
            messageAr: "لم أفهم ما كتبته. هل يمكنك إعادة صياغة سؤالك من فضلك؟",
          },
        };
      } else if (!isRetrievableIntent(rawDetectedIntent) && rawDetectedIntent == null) {
        rawOutput.detectedIntent = "unsupported";
      }

      // Apply the bridge after parsing provider output so it also overrides
      // unsupported, low-confidence, and otherwise valid-but-wrong labels.
      if (deterministicContextualFollowUp) {
        rawOutput.detectedIntent = "follow_up";
        rawOutput.intentConfidence = Math.max(
          typeof rawOutput.intentConfidence === "number" ? rawOutput.intentConfidence : 0,
          0.85,
        );
        // When the provider already resolved the follow-up into a standalone
        // question, keep that resolution; the deterministic bridge question is
        // the fallback for unsupported, low-confidence, and malformed output.
        const providerResolvedFollowUp =
          rawDetectedIntent === "follow_up" &&
          typeof rawOutput.normalizedQuestion === "string" &&
          rawOutput.normalizedQuestion.trim().length > 0 &&
          rawOutput.normalizedQuestion.trim().toLowerCase() !==
            routingQuestion.trim().toLowerCase();
        if (!providerResolvedFollowUp) {
          rawOutput.normalizedQuestion = deterministicFollowUpQuestion;
        }
        rawOutput.clarificationNeeded = false;
        rawOutput.clarification = null;
      }

      const sourceLessUnsupportedContinuation =
        rawOutput.detectedIntent === "unsupported" &&
        isLikelyContextualFollowUp(routingQuestion) &&
        !deterministicContextualFollowUp;
      if (sourceLessUnsupportedContinuation) {
        rawOutput.semanticQueries = [];
        rawOutput.keywordQueries = [];
      } else if (
        !Array.isArray(rawOutput.semanticQueries) ||
        (rawOutput.semanticQueries.length === 0 &&
          !isLikelyGibberish(routingQuestion))
      ) {
        // Retrievable plans receive bounded local expansion when the provider
        // omitted search queries. Gibberish stays source-less: the rewrite
        // above already produced a clarification plan with empty queries.
        const expansion = expandBilingual(routingQuestion, language, localEntities);
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
      const detectedIntent = (rawOutput.detectedIntent as string) || "unsupported";
      const isFollowUp =
        conversationHistoryAvailable && detectedIntent === "follow_up";
      const normalizedQuestion =
        typeof rawOutput.normalizedQuestion === "string"
          ? rawOutput.normalizedQuestion.trim()
          : "";
      let clarificationNeeded = !!rawOutput.clarificationNeeded;
      let clarification = rawOutput.clarification || null;

      // A follow-up is safe to retrieve only after the intent model has
      // resolved it into a standalone question. Merely having prior messages
      // does not make a self-contained turn a follow-up. If context is missing
      // or resolution failed, clarify instead of searching with a vague or
      // contaminated transcript-derived query.
      if (detectedIntent === "follow_up" && !conversationHistoryAvailable) {
        clarificationNeeded = true;
        clarification = {
          reason: "missing_context",
          suggestedQuestions: [routingQuestion],
          messageEn: "Could you restate the question with the subject you mean?",
          messageAr: "هل يمكنك إعادة صياغة السؤال مع توضيح الموضوع المقصود؟",
        };
      } else if (
        isFollowUp &&
        (!normalizedQuestion ||
          normalizedQuestion === routingQuestion.trim())
      ) {
        clarificationNeeded = true;
        clarification = {
          reason: "missing_context",
          suggestedQuestions: [routingQuestion],
          messageEn: "Could you restate the question with the subject you mean?",
          messageAr: "هل يمكنك إعادة صياغة السؤال مع توضيح الموضوع المقصود؟",
        };
      }

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
      rawOutput.conversationContextUsed = isFollowUp;

      if (isFollowUp && normalizedQuestion) {
        const existingSemanticQueries = Array.isArray(rawOutput.semanticQueries)
          ? rawOutput.semanticQueries
          : [];
        rawOutput.semanticQueries = [
          { text: normalizedQuestion, language, weight: 1 },
          ...existingSemanticQueries.filter(
            (query) =>
              typeof query === "object" &&
              query !== null &&
              typeof (query as { text?: unknown }).text === "string" &&
              (query as { text?: unknown }).text !== normalizedQuestion,
          ),
        ].slice(0, 10);
      } else {
        // History is not allowed to alter a self-contained turn's executable
        // retrieval plan. Rebuild it from the current message and explicit
        // request-local document constraints. A fresh conversation has no
        // prior messages from which model document hints could have leaked, so
        // its revalidated model hints remain current-turn hints. Once history
        // exists, only deterministic title hints or explicit request IDs are
        // retained; other model fields are discarded as potentially
        // history-derived.
        const retainCurrentTurnDocumentHints =
          !conversationHistoryAvailable ||
          deterministicTitleHints.length > 0 ||
          (input.referencedDocumentIds?.length ?? 0) > 0;
        const safeRetrievalQuestion = isRetrievableIntent(detectedIntent)
          ? selectSafeRetrievalQuestion(
              routingQuestion,
              normalizedQuestion,
              [
                ...localEntities
                  .filter((entity) => entity.preserveExact || entity.type === "number")
                  .map((entity) => entity.text),
                ...deterministicTitleHints,
              ],
            )
          : routingQuestion.trim();
        rawOutput.normalizedQuestion = safeRetrievalQuestion;
        if (isRetrievableIntent(detectedIntent) && !isLikelyGibberish(routingQuestion)) {
          const currentExpansion = expandBilingual(
            safeRetrievalQuestion,
            language,
            localEntities,
          );
          rawOutput.semanticQueries = currentExpansion.semanticQueries;
          rawOutput.keywordQueries = currentExpansion.keywordQueries;
        } else {
          // Unsupported and other non-retrievable turns stay source-less:
          // no retrieval payload may survive for them.
          rawOutput.semanticQueries = [];
          rawOutput.keywordQueries = [];
        }
        rawOutput.referencedDocumentIds =
          retainCurrentTurnDocumentHints
            ? hints.referencedDocumentIds
            : (input.referencedDocumentIds ?? []);
        rawOutput.referencedDocumentTitles =
          retainCurrentTurnDocumentHints
            ? hints.referencedDocumentTitles
            : [];
        if (!retainCurrentTurnDocumentHints) {
          titleClarificationNeeded = false;
        }
      }

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

      // A provider plan is non-authoritative when it would suppress a current
      // turn that independently has strong, bounded enterprise/document
      // knowledge signals. This applies to valid-but-wrong classifications and
      // low-confidence clarification as well as schema-invalid output. Unsafe
      // remains a hard boundary EXCEPT for the narrow providerUnsafeRescue
      // below (provider-verdict-only unsafe with every deterministic gate
      // clear); deterministic assistant-only, social-only and external-current
      // requests already returned before the provider call.
      //
      // Additionally, a valid provider "unsupported" verdict never blocks a
      // well-formed question about an arbitrary topic: the corpus (not the
      // provider's topic judgement) is the authority, so the question is sent
      // to retrieval and the evidence gate decides. This also covers
      // schema-invalid provider output; gibberish stays fail-closed.
      const knowledgeSignals = assessPositiveKnowledgeSeeking(routingQuestion);
      const unsupportedQuestionOverride =
        validatedPlan.route === "unsupported" &&
        !isLikelyGibberish(routingQuestion) &&
        (deterministicTitleHints.length > 0 || (hasDomainAgnosticQuestionShape(routingQuestion) && (hasInterrogativeQuestionShape(routingQuestion) || hasEnterpriseSubjectTerm(routingQuestion)))) &&
        (!isLikelyContextualFollowUp(routingQuestion) || deterministicContextualFollowUp);
      // Narrow provider-"unsafe" rescue. The intent LLM is nondeterministic
      // and has misclassified well-formed enterprise knowledge questions (e.g.
      // "What is the company's unique security code?") as unsafe while the same
      // question routes to rag on other runs. When the provider alone marked
      // the turn unsafe, the turn is rescued to retrieval ONLY when every
      // deterministic safety gate is clear — no injection/bypass/theft, no
      // direct credential-VALUE request, no sensitive personal data, no
      // external-current request — AND the turn is a well-formed interrogative
      // with strong positive knowledge signals. Malicious, credential-value,
      // sensitive-PD and external-current turns keep failing closed below.
      const providerUnsafeRescue =
        validatedPlan.route === "unsafe" &&
        !isMaliciousSecurityRequest(input.question) &&
        !isDirectCredentialValueRequest(input.question) &&
        !isLikelySensitivePersonalDataRequest(input.question) &&
        !isLikelyExternalCurrentQuestion(input.question) &&
        hasDomainAgnosticQuestionShape(routingQuestion) &&
        hasInterrogativeQuestionShape(routingQuestion) &&
        knowledgeSignals.positive;
      const semanticSummarizationOverride =
        validatedPlan.detectedIntent === "summarization" &&
        validatedPlan.clarificationNeeded &&
        !titleClarificationNeeded &&
        hasSemanticRetrievalSubject(routingQuestion);
      const bareSummarizationClarification =
        validatedPlan.detectedIntent === "summarization" &&
        validatedPlan.clarificationNeeded &&
        !hasSemanticRetrievalSubject(routingQuestion);

      if (semanticSummarizationOverride) {
        rawOutput.clarificationNeeded = false;
        rawOutput.clarification = null;
        validatedPlan = validateAndNormalizeQueryPlan(
          rawOutput,
          input.question,
          language,
          INTENT_PROMPT_VERSION,
          this.modelAdapter.providerKey,
          Date.now() - start,
          tokensUsed,
          estimatedCost,
          false,
        );
      } else if (
        !bareSummarizationClarification &&
        ((knowledgeSignals.positive && validatedPlan.route !== "unsafe") || unsupportedQuestionOverride || providerUnsafeRescue) &&
        validatedPlan.route !== "rag"
      ) {
        const fallbackQuestion = knowledgeSignals.retrievalText;
        const expansion = expandBilingual(
          fallbackQuestion,
          language,
          localEntities,
        );
        validatedPlan = validateAndNormalizeQueryPlan(
          {
            detectedIntent: "knowledge_question",
            intentConfidence: knowledgeSignals.positive ? 0.75 : 0.6,
            normalizedQuestion: fallbackQuestion,
            language,
            entities: localEntities,
            temporalConstraints: localTemporalConstraints,
            exactTerms: localEntities
              .filter((entity) => entity.preserveExact)
              .map((entity) => entity.text),
            semanticQueries: expansion.semanticQueries,
            keywordQueries: expansion.keywordQueries,
            clarificationNeeded: false,
            clarification: null,
            isFollowUp: false,
            conversationContextUsed: false,
            referencedDocumentIds: hints.referencedDocumentIds,
            referencedDocumentTitles: hints.referencedDocumentTitles,
          },
          input.question,
          language,
          INTENT_PROMPT_VERSION,
          this.modelAdapter.providerKey,
          Date.now() - start,
          tokensUsed,
          estimatedCost,
          validatedPlan.processingMetadata.fallbackUsed,
        );
      }
        } else {
      // Deterministic fallback execution
      const knowledgeSignals = assessPositiveKnowledgeSeeking(routingQuestion);
      // When the intent provider is unavailable or returns malformed output,
      // a well-formed question may still target any uploaded-document topic.
      // Retrieval plus the evidence gate decides whether the corpus can answer;
      // the fallback must not require an enterprise keyword list.
      const isDeterministicFollowUp = deterministicContextualFollowUp;
      const normalizedRoutingText = preprocessIntentText(routingQuestion).elongationReducedText;
      const isBareDefinition = isBareGeneralDefinitionText(normalizedRoutingText);
      const corpusFirstQuestion =
        hasDomainAgnosticQuestionShape(routingQuestion) &&
        !isBareDefinition &&
        (!isLikelyContextualFollowUp(routingQuestion) || isDeterministicFollowUp);
      const isKnowledgeQuestion = knowledgeSignals.positive || corpusFirstQuestion;
      const fallbackQuestion = isDeterministicFollowUp
        ? deterministicFollowUpQuestion
        : knowledgeSignals.retrievalText || routingQuestion.trim();
      const expansion = isKnowledgeQuestion || isDeterministicFollowUp
        ? expandBilingual(fallbackQuestion, language, localEntities)
        : { semanticQueries: [], keywordQueries: [] };
      const exactTerms = localEntities.filter(e => e.preserveExact).map(e => e.text);
      const fallbackHints = await resolveAuthorizedDocumentHints(
        input.referencedDocumentIds ?? [],
        {
          tenantId: tenantIdStr,
          actorId: actor.actorId,
          tenantObjectId: new mongoose.Types.ObjectId(tenantIdStr),
        },
        deterministicTitleHints,
        { authorizationService: this.options.authorizationService },
      );
      if (
        deterministicTitleHints.length > 0 &&
        (fallbackHints.ambiguousTitleMatches || fallbackHints.unresolvedTitleHints.length > 0)
      ) {
        titleClarificationNeeded = true;
      }

      validatedPlan = validateAndNormalizeQueryPlan(
        {
          detectedIntent: isDeterministicFollowUp
            ? "follow_up"
            : isKnowledgeQuestion ? "knowledge_question" : "unsupported",
          intentConfidence: isDeterministicFollowUp ? 0.85 : knowledgeSignals.positive ? 0.75 : 0,
          normalizedQuestion: fallbackQuestion,
          language,
          entities: localEntities,
          temporalConstraints: localTemporalConstraints,
          exactTerms,
          semanticQueries: expansion.semanticQueries,
          keywordQueries: expansion.keywordQueries,
          clarificationNeeded: false,
          clarification: null,
          isFollowUp: isDeterministicFollowUp,
          conversationContextUsed: isDeterministicFollowUp,
          referencedDocumentIds: fallbackHints.referencedDocumentIds,
          referencedDocumentTitles: fallbackHints.referencedDocumentTitles,
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

    // 7b. Assistant plans are source-less by contract even if a provider
    // recognized a natural variant outside the deterministic fast path.
    if (
      assistantIntent.kind &&
      !assistantIntent.isAssistantOnly &&
      validatedPlan.route === "rag"
    ) {
      // Preserve the independent assistant request while keeping the
      // knowledge remainder on the normal RAG route.
      validatedPlan.assistantKind = assistantIntent.kind;
    }
    if (validatedPlan.route === "assistant") {
      validatedPlan.semanticQueries = [];
      validatedPlan.keywordQueries = [];
      validatedPlan.exactTerms = [];
      validatedPlan.referencedDocumentIds = [];
      validatedPlan.referencedDocumentTitles = [];
      validatedPlan.departments = [];
      validatedPlan.categories = [];
    }

    // 7c. Social subtype resolution: the deterministic detector is the
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

    // 7d. Title-hint ambiguity/unresolved references force a clarification.
    // A provider may label a semantic summarization subject as an exact title
    // and set clarificationNeeded=true when that title is not found. For a
    // normal topic request, the retrieval pipeline is the resolver; only
    // explicit filename/document-marker hints are allowed to force title
    // clarification.
    const semanticClarificationEligible = new Set([
      "knowledge_question",
      "document_specific",
      "comparison",
      "summarization",
      "navigation",
    ]).has(validatedPlan.detectedIntent);
    if (
      semanticClarificationEligible &&
      validatedPlan.clarificationNeeded &&
      !titleClarificationNeeded &&
      !isLikelyGibberish(routingQuestion) &&
      hasSemanticRetrievalSubject(routingQuestion)
    ) {
      validatedPlan.clarificationNeeded = false;
      validatedPlan.clarification = null;
      validatedPlan.route = "rag";
    }

    // 7e. Explicit title-hint ambiguity/unresolved references force a
    // clarification after the semantic safeguard above.
    if (titleClarificationNeeded) {
      validatedPlan.route = "clarification";
      validatedPlan.clarificationNeeded = true;
      validatedPlan.clarification = {
        reason: "multiple_interpretations",
        suggestedQuestions: [language === "ar" ? "أي وثيقة تقصد؟" : "Which document are you referring to?"],
        messageEn: "I couldn't identify the exact document you're referring to. Could you clarify the document name?",
        messageAr: "لم أتمكن من تحديد الوثيقة المقصودة بدقة. هل يمكنك توضيح اسم الوثيقة؟",
      };
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

    if (persistRuntimeArtifacts) await auditWriter.write({
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
    if (persistRuntimeArtifacts) {
      try {
        await recordQuestionAsked({
          tenantId: tenantIdStr,
          requestId: context.requestId,
        });
      } catch (err) {
        logger.error({ err, traceId }, "Failed to record question usage");
      }
    }

    // 9. Record Prometheus metrics
    if (persistRuntimeArtifacts) {
      recordIntentQueryMetrics(metricRecorder, validatedPlan, traceId);
    }

    // Save trace for the debug endpoint in MongoDB
    if (persistRuntimeArtifacts) {
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
    }

    return validatedPlan;
  }
}

// ── Exported deterministic routing predicates ──────────────────────────────

/**
 * Word-anchored unsafe/injection detector. Legitimate compound words such as
 * "hackathon policy" must reach RAG; genuine injection attempts ("hack the
 * assistant", "ignore previous instructions") still short-circuit to unsafe.
 */
export function containsUnsafeRoutingKeyword(question: string): boolean {
  return /\bunsafe\b|\bhack(?:s|ing|ed|er)?\b|ignore\s+previous|system\s+prompt/i.test(question);
}

/**
 * Deterministic external/current-data detector. Questions about live external
 * facts (prices now, weather today, latest news) route to unsupported UNLESS
 * the user explicitly references tenant documents — including contracts,
 * agreements, and policies, so "latest prices in the vendor contract" reaches
 * RAG retrieval.
 */
export function isLikelyExternalCurrentQuestion(question: string): boolean {
  const q = question.toLowerCase();
  const temporal = /\b(?:today|now|yesterday|latest)\b|this (?:morning|evening)|الآن|اليوم|أمس|آخر/i;
  const topics = /\b(?:gold|dollar|weather|news|score)\b|الذهب|دollar|طقس|أخبار|نتيجة|مباراة|أسعار/i;
  const docIndicators = /(report|document|contract|agreement|policy|policies|ملف|مستند|تقرير|عقد|اتفاقية|في المستند|في التقرير|ما ورد في)/i;
  if (docIndicators.test(q)) return false;
  const clearlyExternalGeneral = /(?:capital of|weather|طقس|latest news|اخر الاخبار|نتيجه مباراه|match score|recipe|وصفه|who is (?:the )?president)/i;
  return (temporal.test(q) && topics.test(q)) || clearlyExternalGeneral.test(q);
}
