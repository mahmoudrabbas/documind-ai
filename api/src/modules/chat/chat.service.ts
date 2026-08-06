import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { AppError } from "../../common/errors/AppError.js";
import {
  ATTACHMENT_NOT_FOUND,
  LLM_PROVIDER_UNAVAILABLE,
  VALIDATION_ERROR,
  VISION_STORAGE_FAILED,
  VISION_UNAVAILABLE,
} from "../../common/errors/errorCodes.js";
import { logger } from "../../common/logger/logger.js";
import { getAuditWriter } from "../../common/observability/index.js";
import {
  authorizeTenantOperation,
  type OperationAuthorizationContext,
} from "../permissions/permissions.operation.js";
import { Permission } from "../permissions/permissions.catalog.js";
import type { HybridRetrievalService } from "../retrieval/retrieval.service.js";
import type { AccessContext, RetrievalCandidate } from "../retrieval/retrieval.types.js";
import type { EvidenceBundle } from "../reranker/reranker.types.js";
import {
  EVIDENCE_ITEM_MIN_TOTAL_SCORE,
  isSufficientBundle,
} from "../reranker/reranker.types.js";
import type { ModelAdapter } from "../agents/agents.types.js";
import { getIntentQueryService } from "../intent-query/intentQuery.factory.js";
import { z } from "zod";
import type { QueryPlan } from "../intent-query/intentQuery.types.js";
import { getTenantSettings } from "../settings/settings.service.js";
import DocumentModel from "../../db/models/document.model.js";
import type { MessageAttachment } from "../../db/models/message.model.js";
import type {
  ChatAttachment,
  ChatSource,
  ChatResponse,
  ChatVisionResponse,
  ConversationListItem,
  ConversationMessageDetail,
  ConversationListResponse,
  ConversationMessagesResponse,
} from "./chat.types.js";
import {
  ChatSendBodySchema,
  type ChatSendBody,
  ChatListConversationsQuerySchema,
  ChatVisionBodySchema,
  type ChatVisionBody,
} from "./chat.validator.js";
import * as chatRepo from "./chat.repository.js";
import { mapLlmProviderError } from "../../providers/llm/providerError.js";
import {
  sanitizeAssistantOutput,
  hasUnclosedReasoningBlock,
} from "../../providers/llm/outputSanitizer.js";
import {
  getVisionAdapter,
  type VisionAdapter,
} from "../../providers/llm/visionAdapter.js";
import { storageProvider } from "../../providers/storage/index.js";
import type { StorageProvider } from "../../providers/storage/types.js";
import { validateVisionFile } from "./chat.vision.js";
import { MongoUsageEventWriter } from "../analytics/adapters/mongo-usage-event-writer.js";
import { CostService } from "../analytics/cost.service.js";
import { getLangfuse } from "../../providers/observability/langfuse.js";

const RAG_SYSTEM_PROMPT = `You are DocuMind AI, an assistant that answers ONLY from the provided document context. Return JSON ONLY (no prose) with the exact keys: {"decision","answer","citedChunkIds"}. decision must be one of: "grounded_answer","insufficient_evidence","clarification","unsupported","unsafe". answer must be a concise string in the user's language. citedChunkIds must be an array of chunkId strings (may be empty for non-grounded decisions). Do NOT include any other keys, citations, or markdown fences.`;
const RAG_SYSTEM_PROMPT_NO_CITATIONS = `You are DocuMind AI, an intelligent assistant that answers questions based on company documents. You must ONLY answer using the provided context from the company's knowledge base. If the context does not contain enough information to answer the question, say so clearly. Never make up information. Be concise and helpful. Do not include any citations, source references, footnotes, document titles, or page numbers in your answer.`;
const RAG_SUMMARY_SYSTEM_PROMPT = `You are DocuMind AI, an assistant that answers ONLY from the provided document context. Return JSON ONLY (no prose) with the exact keys: {"decision","answer","citedChunkIds"}. decision must be one of: "grounded_answer","insufficient_evidence","clarification","unsupported","unsafe". answer must be a structured summary in the user's language written ONLY from the provided context: a short opening statement, then several distinct evidence-grounded points organized as paragraphs or bullet points, and a brief conclusion when the context supports one. Do not invent facts, figures, or points that are not present in the context. If the evidence supports only one point, give a short summary of that point rather than padding with fabricated content. If the context is insufficient, set decision to "insufficient_evidence" and answer a short message explaining that no evidence supports a summary. citedChunkIds must be an array of chunkId strings for the sources you actually used (may be empty for non-grounded decisions). Do NOT include any other keys, citations, or markdown fences.`;
const RAG_SUMMARY_SYSTEM_PROMPT_NO_CITATIONS = `You are DocuMind AI, an intelligent assistant that answers based on company documents. You must ONLY answer using the provided context from the company's knowledge base. Write a structured summary in the user's language: a short opening, then several distinct points grounded in the context organized as paragraphs or bullet points, and a brief conclusion when supported. Never make up information or points that are not present in the context. If the context does not contain enough information for a summary, say so clearly. Do not include any citations, source references, footnotes, document titles, or page numbers in your answer.`;
const INSUFFICIENT_AUTHORIZED_EVIDENCE = "I don't have sufficient authorized evidence to answer that question.";
const INSUFFICIENT_AUTHORIZED_EVIDENCE_AR =
  "لا توجد أدلة كافية مصرّح بها للإجابة على هذا السؤال.";

/**
 * Answer-task classification separates the *retrieval route* (social | rag |
 * clarification | unsupported | unsafe) from the *answer style* the generator
 * should produce. Summary requests must not be forced into the concise style
 * used for direct questions.
 */
export type AnswerTask = "direct_question" | "document_summary";

const DEFAULT_MAX_TOKENS = 1024;
const SUMMARY_MAX_TOKENS = 2048;
const DIRECT_TOP_K = 5;
const SUMMARY_TOP_K = 12;
const SUMMARY_MAX_SOURCES = 8;
const SUMMARY_CONTEXT_CHARS = 24_000;

// Deterministic summary-task signals. The summarization intent from the query
// planner wins, then depth/summary phrases in the original message. Arabic is
// matched with plain substring checks (no \b word boundaries).
const SUMMARY_TASK_PATTERNS: readonly string[] = [
  "لخص",
  "ملخص",
  "أعطني ملخصاً",
  "أعطني ملخصا",
  "اعطني ملخصاً",
  "اعطني ملخصا",
  "أهم النقاط",
  "اهم النقاط",
  "النقاط الرئيسية",
  "النقاط الرئيسيه",
  "خلاصة",
  "بالتفصيل",
  "summarize",
  "summarise",
  "summary",
  "key points",
  "main points",
  "detailed summary",
  "in detail",
  "recap",
  "overview",
];

export function detectAnswerTask(
  plan: Pick<QueryPlan, "detectedIntent"> | null | undefined,
  message: string,
): AnswerTask {
  if (plan?.detectedIntent === "summarization") return "document_summary";
  const text = message.trim().toLowerCase();
  for (const pattern of SUMMARY_TASK_PATTERNS) {
    if (text.includes(pattern.toLowerCase())) return "document_summary";
  }
  return "direct_question";
}

function systemPromptFor(task: AnswerTask, citationsEnabled: boolean): string {
  if (task === "document_summary") {
    return citationsEnabled
      ? RAG_SUMMARY_SYSTEM_PROMPT
      : RAG_SUMMARY_SYSTEM_PROMPT_NO_CITATIONS;
  }
  return citationsEnabled ? RAG_SYSTEM_PROMPT : RAG_SYSTEM_PROMPT_NO_CITATIONS;
}

