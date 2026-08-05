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
import type { AccessContext } from "../retrieval/retrieval.types.js";
import type { ModelAdapter } from "../agents/agents.types.js";
import { getIntentQueryService } from "../intent-query/intentQuery.factory.js";
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

const RAG_SYSTEM_PROMPT = `You are DocuMind AI, an intelligent assistant that answers questions based on company documents. You must ONLY answer using the provided context from the company's knowledge base. If the context does not contain enough information to answer the question, say so clearly. Never make up information. Be concise and helpful. When referencing information, mention which document it came from.`;
const RAG_SYSTEM_PROMPT_NO_CITATIONS = `You are DocuMind AI, an intelligent assistant that answers questions based on company documents. You must ONLY answer using the provided context from the company's knowledge base. If the context does not contain enough information to answer the question, say so clearly. Never make up information. Be concise and helpful. Do not include any citations, source references, footnotes, document titles, or page numbers in your answer.`;
const INSUFFICIENT_AUTHORIZED_EVIDENCE = "I don't have sufficient authorized evidence to answer that question.";

function ragContextInstruction(citationsEnabled: boolean): string {
  return citationsEnabled
    ? "Use the following context to answer the question. Always cite your sources."
    : "Use the following context to answer the question. Do not mention or cite your sources, documents, or page numbers in the answer.";
}

export function buildRagMessages(options: {
  citationsEnabled: boolean;
  historyFromDb: Array<{ role: "user" | "assistant"; content: string }>;
  sources: ChatSource[];
  userMessage: string;
}): { role: "system" | "user" | "assistant"; content: string }[] {
  const { citationsEnabled, historyFromDb, sources, userMessage } = options;
  const messages: { role: "system" | "user" | "assistant"; content: string }[] =
    [
      {
        role: "system",
        content: citationsEnabled
          ? RAG_SYSTEM_PROMPT
          : RAG_SYSTEM_PROMPT_NO_CITATIONS,
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
          `[Source ${i + 1}: ${s.documentTitle}${s.sectionTitle ? ` — ${s.sectionTitle}` : ""}${s.pageNumber ? ` (p.${s.pageNumber})` : ""}]\n${s.text}`,
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
): Omit<ChatResponse, "messageId"> {
  return { answer: INSUFFICIENT_AUTHORIZED_EVIDENCE, sources: [], conversationId };
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
    let maxTokens = 1024;
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

    // 7. Analyze query intent via IntentQueryService
    let queryText = input.message;
    try {
      const intentResult = await getIntentQueryService().analyzeQuery(
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

      if (
        intentResult.semanticQueries &&
        intentResult.semanticQueries.length > 0
      ) {
        queryText = intentResult.semanticQueries[0].text;
      }

      if (intentResult.detectedIntent === "unsafe") {
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
        return {
          messageId: msgDoc._id.toString(),
          answer: unsafeAnswer,
          sources: [],
          conversationId,
        };
      }

      if (
        intentResult.clarificationNeeded &&
        intentResult.clarification &&
        !intentResult.processingMetadata?.fallbackUsed
      ) {
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
        return {
          messageId: msgDoc._id.toString(),
          answer,
          sources: [],
          conversationId,
        };
      }
    } catch (err) {
      logger.warn({ err, tenantId: tenantIdStr }, "Intent analysis failed, using raw message");
    }

    // 8. Retrieve relevant chunks via hybrid search
    const accessContext: AccessContext = {
      tenantId: tenantIdStr,
      actorId: actor.actorId,
      actorEmail: actor.actorEmail,
      baseRole: actor.actorRole,
    };

    let sources: ChatSource[] = [];
    const retrievalSpan = trace?.span({
      name: "rag-retrieval",
      metadata: { method: "hybrid", topK: 5 },
      // No input: field — queryText is derived from private user message
    });
    try {
      const retrievalResult = await this.retrievalService.hybridSearch(
        { queryText, topK: 5 },
        accessContext,
      );

      const docIds = [
        ...new Set(retrievalResult.candidates.map((c) => c.documentId)),
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

      sources = retrievalResult.candidates.map((c) => ({
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
      const assistantDoc = await chatRepo.addMessage(
        tenantIdStr,
        conversationId,
        "assistant",
        INSUFFICIENT_AUTHORIZED_EVIDENCE,
        currentCount + 1,
        [],
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
        ...insufficientAuthorizedEvidenceResponse(conversationId),
      };
    }

    // 9. Build RAG prompt and generate answer
    const messages = buildRagMessages({
      citationsEnabled,
      historyFromDb,
      sources,
      userMessage: input.message,
    });

    // 10. Call LLM
    let response: Awaited<ReturnType<ModelAdapter["complete"]>>;
    const generation = trace?.generation({
      name: "groq-chat",
      model: this.modelAdapter.providerKey,
      modelParameters: { temperature: 0.3, maxTokens },
      // No input: field — messages contain private tenant document content
    });
    try {
      response = await this.modelAdapter.complete({
        messages,
        temperature: 0.3,
        maxTokens,
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

    const answer = sanitizeAssistantOutput(
      response.choices[0]?.message?.content ?? "",
    );
    if (!answer) {
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

    // 11. Save assistant response (sources are stored only when citations are enabled)
    const assistantDoc = await chatRepo.addMessage(
      tenantIdStr,
      conversationId,
      "assistant",
      answer,
      currentCount + 1,
      citationsEnabled
        ? sources.map((s) => ({
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
          evidenceIds: sources.map((s) => s.chunkId),
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
        sourceCount: sources.length,
        latencyMs: Date.now() - start,
      },
    });

    await langfuse?.flushAsync().catch((err) => {
      logger.warn({ err }, "Failed to flush Langfuse events");
    });

    return {
      messageId: assistantDoc._id.toString(),
      answer,
      ...(citationsEnabled ? { sources } : {}),
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