/**
 * Bounded, evidence-gated generation context for whole-document summaries.
 * Preserves the reranker-approved order but prefers section/page diversity so
 * the generator does not receive the same narrow passage repeatedly, and keeps
 * a fixed maximum number of chunks and a context-token budget. Direct questions
 * are never bounded here — they keep every authorized survivor.
 */
export function boundSummaryContext(
  candidates: RetrievalCandidate[],
): RetrievalCandidate[] {
  if (candidates.length === 0) return [];
  const picked: RetrievalCandidate[] = [];
  const seenPageKeys = new Set<string>();
  let totalChars = 0;
  for (const candidate of candidates) {
    if (picked.length >= SUMMARY_MAX_SOURCES) break;
    const pageKey = `${candidate.documentId}:${candidate.pageNumber ?? 0}`;
    if (picked.length > 0 && seenPageKeys.has(pageKey)) continue;
    if (
      picked.length > 0 &&
      totalChars + (candidate.text?.length ?? 0) > SUMMARY_CONTEXT_CHARS
    ) {
      break;
    }
    picked.push(candidate);
    seenPageKeys.add(pageKey);
    totalChars += candidate.text?.length ?? 0;
  }
  return picked;
}

function ragContextInstruction(citationsEnabled: boolean): string {
  return citationsEnabled
    ? "Use the following context to answer the question. Always cite your sources."
    : "Use the following context to answer the question. Do not mention or cite your sources, documents, or page numbers in the answer.";
}

const SOCIAL_REPLIES: Record<
  "ar" | "en",
  Record<import("../intent-query/intentQuery.types.js").SocialSubtypeValue, string>
> = {
  ar: {
    greeting: "مرحباً! كيف يمكنني مساعدتك اليوم؟",
    thanks: "على الرحب والسعة! يسعدني مساعدتك.",
    farewell: "مع السلامة! أتمنى لك يوماً سعيداً.",
    acknowledgement: "تمام، أنا جاهز لمساعدتك.",
    wellbeing: "أنا بخير، شكراً لسؤالك! كيف يمكنني مساعدتك؟",
  },
  en: {
    greeting: "Hello! How can I help you today?",
    thanks: "You're welcome! Happy to help.",
    farewell: "Goodbye! Have a great day.",
    acknowledgement: "Got it — I'm here to help.",
    wellbeing: "I'm doing well, thanks for asking! How can I help you?",
  },
};

function socialReplyFor(
  language: "ar" | "en" | "mixed",
  subtype: import("../intent-query/intentQuery.types.js").SocialSubtypeValue,
): string {
  return SOCIAL_REPLIES[language === "ar" ? "ar" : "en"][subtype] ??
    (language === "ar"
      ? "مرحباً! كيف يمكنني مساعدتك اليوم؟"
      : "Hello! How can I help you today?");
}

function unsupportedReplyFor(language: "ar" | "en" | "mixed"): string {
  return language === "ar"
    ? "هذا السؤال خارج نطاق وثائق الشركة. يمكنني مساعدتك في الأسئلة المتعلقة بسياسات الشركة ووثائقها."
    : "This question is outside the scope of company documents. I can help with questions about company policies and documents.";
}

function confidenceBucket(confidence: number): "low" | "medium" | "high" {
  if (confidence < 0.5) return "low";
  if (confidence < 0.8) return "medium";
  return "high";
}

interface RoutingDecision {
  route: string;
  intent: string;
  language: string;
  confidence: number;
  fallbackUsed: boolean;
}

// Routing observability: log only structured, privacy-safe fields — never the
// raw question, answer, evidence, or prompts.
function logRouteDecision(
  decision: RoutingDecision,
  extras: {
    tenantId: string;
    conversationId: string;
    retrievalSkipped: boolean;
    sourceCount: number;
    reasonCode: string;
    latencyMs: number;
    answerTask?: string;
    // Optional observability fields
    retrievalCandidateCount?: number;
    evidenceBundleSufficiency?: string;
    evidenceItemCount?: number;
    finalAnswerDecision?: string;
    returnedSourceCount?: number;
    persistedSourceCount?: number;
  },
): void {
  logger.info(
    {
      tenantId: extras.tenantId,
      conversationId: extras.conversationId,
      route: decision.route,
      intent: decision.intent,
      answerTask: extras.answerTask,
      language: decision.language,
      confidenceBucket: confidenceBucket(decision.confidence),
      fallbackUsed: decision.fallbackUsed,
      retrievalSkipped: extras.retrievalSkipped,
      sourceCount: extras.sourceCount,
      reasonCode: extras.reasonCode,
      latencyMs: extras.latencyMs,
      retrievalCandidateCount: extras.retrievalCandidateCount,
      evidenceBundleSufficiency: extras.evidenceBundleSufficiency,
      evidenceItemCount: extras.evidenceItemCount,
      finalAnswerDecision: extras.finalAnswerDecision,
      returnedSourceCount: extras.returnedSourceCount,
      persistedSourceCount: extras.persistedSourceCount,
    },
    "chat routing decision",
  );
}

export function buildRagMessages(options: {
  citationsEnabled: boolean;
  historyFromDb: Array<{ role: "user" | "assistant"; content: string }>;
  sources: ChatSource[];
  userMessage: string;
  task?: AnswerTask;
}): { role: "system" | "user" | "assistant"; content: string }[] {
  const { citationsEnabled, historyFromDb, sources, userMessage, task = "direct_question" } = options;
  const messages: { role: "system" | "user" | "assistant"; content: string }[] =
    [
      {
        role: "system",
        content: systemPromptFor(task, citationsEnabled),
      },
    ];

  if (historyFromDb.length > 0) {
    for (const msg of historyFromDb.slice(-10)) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  if (sources.length > 0) {
    const contextBlock = sources
      .map(
        (s, i) =>
          `[Source ${i + 1}: id:${s.chunkId} doc:${s.documentId} title:${s.documentTitle}${s.sectionTitle ? ` — ${s.sectionTitle}` : ""}${s.pageNumber ? ` (p.${s.pageNumber})` : ""}]\n${s.text}`,
      )
      .join("\n\n");

    messages.push({
      role: "system",
      content: `${ragContextInstruction(citationsEnabled)}\n\nContext:\n${contextBlock}`,
    });
  }

  messages.push({ role: "user", content: userMessage });
  return messages;
}

export function insufficientAuthorizedEvidenceResponse(
  conversationId: string,
  language: "ar" | "en" | "mixed" = "en",
): Omit<ChatResponse, "messageId"> {
  return {
    answer:
      language === "ar"
        ? INSUFFICIENT_AUTHORIZED_EVIDENCE_AR
        : INSUFFICIENT_AUTHORIZED_EVIDENCE,
    sources: [],
    conversationId,
  };
}

/**
 * Central weak-evidence gate.
 *
 * When a reranker evidence bundle is available, a candidate is
 * supportive evidence only when its per-item reranked `totalScore`
 * reaches the weak boundary (>= EVIDENCE_ITEM_MIN_TOTAL_SCORE).
 * Items below the floor are excluded from generation context,
 * persistence, and citations. NaN/Infinity/non-numeric scores are
 * never supportive.
 *
 * Without a bundle (no reranker configured or reranker failed),
 * evidence is treated as insufficient — fail closed. The raw
 * retrieval score scale has no documented and tested relevance
 * threshold, so no raw-score acceptance is permitted.
 *
 * Survivor order always mirrors the input candidate order.
 */
export function isSufficientEvidence(score: number): boolean {
  return Number.isFinite(score) && score >= EVIDENCE_ITEM_MIN_TOTAL_SCORE;
}

export function filterSufficientEvidence(
  candidates: RetrievalCandidate[],
  evidenceBundle?: EvidenceBundle | null,
): RetrievalCandidate[] {
  if (candidates.length === 0) return [];

  if (evidenceBundle && evidenceBundle.items.length > 0) {
    // Bundle-level sufficiency gate: only SUFFICIENT bundles
    // may reach answer generation. NO_EVIDENCE, WEAK, and
    // CONFLICTING bundles are treated as insufficient — fail closed.
    if (!isSufficientBundle(evidenceBundle)) return [];

    const sufficientChunkIds = new Set<string>();
    for (const item of evidenceBundle.items) {
      if (isSufficientEvidence(item.scoreBreakdown.totalScore)) {
        sufficientChunkIds.add(item.candidate.chunkId);
      }
    }
    return candidates.filter((candidate) =>
      sufficientChunkIds.has(candidate.chunkId),
    );
  }

  // Fail closed: no valid evidence bundle means no sufficient evidence.
  return [];
}

export function safeHistoryForRag(messages: Array<{ role: string; content: string; sources: unknown[] }>): Array<{ role: "user" | "assistant"; content: string }> {
  return messages
    .filter((message) => message.role !== "assistant" || message.sources.length === 0)
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content:
        message.role === "assistant"
          ? sanitizeAssistantOutput(message.content)
          : message.content,
    }));
}

export function asRetrievalUnavailable(error: unknown): AppError {
  if (error instanceof AppError && error.code === "RETRIEVAL_UNAVAILABLE") {
    return error;
  }
  return new AppError(503, "RETRIEVAL_UNAVAILABLE", "Retrieval infrastructure is unavailable");
}

export function toPublicAttachment(
  attachment: MessageAttachment,
): ChatAttachment {
  return {
    id: attachment.id,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
  };
}

export class ChatService {
  constructor(
    private readonly retrievalService: HybridRetrievalService,
    private readonly modelAdapter: ModelAdapter,
    private readonly visionAdapter?: VisionAdapter,
    private readonly storage?: StorageProvider,
  ) {}

  async sendMessage(
    rawInput: unknown,
    context: OperationAuthorizationContext,
  ): Promise<ChatResponse> {
    const start = Date.now();

    // 1. Validate input
    const input = this.validateInput(rawInput);

    // 2. Authorize tenant
    const actor = await authorizeTenantOperation(context, Permission.CHAT_CREATE);
    const tenantIdStr = actor.tenantId.toString();
    const userIdStr = actor.actorId.toString();

    // 3. Load tenant AI runtime preferences (citations toggle + generation limits).
    let citationsEnabled = true;
    let maxTokens = DEFAULT_MAX_TOKENS;
    try {
      const tenantSettings = await getTenantSettings(tenantIdStr);
      citationsEnabled =
        tenantSettings.settings.aiRuntimePreferences.citationsEnabled;
      maxTokens = tenantSettings.settings.aiRuntimePreferences.maxTokens;
    } catch (err) {
      logger.warn(
        { err, tenantId: tenantIdStr },
        "Failed to load tenant settings, defaulting citations to enabled",
      );
    }

    // 4. Create or verify conversation
    let conversationId = input.conversationId;
    if (!conversationId) {
      const title =
        input.message.length > 120
          ? input.message.slice(0, 117) + "..."
          : input.message;
      const conv = await chatRepo.createConversation(tenantIdStr, userIdStr, title);
      conversationId = conv._id.toString();
    } else {
      const existing = await chatRepo.getConversationById(tenantIdStr, conversationId);
      if (!existing || existing.userId.toString() !== userIdStr) {
        throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
      }
    }

    // 5. Save user message
    const currentCount = await chatRepo.countMessages(tenantIdStr, conversationId);
    await chatRepo.addMessage(tenantIdStr, conversationId, "user", input.message, currentCount);

    const langfuse = getLangfuse();
    // NOTE: We intentionally do NOT log input/output text (user questions,
    // AI answers, or document chunks) to Langfuse. This is a multi-tenant
    // SaaS platform — tenant data must never leave our system boundary.
    // We only log safe operational metrics: token counts, latency, status.
    const trace = langfuse?.trace({
      name: "chat-message",
      userId: userIdStr,
      metadata: {
        tenantId: tenantIdStr,
        conversationId,
        traceId: context.traceId,
        requestId: context.requestId,
      },
      // No input: field — user question is private tenant data
    });

    // 6. Load conversation history from DB for LLM context
    let historyFromDb: Array<{ role: "user" | "assistant"; content: string }> = [];
    try {
      const dbMessages = await chatRepo.getConversationHistory(
        tenantIdStr,
        conversationId,
        20,
      );
      // RAG answers are evidence-derived cache entries. Never replay their
      // content without reauthorizing the original evidence.
      historyFromDb = safeHistoryForRag(dbMessages);
    } catch (err) {
      logger.warn({ err, tenantId: tenantIdStr }, "Failed to load conversation history");
    }

    // 7. Analyze query intent via IntentQueryService and route the message.
    let queryText = input.message;
    let intentResult: QueryPlan | null = null;
    try {
      intentResult = await getIntentQueryService().analyzeQuery(
        {
          question: input.message,
          conversationId,
          maxContext: 5,
        },
        {
          tenantId: tenantIdStr,
          actorId: actor.actorId,
          actorEmail: actor.actorEmail,
          actorRole: actor.actorRole,
          traceId: context.traceId,
          requestId: context.requestId,
        },
      );

      const routing: RoutingDecision = {
        route: intentResult.route,
        intent: intentResult.detectedIntent,
        language: intentResult.language,
        confidence: intentResult.intentConfidence,
        fallbackUsed: intentResult.processingMetadata?.fallbackUsed ?? false,
      };

      if (
        intentResult.semanticQueries &&
        intentResult.semanticQueries.length > 0
      ) {
        queryText = intentResult.semanticQueries[0].text;
      }

      switch (intentResult.route) {
        case "social": {
          const answer = socialReplyFor(
            intentResult.language,
            intentResult.socialSubtype ?? "acknowledgement",
          );
          const msgDoc = await chatRepo.addMessage(
            tenantIdStr,
            conversationId,
            "assistant",
            answer,
            currentCount + 1,
          );
          logRouteDecision(routing, {
            tenantId: tenantIdStr,
            conversationId,
            retrievalSkipped: true,
            sourceCount: 0,
            reasonCode: "SOCIAL_INTENT",
            latencyMs: Date.now() - start,
          });
          return {
            messageId: msgDoc._id.toString(),
            answer,
            sources: [],
            conversationId,
          };
        }

        case "unsafe": {
          const unsafeAnswer =
            intentResult.language === "ar"
              ? "لا يمكن معالجة هذا الطلب لمخالفته لسياسات الأمان."
              : "This request cannot be processed due to safety policies.";
          const msgDoc = await chatRepo.addMessage(
            tenantIdStr,
            conversationId,
            "assistant",
            unsafeAnswer,
            currentCount + 1,
          );
          logRouteDecision(routing, {
            tenantId: tenantIdStr,
            conversationId,
            retrievalSkipped: true,
            sourceCount: 0,
            reasonCode: "UNSAFE_INTENT",
            latencyMs: Date.now() - start,
          });
          return {
            messageId: msgDoc._id.toString(),
            answer: unsafeAnswer,
            sources: [],
            conversationId,
          };
        }

        case "unsupported": {
          const answer = unsupportedReplyFor(intentResult.language);
          const msgDoc = await chatRepo.addMessage(
            tenantIdStr,
            conversationId,
            "assistant",
            answer,
            currentCount + 1,
          );
          logRouteDecision(routing, {
            tenantId: tenantIdStr,
            conversationId,
            retrievalSkipped: true,
            sourceCount: 0,
            reasonCode: "UNSUPPORTED_INTENT",
            latencyMs: Date.now() - start,
          });
          return {
            messageId: msgDoc._id.toString(),
            answer,
            sources: [],
            conversationId,
          };
        }

        case "clarification": {
          // The deterministic LLM fallback sets clarificationNeeded + fallbackUsed;
          // falling back must never hijack the message into a clarification.
          if (
            intentResult.processingMetadata?.fallbackUsed ||
            !intentResult.clarification
          ) {
            break;
          }
          const lang = intentResult.language;
          const clarifyMsg =
            lang === "ar"
              ? intentResult.clarification.messageAr
              : intentResult.clarification.messageEn;
          const answer = clarifyMsg ?? "Could you please clarify your question?";
          const msgDoc = await chatRepo.addMessage(
            tenantIdStr,
            conversationId,
            "assistant",
            answer,
            currentCount + 1,
          );
          logRouteDecision(routing, {
            tenantId: tenantIdStr,
            conversationId,
            retrievalSkipped: true,
            sourceCount: 0,
            reasonCode: "CLARIFICATION_REQUIRED",
            latencyMs: Date.now() - start,
          });
          return {
            messageId: msgDoc._id.toString(),
            answer,
            sources: [],
            conversationId,
          };
        }

        default:
          break;
      }
    } catch (err) {
      // Fail closed for control-plane errors. Quota denials
      // (ENTITLEMENT_EXCEEDED), authorization denials, and input-validation
      // rejections from intent analysis must reach the caller — degrading to
      // raw-message routing would bypass the denial and continue into
      // retrieval/generation. Only genuine non-AppError infrastructure
      // failures are safe to degrade to the raw message.
      if (err instanceof AppError) {
        throw err;
      }
      logger.warn({ err, tenantId: tenantIdStr }, "Intent analysis failed, using raw message");
    }

    // 8. Retrieve relevant chunks via hybrid search
    const accessContext: AccessContext = {
      tenantId: tenantIdStr,
      actorId: actor.actorId,
      actorEmail: actor.actorEmail,
      baseRole: actor.actorRole,
    };

    // Answer task governs generation style and, for whole-document summaries,
    // a bounded broader retrieval/context strategy. Direct questions keep the
    // concise style and the default topK.
    const answerTask = detectAnswerTask(intentResult, input.message);
    const retrievalTopK =
      answerTask === "document_summary" ? SUMMARY_TOP_K : DIRECT_TOP_K;

    // Route-scoped retrieval: when the router resolved specific (authorized)
    // document hints, restrict search to those documents.
    const routeFilter =
      intentResult && intentResult.referencedDocumentIds.length > 0
        ? { documentIds: intentResult.referencedDocumentIds }
        : undefined;

    let sources: ChatSource[] = [];
    // persistedSources will only be non-empty for grounded answers that are
    // explicitly authorized and validated by the reranker evidence bundle.
    let persistedSources: ChatSource[] = [];

    // Preserve the reranker bundle and survivor candidates for final decisioning
    // (used after generation to decide whether to persist or expose sources).
    let retrievalEvidenceBundle: EvidenceBundle | undefined;
    let survivorsForDecision: RetrievalCandidate[] = [];

    const retrievalSpan = trace?.span({
      name: "rag-retrieval",
      metadata: { method: "hybrid", topK: retrievalTopK },
      // No input: field — queryText is derived from private user message
    });
    try {
      const retrievalResult = await this.retrievalService.hybridSearch(
        {
          queryText,
          topK: retrievalTopK,
          ...(routeFilter ? { filter: routeFilter } : {}),
        },
        accessContext,
      );


      // Preserve evidence bundle for later decision logic and auditing.
      retrievalEvidenceBundle = retrievalResult.evidenceBundle;

      const survivors = filterSufficientEvidence(
        retrievalResult.candidates,
        retrievalResult.evidenceBundle,
      );

      // Keep survivors available for final decisioning — used to validate any
      // citation IDs returned by the generator and to ensure only used chunks
      // are ever persisted or exposed. Whole-document summaries additionally
      // bound the generation context (chunk count + token budget) to the exact
      // list the generator actually sees, so the citation whitelist always
      // matches the context sent to the model.
      const generationSurvivors =
        answerTask === "document_summary"
          ? boundSummaryContext(survivors)
          : survivors;
      survivorsForDecision = generationSurvivors;

      // Console logs for test visibility

      const docIds = [
        ...new Set(generationSurvivors.map((c) => c.documentId)),
      ];

      const docTitles = new Map<string, string>();
      if (docIds.length > 0) {
        const docs = await DocumentModel.find({
          _id: { $in: docIds.map((id) => new mongoose.Types.ObjectId(id)) },
          tenantId: actor.tenantId,
        })
          .select("_id metadata.title fileName")
          .lean()
          .exec();

        for (const doc of docs) {
          const title =
            doc.metadata?.title ?? doc.fileName ?? "Untitled Document";
          docTitles.set(doc._id.toString(), title);
        }
      }

      sources = generationSurvivors.map((c) => ({
        chunkId: c.chunkId,
        documentId: c.documentId,
        text: c.text,
        pageNumber: c.pageNumber,
        sectionTitle: c.sectionTitle,
        score: c.score,
        documentTitle: docTitles.get(c.documentId) ?? "Unknown Document",
      }));
      retrievalSpan?.end({
        output: { candidateCount: sources.length }, // count only, no document text
      });
    } catch (err) {
      retrievalSpan?.end({
        level: "ERROR",
        statusMessage: err instanceof Error ? err.message : String(err),
      });
      logger.error({ err, tenantId: tenantIdStr, traceId: context.traceId }, "Retrieval search failed");
      throw asRetrievalUnavailable(err);
    }

    if (sources.length === 0) {
      const insufficientLanguage = intentResult?.language ?? "en";
      const insufficientMessage = insufficientAuthorizedEvidenceResponse(
        conversationId,
        insufficientLanguage,
      );
      const assistantDoc = await chatRepo.addMessage(
        tenantIdStr,
        conversationId,
        "assistant",
        insufficientMessage.answer,
        currentCount + 1,
        [],
      );
      logRouteDecision(
        {
          route: intentResult?.route ?? "rag",
          intent: intentResult?.detectedIntent ?? "knowledge_question",
          language: intentResult?.language ?? "en",
          confidence: intentResult?.intentConfidence ?? 0,
          fallbackUsed: intentResult?.processingMetadata?.fallbackUsed ?? false,
        },
        {
          tenantId: tenantIdStr,
          conversationId,
          retrievalSkipped: false,
          sourceCount: 0,
          reasonCode: "NO_SUFFICIENT_AUTHORIZED_EVIDENCE",
          latencyMs: Date.now() - start,
          answerTask,
        },
      );
      await getAuditWriter().write({
        action: "RETRIEVAL_DENIAL",
        resourceType: "Retrieval",
        resourceId: conversationId,
        outcome: "DENIED",
        tenantId: tenantIdStr,
        actorId: actor.actorId,
        actorEmail: actor.actorEmail,
        actorRole: actor.actorRole,
        metadata: { traceId: context.traceId, userId: userIdStr, tenantId: tenantIdStr, requiredAction: "use_in_ai", authorizationResult: "denied", reasonCode: "NO_AUTHORIZED_EVIDENCE", sourceCount: 0, latencyMs: Date.now() - start },
      });
      trace?.update({
        metadata: { outcome: "NO_AUTHORIZED_EVIDENCE" },
        // No output: field — no text logged
      });
      // Flush trace before early return so it appears in Langfuse promptly
      await langfuse?.flushAsync().catch((err) => {
        logger.warn({ err }, "Failed to flush Langfuse events");
      });
      return {
        messageId: assistantDoc._id.toString(),
        ...insufficientMessage,
      };
    }

    // 9. Build RAG prompt and generate answer
    // Build RAG messages including the retrieval candidates as context. The
    // generator is allowed to return a structured decision in the completion
    // response (e.g., { decision: "insufficient_evidence", message: "...", citedChunkIds: [] }).
    const messages = buildRagMessages({
      citationsEnabled,
      historyFromDb,
      sources,
      userMessage: input.message,
      task: answerTask,
    });

    // 10. Call LLM

    // Whole-document summaries need a larger token budget than the concise
    // direct-question default so the model can write a structured summary.
    const effectiveMaxTokens =
      answerTask === "document_summary" ? SUMMARY_MAX_TOKENS : maxTokens;

    let response: Awaited<ReturnType<ModelAdapter["complete"]>>;
    const generation = trace?.generation({
      name: "groq-chat",
      model: this.modelAdapter.providerKey,
      modelParameters: { temperature: 0.3, maxTokens: effectiveMaxTokens },
      // No input: field — messages contain private tenant document content
    });
    try {
      logger.info({ tenantId: tenantIdStr, conversationId, provider: this.modelAdapter.providerKey }, "Invoking modelAdapter.complete");
      response = await this.modelAdapter.complete({
        messages,
        temperature: 0.3,
        maxTokens: effectiveMaxTokens,
      });
      generation?.end({
        // No output: field — AI answer may contain private tenant document content
        usage: {
          promptTokens: response.usage?.promptTokens,
          completionTokens: response.usage?.completionTokens,
          totalTokens: response.usage?.totalTokens,
        },
      });
    } catch (error) {
      generation?.end({
        level: "ERROR",
        statusMessage: error instanceof Error ? error.message : String(error),
      });
      const mapped = mapLlmProviderError(error);
      const retryAfterSeconds =
        typeof mapped.details === "object" &&
        mapped.details !== null &&
        "retryAfterSeconds" in mapped.details
          ? (mapped.details as { retryAfterSeconds?: number }).retryAfterSeconds
          : undefined;
      logger.warn(
        {
          tenantId: tenantIdStr,
          provider: this.modelAdapter.providerKey,
          code: mapped.code,
          statusCode: mapped.statusCode,
          retryAfterSeconds,
        },
        "LLM completion unavailable",
      );
      throw mapped;
    }


    const rawContent = response.choices[0]?.message?.content ?? "";
    const answerText = sanitizeAssistantOutput(rawContent);
    if (!answerText) {
      throw new AppError(
        502,
        LLM_PROVIDER_UNAVAILABLE,
        "The assistant produced no usable answer. Please try again.",
      );
    }
    const latencyMs = Date.now() - start;
    trace?.update({
      metadata: { outcome: "SUCCESS", latencyMs },
      // No output: field — AI answer is private tenant data
    });

    // Programmatic quality scores — visible in Langfuse "Scores" column
    // These measure operational quality, not content (no private data exposed)
    if (trace) {
      const outputTokens = response.usage?.completionTokens ?? 0;

      // Score 1: Did retrieval find relevant documents? (1 = yes, 0 = no)
      trace.score({
        name: "retrieval_success",
        value: sources.length > 0 ? 1 : 0,
        comment: `Found ${sources.length} candidate chunk(s)`,
      });

      // Score 2: Answer richness — was the answer substantive?
      // 1.0 = rich answer (≥150 tokens), scales down for shorter answers
      // This catches cases where the LLM gives a one-word or empty response
      const richnessScore = Math.min(outputTokens / 150, 1);
      trace.score({
        name: "answer_richness",
        value: parseFloat(richnessScore.toFixed(2)),
        comment: `${outputTokens} output tokens (150+ = full score)`,
      });

      // Score 3: Latency score — 1 if under 5s, scaled down above that
      const latencyScore = Math.max(0, Math.min(1, 1 - (latencyMs - 5000) / 10000));
      trace.score({
        name: "latency_score",
        value: parseFloat(latencyScore.toFixed(2)),
        comment: `${latencyMs}ms end-to-end`,
      });
    }

    // The generation model must return a strict JSON object conforming to the
    // answer-writer schema. Fail-closed: malformed, missing, or schema-invalid
    // outputs become 'insufficient_evidence' and return zero sources.
    const AnswerWriterSchema = z.object({
      decision: z.enum(["grounded_answer","insufficient_evidence","clarification","unsupported","unsafe"]),
      answer: z.string(),
      // citedChunkIds required (may be empty for non-grounded decisions)
      citedChunkIds: z.array(z.string()),
    }).strict();

    // Try to locate and parse a JSON object in the model output. Strip fences
    // if present. Any parse/validation failure downgrades to insufficient_evidence.
    type AnswerParseResult =
      | { success: false; error: unknown }
      | { success: true; data: z.infer<typeof AnswerWriterSchema> };

    let parsed: AnswerParseResult;
    try {
      let body = rawContent.trim();
      if (body.startsWith("```")) {
        body = body.replace(/^```json\s*/i, "").replace(/```$/g, "").trim();
      }
      if (!body.startsWith("{")) {
        // Plain free-form output is unacceptable for production correctness
        parsed = { success: false, error: new Error("No JSON object present") };
      } else {
        const obj = JSON.parse(body);
        const sp = AnswerWriterSchema.safeParse(obj as unknown);
        if (sp.success) parsed = { success: true, data: sp.data };
        else parsed = { success: false, error: sp.error };
      }
    } catch (err) {
      parsed = { success: false, error: err };
    }

    let finalDecision: string = "insufficient_evidence";
    let finalMessage: string = answerText;
    let citedChunkIds: string[] = [];

    if (!parsed.success) {
      // Malformed or invalid generator output: fail to insufficient_evidence
      logger.warn({ tenantId: tenantIdStr }, "Generator output failed answer-writer schema validation");

      const assistantDoc = await chatRepo.addMessage(
        tenantIdStr,
        conversationId,
        "assistant",
        finalMessage,
        currentCount + 1,
        [],
      );

      logRouteDecision(
        {
          route: intentResult?.route ?? "rag",
          intent: intentResult?.detectedIntent ?? "knowledge_question",
          language: intentResult?.language ?? "en",
          confidence: intentResult?.intentConfidence ?? 0,
          fallbackUsed: intentResult?.processingMetadata?.fallbackUsed ?? false,
        },
        {
          tenantId: tenantIdStr,
          conversationId,
          retrievalSkipped: false,
          sourceCount: 0,
          reasonCode: "MALFORMED_GENERATOR_OUTPUT",
          latencyMs: Date.now() - start,
          answerTask,
        },
      );

      await getAuditWriter().write({
        action: "RETRIEVAL_SEARCH",
        resourceType: "Retrieval",
        resourceId: conversationId,
        outcome: "SUCCESS",
        tenantId: tenantIdStr,
        actorId: actor.actorId,
        actorEmail: actor.actorEmail,
        actorRole: actor.actorRole,
        metadata: {
          conversationId,
          sourceCount: 0,
          latencyMs: Date.now() - start,
          finalDecision: "insufficient_evidence",
        },
      });

      return {
        messageId: assistantDoc._id.toString(),
        answer: finalMessage,
        sources: [],
        conversationId,
      };
    }

    // Valid JSON per schema
    finalDecision = parsed.data.decision;

    // Sanitize the structured answer field itself before persistence or return.
    // Sanitizing rawContent above is not sufficient because rawContent is the
    // complete JSON string, while reasoning may exist inside the answer value.
    const structuredAnswer = parsed.data.answer;
    const sanitizedStructuredAnswer =
      hasUnclosedReasoningBlock(structuredAnswer)
        ? ""
        : sanitizeAssistantOutput(structuredAnswer);

    if (!sanitizedStructuredAnswer) {
      throw new AppError(
        502,
        LLM_PROVIDER_UNAVAILABLE,
        "The assistant produced no usable answer. Please try again.",
      );
    }

    finalMessage = sanitizedStructuredAnswer;
    // Deduplicate citedChunkIds while preserving order
    const seen = new Set<string>();
    citedChunkIds = parsed.data.citedChunkIds.filter((id: unknown) => {
      if (typeof id !== "string") return false;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    // If decision indicates no sources, enforce zero sources and return
    const decisionNoSources = new Set(["insufficient_evidence", "unsupported", "clarification"]);
    if (decisionNoSources.has(finalDecision)) {
      const assistantDoc = await chatRepo.addMessage(
        tenantIdStr,
        conversationId,
        "assistant",
        finalMessage,
        currentCount + 1,
        [],
      );

      logRouteDecision(
        {
          route: intentResult?.route ?? "rag",
          intent: intentResult?.detectedIntent ?? "knowledge_question",
          language: intentResult?.language ?? "en",
          confidence: intentResult?.intentConfidence ?? 0,
          fallbackUsed: intentResult?.processingMetadata?.fallbackUsed ?? false,
        },
        {
          tenantId: tenantIdStr,
          conversationId,
          retrievalSkipped: false,
          sourceCount: 0,
          reasonCode: "GENERATION_DECISION_NO_SOURCES",
          latencyMs: Date.now() - start,
          answerTask,
        },
      );

      await getAuditWriter().write({
        action: "RETRIEVAL_SEARCH",
        resourceType: "Retrieval",
        resourceId: conversationId,
        outcome: "SUCCESS",
        tenantId: tenantIdStr,
        actorId: actor.actorId,
        actorEmail: actor.actorEmail,
        actorRole: actor.actorRole,
        metadata: {
          conversationId,
          sourceCount: 0,
          latencyMs: Date.now() - start,
          finalDecision,
        },
      });

      return {
        messageId: assistantDoc._id.toString(),
        answer: finalMessage,
        sources: [],
        conversationId,
      };
    }

    // For grounded_answer, citedChunkIds MUST be present and non-empty.
    if (finalDecision === "grounded_answer") {
      if (!Array.isArray(citedChunkIds) || citedChunkIds.length === 0) {
        // Missing citations for grounded answer: downgrade to insufficient_evidence
        logger.warn({ tenantId: tenantIdStr }, "Grounded decision missing citedChunkIds; downgrading to insufficient_evidence");
        const assistantDoc = await chatRepo.addMessage(
          tenantIdStr,
          conversationId,
          "assistant",
          finalMessage,
          currentCount + 1,
          [],
        );
        await getAuditWriter().write({
          action: "RETRIEVAL_SEARCH",
          resourceType: "Retrieval",
          resourceId: conversationId,
          outcome: "SUCCESS",
          tenantId: tenantIdStr,
          actorId: actor.actorId,
          actorEmail: actor.actorEmail,
          actorRole: actor.actorRole,
          metadata: {
            conversationId,
            sourceCount: 0,
            latencyMs: Date.now() - start,
            finalDecision: "insufficient_evidence",
          },
        });

        logRouteDecision(
          {
            route: intentResult?.route ?? "rag",
            intent: intentResult?.detectedIntent ?? "knowledge_question",
            language: intentResult?.language ?? "en",
            confidence: intentResult?.intentConfidence ?? 0,
            fallbackUsed: intentResult?.processingMetadata?.fallbackUsed ?? false,
          },
          {
            tenantId: tenantIdStr,
            conversationId,
            retrievalSkipped: false,
            sourceCount: 0,
            reasonCode: "MISSING_CITATIONS_FOR_GROUNDED",
            latencyMs: Date.now() - start,
            answerTask,
          },
        );

        return {
          messageId: assistantDoc._id.toString(),
          answer: finalMessage,
          sources: [],
          conversationId,
        };
      }
    }

    // Validate citedChunkIds against survivorsForDecision and the reranker bundle.
    if (Array.isArray(citedChunkIds) && citedChunkIds.length > 0 && retrievalEvidenceBundle) {
      const approvedIds = new Set(survivorsForDecision.map((s) => s.chunkId));
      const validatedCitations = citedChunkIds.filter((id) => approvedIds.has(id));
      const orderedValidated: string[] = [];
      for (const s of survivorsForDecision) {
        if (validatedCitations.includes(s.chunkId)) orderedValidated.push(s.chunkId);
      }
      citedChunkIds = orderedValidated;

      // Build persistedSources only from validated citedChunkIds
      persistedSources = sources.filter((s) => citedChunkIds.includes(s.chunkId));
    } else {
      // No validated citations -> no persisted sources
      persistedSources = [];
    }

    // Persist assistant message including only validated sources when citations
    // are enabled.
    const assistantDoc = await chatRepo.addMessage(
      tenantIdStr,
      conversationId,
      "assistant",
      finalMessage,
      currentCount + 1,
      citationsEnabled
        ? persistedSources.map((s) => ({
            chunkId: s.chunkId,
            documentId: s.documentId,
            documentTitle: s.documentTitle ?? "Unknown Document",
            sectionTitle: s.sectionTitle,
            pageNumber: s.pageNumber,
            score: s.score,
          }))
        : [],
    );

    // Record usage event with end-to-end latency for Analytics
    const eventWriter = new MongoUsageEventWriter();
    const costService = new CostService();
    const inputTokens = response.usage?.promptTokens ?? 0;
    const outputTokens = response.usage?.completionTokens ?? 0;
    const totalTokens = response.usage?.totalTokens ?? (inputTokens + outputTokens);

    void costService
      .calculateLlmCost(
        this.modelAdapter.providerKey,
        response.model || this.modelAdapter.providerKey,
        inputTokens,
        outputTokens,
      )
      .then((costRes) => {
        return eventWriter.record({
          tenantId: tenantIdStr,
          actorId: actor.actorId.toString(),
          eventType: "completion",
          provider: this.modelAdapter.providerKey,
          model: response.model || this.modelAdapter.providerKey,
          conversationId,
          messageId: assistantDoc._id.toString(),
          inputTokens,
          outputTokens,
          totalTokens,
          costMinorUnits: costRes.costMinorUnits,
          costType: costRes.costType,
          currency: costRes.currency,
          latencyMs,
          success: true,
          evidenceIds: persistedSources.map((s) => s.chunkId),
        });
      })
      .catch((err) => {
        logger.warn({ err, tenantId: tenantIdStr }, "Failed to record usage event for chat completion");
      });

    await getAuditWriter().write({
      action: "RETRIEVAL_SEARCH",
      resourceType: "Retrieval",
      resourceId: conversationId,
      outcome: "SUCCESS",
      tenantId: tenantIdStr,
      actorId: actor.actorId,
      actorEmail: actor.actorEmail,
      actorRole: actor.actorRole,
      metadata: {
        conversationId,
        sourceCount: persistedSources.length,
        latencyMs: Date.now() - start,
        finalDecision,
      },
    });

    logRouteDecision(
      {
        route: intentResult?.route ?? "rag",
        intent: intentResult?.detectedIntent ?? "knowledge_question",
        language: intentResult?.language ?? "en",
        confidence: intentResult?.intentConfidence ?? 0,
        fallbackUsed: intentResult?.processingMetadata?.fallbackUsed ?? false,
      },
      {
        tenantId: tenantIdStr,
        conversationId,
        retrievalSkipped: false,
        sourceCount: persistedSources.length,
        reasonCode: "GROUNDED_RAG",
        latencyMs: Date.now() - start,
        retrievalCandidateCount:
          survivorsForDecision.length > 0
            ? survivorsForDecision.length
            : undefined,
        evidenceBundleSufficiency:
          retrievalEvidenceBundle?.sufficiency?.level,
        evidenceItemCount:
          retrievalEvidenceBundle
            ? retrievalEvidenceBundle.items.length
            : undefined,
        finalAnswerDecision:
          persistedSources.length > 0
            ? "grounded_answer"
            : "insufficient_evidence",
        returnedSourceCount: sources.length,
        persistedSourceCount: persistedSources.length,
        answerTask,
      },
    );

    await langfuse?.flushAsync().catch((err) => {
      logger.warn({ err }, "Failed to flush Langfuse events");
    });

    return {
      messageId: assistantDoc._id.toString(),
      answer: finalMessage,
      ...(citationsEnabled ? { sources: persistedSources } : {}),
      conversationId,
    };
  }

  /**
   * Sends a user question with an image attachment to the vision adapter,
   * persisting the image (tenant-scoped) and the exchange to history.
   * A retry with the same `clientMessageId` returns the existing exchange
   * instead of analyzing the image again.
   */
  async sendVisionMessage(
    rawBody: unknown,
    file: { buffer: Buffer; originalname: string; mimetype: string } | undefined,
    context: OperationAuthorizationContext,
  ): Promise<ChatVisionResponse> {
    const start = Date.now();
    if (!file) {
      throw new AppError(400, VALIDATION_ERROR, "An image file is required");
    }
    const body = this.validateVisionBody(rawBody);

    // 1. Authorize tenant
    const actor = await authorizeTenantOperation(context, Permission.CHAT_CREATE);
    const tenantIdStr = actor.tenantId.toString();
    const userIdStr = actor.actorId.toString();

    const visionAdapter = this.visionAdapter ?? getVisionAdapter();
    const storage = this.storage ?? storageProvider;

    // 2. Validate the image (type allowlist, size limit, magic bytes)
    const { mimeType, sizeBytes } = validateVisionFile(
      file.buffer,
      file.originalname,
      file.mimetype,
    );

    // 3. Create or verify conversation
    let conversationId = body.conversationId;
    if (!conversationId) {
      const title =
        body.question.length > 120
          ? body.question.slice(0, 117) + "..."
          : body.question;
      const conv = await chatRepo.createConversation(
        tenantIdStr,
        userIdStr,
        title,
      );
      conversationId = conv._id.toString();
    } else {
      const existing = await chatRepo.getConversationById(
        tenantIdStr,
        conversationId,
      );
      if (!existing || existing.userId.toString() !== userIdStr) {
        throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
      }
    }

    // 4. De-duplicate retries: same clientMessageId returns the prior exchange
    if (body.clientMessageId) {
      const prior = await chatRepo.getUserMessageByClientMessageId(
        tenantIdStr,
        conversationId,
        body.clientMessageId,
      );
      if (prior && prior.attachments && prior.attachments.length > 0) {
        const assistantReply = await chatRepo.getAssistantReplyAfter(
          tenantIdStr,
          conversationId,
          prior.sequenceNumber,
        );
        if (assistantReply) {
          logger.info(
            { tenantId: tenantIdStr, clientMessageId: body.clientMessageId },
            "Vision send retried with same clientMessageId, returning existing exchange",
          );
          return {
            messageId: assistantReply._id.toString(),
            answer: sanitizeAssistantOutput(assistantReply.content),
            conversationId,
            attachment: toPublicAttachment(prior.attachments[0]),
          };
        }
      }
    }

    // 5. Persist the image via the tenant-scoped storage provider
    let storageKey: string;
    try {
      storageKey = await storage.saveFile(
        file.buffer,
        file.originalname,
        tenantIdStr,
      );
    } catch (err) {
      logger.error(
        { err, tenantId: tenantIdStr },
        "Failed to store chat image attachment",
      );
      throw new AppError(
        503,
        VISION_STORAGE_FAILED,
        "Failed to store the uploaded image. Please try again.",
      );
    }

    const attachment: MessageAttachment = {
      id: randomUUID(),
      fileName: file.originalname,
      mimeType,
      sizeBytes,
      storageKey,
    };

    // 6. Save the user message (with attachment metadata, never raw bytes)
    const currentCount = await chatRepo.countMessages(
      tenantIdStr,
      conversationId,
    );
    const userMsg = await chatRepo.addMessage(
      tenantIdStr,
      conversationId,
      "user",
      body.question,
      currentCount,
      [],
      [attachment],
      body.clientMessageId,
    );

    await getAuditWriter().write({
      action: "CHAT_VISION_UPLOADED",
      resourceType: "ChatMessage",
      resourceId: userMsg._id.toString(),
      outcome: "SUCCESS",
      tenantId: tenantIdStr,
      actorId: actor.actorId,
      actorEmail: actor.actorEmail,
      actorRole: actor.actorRole,
      metadata: {
        conversationId,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        latencyMs: Date.now() - start,
      },
    });

    // 7. Analyze the image
    const imageBase64 = file.buffer.toString("base64");

    // One provider attempt that returns only the sanitized final answer, or an
    // empty string when the provider returned no usable final answer (e.g.
    // only a <think>/<analysis> reasoning block). Provider hard failures are
    // surfaced as a controlled VISION_UNAVAILABLE error.
    const analyzeAttempt = async (): Promise<string> => {
      try {
        const raw = await visionAdapter.analyzeImage(
          imageBase64,
          body.question,
          mimeType,
        );
        if (!raw || raw.trim() === "") return "";
        // An unclosed reasoning block has no reliable boundary, so never
        // surface any prefix of it; trigger the caller's bounded retry.
        if (hasUnclosedReasoningBlock(raw)) return "";
        // Strip any leaked chain-of-thought before the answer is persisted,
        // returned, or previewed.
        return sanitizeAssistantOutput(raw);
      } catch (error) {
        await getAuditWriter().write({
          action: "CHAT_VISION_ANALYSIS",
          resourceType: "ChatMessage",
          resourceId: userMsg._id.toString(),
          outcome: "FAILURE",
          tenantId: tenantIdStr,
          actorId: actor.actorId,
          actorEmail: actor.actorEmail,
          actorRole: actor.actorRole,
          metadata: {
            conversationId,
            provider: visionAdapter.providerKey,
            model: visionAdapter.model,
            latencyMs: Date.now() - start,
          },
        });
        logger.warn(
          { err: error, tenantId: tenantIdStr, provider: visionAdapter.providerKey },
          "Vision analysis unavailable",
        );
        throw new AppError(
          502,
          VISION_UNAVAILABLE,
          "Image analysis is temporarily unavailable. Please try again.",
        );
      }
    };

    let answer = await analyzeAttempt();
    if (!answer) {
      // Bounded retry (at most once): the provider succeeded but returned no
      // usable final answer, so ask again with the same validated image and
      // question. The system instruction demands a final-answer-only reply in
      // the user's language, which also covers non-Latin scripts. This creates
      // no new user message, image upload, assistant message, or audit event.
      logger.warn(
        { tenantId: tenantIdStr, provider: visionAdapter.providerKey },
        "Vision analysis returned no usable answer, retrying once",
      );
      answer = await analyzeAttempt();
      if (!answer) {
        throw new AppError(
          502,
          VISION_UNAVAILABLE,
          "Image analysis returned no usable answer. Please try again.",
        );
      }
    }

    // 8. Save the assistant reply
    const assistantDoc = await chatRepo.addMessage(
      tenantIdStr,
      conversationId,
      "assistant",
      answer,
      currentCount + 1,
    );

    await getAuditWriter().write({
      action: "CHAT_VISION_ANALYSIS",
      resourceType: "ChatMessage",
      resourceId: userMsg._id.toString(),
      outcome: "SUCCESS",
      tenantId: tenantIdStr,
      actorId: actor.actorId,
      actorEmail: actor.actorEmail,
      actorRole: actor.actorRole,
      metadata: {
        conversationId,
        assistantMessageId: assistantDoc._id.toString(),
        provider: visionAdapter.providerKey,
        model: visionAdapter.model,
        latencyMs: Date.now() - start,
      },
    });

    return {
      messageId: assistantDoc._id.toString(),
      answer,
      conversationId,
      attachment: toPublicAttachment(attachment),
    };
  }

  /**
   * Streams an image attachment after verifying the attachment belongs to a
   * conversation owned by the requesting user within the same tenant.
   */
  async getAttachment(
    attachmentId: string,
    context: OperationAuthorizationContext,
  ): Promise<{
    stream: Readable;
    contentType: string;
    fileName: string;
    sizeBytes: number;
  }> {
    const actor = await authorizeTenantOperation(context, Permission.CHAT_READ);
    const tenantIdStr = actor.tenantId.toString();
    const userIdStr = actor.actorId.toString();

    const message = await chatRepo.findMessageByAttachmentId(
      tenantIdStr,
      attachmentId,
    );
    const attachment = message?.attachments?.find(
      (a) => a.id === attachmentId,
    );

    if (!message || !attachment) {
      throw new AppError(404, ATTACHMENT_NOT_FOUND, "Attachment not found");
    }

    const conversation = await chatRepo.getConversationById(
      tenantIdStr,
      message.conversationId.toString(),
    );
    if (!conversation || conversation.userId.toString() !== userIdStr) {
      throw new AppError(404, ATTACHMENT_NOT_FOUND, "Attachment not found");
    }

    const storage = this.storage ?? storageProvider;
    let stream: Readable;
    try {
      stream = await storage.getFileStream(attachment.storageKey);
    } catch (err) {
      logger.warn(
        { err, tenantId: tenantIdStr, attachmentId },
        "Failed to open chat attachment stream",
      );
      throw new AppError(404, ATTACHMENT_NOT_FOUND, "Attachment not found");
    }

    await getAuditWriter().write({
      action: "CHAT_ATTACHMENT_ACCESSED",
      resourceType: "ChatMessage",
      resourceId: message._id.toString(),
      outcome: "SUCCESS",
      tenantId: tenantIdStr,
      actorId: actor.actorId,
      actorEmail: actor.actorEmail,
      actorRole: actor.actorRole,
      metadata: {
        conversationId: message.conversationId.toString(),
        attachmentId,
        fileName: attachment.fileName,
      },
    });

    return {
      stream,
      contentType: attachment.mimeType,
      fileName: attachment.fileName,
      sizeBytes: attachment.sizeBytes,
    };
  }

  async listConversations(
    rawQuery: unknown,
    context: OperationAuthorizationContext,
  ): Promise<ConversationListResponse> {
    const actor = await authorizeTenantOperation(context, Permission.CHAT_READ);
    const tenantIdStr = actor.tenantId.toString();
    const userIdStr = actor.actorId.toString();

    const query = ChatListConversationsQuerySchema.parse(rawQuery);
    const result = await chatRepo.listConversationsByUser(
      tenantIdStr,
      userIdStr,
      query.page,
      query.pageSize,
    );

    const conversations: ConversationListItem[] = result.conversations.map((c) => ({
      id: c._id.toString(),
      title: c.title,
      lastMessage: "",
      updatedAt: c.lastMessageAt.toISOString(),
      messageCount: c.messageCount,
    }));

    // Fetch last message for each conversation
    for (const conv of conversations) {
      const msgs = await chatRepo.getConversationHistory(tenantIdStr, conv.id, 1);
      if (msgs.length > 0) {
        const last = msgs[msgs.length - 1];
        const preview =
          last.role === "assistant"
            ? sanitizeAssistantOutput(last.content)
            : last.content;
        conv.lastMessage = preview.slice(0, 100);
      }
    }

    return {
      conversations,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  }

  async getConversationMessages(
    conversationId: string,
    context: OperationAuthorizationContext,
  ): Promise<ConversationMessagesResponse> {
    const actor = await authorizeTenantOperation(context, Permission.CHAT_READ);
    const tenantIdStr = actor.tenantId.toString();
    const userIdStr = actor.actorId.toString();

    const conv = await chatRepo.getConversationById(tenantIdStr, conversationId);
    if (!conv || conv.userId.toString() !== userIdStr) {
      throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
    }

    const dbMessages = await chatRepo.getConversationHistory(tenantIdStr, conversationId, 200);

    const messages: ConversationMessageDetail[] = dbMessages.map((m) => ({
      id: m._id.toString(),
      role: m.role as "user" | "assistant",
      content:
        m.role === "assistant" ? sanitizeAssistantOutput(m.content) : m.content,
      sources: m.sources?.length > 0 ? m.sources : undefined,
      attachments:
        m.attachments && m.attachments.length > 0
          ? m.attachments.map(toPublicAttachment)
          : undefined,
      createdAt: m.createdAt.toISOString(),
    }));

    return { messages, conversationId };
  }

  async deleteConversation(
    conversationId: string,
    context: OperationAuthorizationContext,
  ): Promise<void> {
    const actor = await authorizeTenantOperation(context, Permission.CHAT_DELETE);
    const tenantIdStr = actor.tenantId.toString();
    const userIdStr = actor.actorId.toString();

    const deleted = await chatRepo.deleteConversation(
      tenantIdStr,
      conversationId,
      userIdStr,
    );

    if (!deleted) {
      throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
    }
  }

  private validateInput(raw: unknown): ChatSendBody {
    const result = ChatSendBodySchema.safeParse(raw);
    if (!result.success) {
      throw new AppError(
        400,
        VALIDATION_ERROR,
        "Validation failed: " +
          result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "),
        result.error.issues,
      );
    }
    return result.data;
  }

  private validateVisionBody(raw: unknown): ChatVisionBody {
    const result = ChatVisionBodySchema.safeParse(raw);
    if (!result.success) {
      throw new AppError(
        400,
        VALIDATION_ERROR,
        "Validation failed: " +
          result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "),
        result.error.issues,
      );
    }
    return result.data;
  }
}
