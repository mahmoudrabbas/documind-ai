import mongoose from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import { VALIDATION_ERROR } from "../../common/errors/errorCodes.js";
import { logger } from "../../common/logger/logger.js";
import { getAuditWriter } from "../../common/observability/index.js";
import {
  authorizeTenantOperation,
  type OperationAuthorizationContext,
} from "../permissions/permissions.operation.js";
import { Permission } from "../permissions/permissions.catalog.js";
import type { HybridRetrievalService } from "../retrieval/retrieval.service.js";
import type { AccessContext } from "../retrieval/retrieval.types.js";
import type {
  ModelAdapter,
  ModelCompletionUsage,
} from "../agents/agents.types.js";
import { getIntentQueryService } from "../intent-query/intentQuery.factory.js";
import { getTenantSettings } from "../settings/settings.service.js";
import DocumentModel from "../../db/models/document.model.js";
import type {
  ChatSource,
  ChatResponse,
  ConversationListItem,
  ConversationMessageDetail,
  ConversationListResponse,
  ConversationMessagesResponse,
  SseSink,
} from "./chat.types.js";
import {
  ChatSendBodySchema,
  type ChatSendBody,
  ChatListConversationsQuerySchema,
} from "./chat.validator.js";
import * as chatRepo from "./chat.repository.js";
import { mapLlmProviderError } from "../../providers/llm/providerError.js";
import { MongoUsageEventWriter } from "../analytics/adapters/mongo-usage-event-writer.js";
import { CostService } from "../analytics/cost.service.js";

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
    .map((message) => ({ role: message.role as "user" | "assistant", content: message.content }));
}

export function asRetrievalUnavailable(error: unknown): AppError {
  if (error instanceof AppError && error.code === "RETRIEVAL_UNAVAILABLE") {
    return error;
  }
  return new AppError(503, "RETRIEVAL_UNAVAILABLE", "Retrieval infrastructure is unavailable");
}

export class ChatService {
  constructor(
    private readonly retrievalService: HybridRetrievalService,
    private readonly modelAdapter: ModelAdapter,
  ) {}

  async sendMessage(
    rawInput: unknown,
    context: OperationAuthorizationContext,
  ): Promise<ChatResponse> {
    const start = Date.now();

    const prep = await this.prepareSend(rawInput, context, start);
    if (prep.mode === "terminal") {
      return {
        messageId: prep.messageId,
        answer: prep.answer,
        sources: [],
        conversationId: prep.conversationId,
      };
    }

    const {
      conversationId,
      currentCount,
      citationsEnabled,
      maxTokens,
      sources,
      messages,
      tenantIdStr,
      userIdStr,
      actor,
    } = prep;

    // 10. Call LLM
    let response: Awaited<ReturnType<ModelAdapter["complete"]>>;
    try {
      response = await this.modelAdapter.complete({
        messages,
        temperature: 0.3,
        maxTokens,
      });
    } catch (error) {
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

    const answer = response.choices[0]?.message?.content ?? "";

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
    const latencyMs = Date.now() - start;

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

    return {
      messageId: assistantDoc._id.toString(),
      answer,
      ...(citationsEnabled ? { sources } : {}),
      conversationId,
    };
  }

  private async prepareSend(
    rawInput: unknown,
    context: OperationAuthorizationContext,
    start: number,
  ): Promise<
    | {
        mode: "llm";
        conversationId: string;
        currentCount: number;
        citationsEnabled: boolean;
        maxTokens: number;
        sources: ChatSource[];
        messages: ReturnType<typeof buildRagMessages>;
        tenantIdStr: string;
        userIdStr: string;
        actor: Awaited<ReturnType<typeof authorizeTenantOperation>>;
      }
    | {
        mode: "terminal";
        conversationId: string;
        messageId: string;
        answer: string;
        currentCount: number;
        tenantIdStr: string;
        userIdStr: string;
        actor: Awaited<ReturnType<typeof authorizeTenantOperation>>;
      }
  > {
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
          mode: "terminal",
          conversationId,
          messageId: msgDoc._id.toString(),
          answer: unsafeAnswer,
          currentCount,
          tenantIdStr,
          userIdStr,
          actor,
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
          mode: "terminal",
          conversationId,
          messageId: msgDoc._id.toString(),
          answer,
          currentCount,
          tenantIdStr,
          userIdStr,
          actor,
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
    } catch (err) {
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
      return {
        mode: "terminal",
        conversationId,
        messageId: assistantDoc._id.toString(),
        answer: INSUFFICIENT_AUTHORIZED_EVIDENCE,
        currentCount,
        tenantIdStr,
        userIdStr,
        actor,
      };
    }

    // 9. Build RAG prompt and generate answer
    const messages = buildRagMessages({
      citationsEnabled,
      historyFromDb,
      sources,
      userMessage: input.message,
    });

    return {
      mode: "llm",
      conversationId,
      currentCount,
      citationsEnabled,
      maxTokens,
      sources,
      messages,
      tenantIdStr,
      userIdStr,
      actor,
    };
  }

  async streamMessage(
    rawInput: unknown,
    context: OperationAuthorizationContext,
    sink: SseSink,
    signal?: AbortSignal,
  ): Promise<void> {
    const start = Date.now();

    const prep = await this.prepareSend(rawInput, context, start);

    if (prep.mode === "terminal") {
      sink.start();
      sink.event({ type: "token", content: prep.answer });
      sink.event({ type: "sources", sources: [] });
      sink.event({ type: "done", messageId: prep.messageId, conversationId: prep.conversationId });
      sink.end();
      return;
    }

    const {
      conversationId,
      currentCount,
      citationsEnabled,
      maxTokens,
      sources,
      messages,
      tenantIdStr,
      userIdStr,
      actor,
    } = prep;

    let answer = "";
    let usage: ModelCompletionUsage | undefined;
    let model: string | undefined;
    let caught = false;

    try {
      if (typeof this.modelAdapter.completeStream === "function") {
        sink.start();
        for await (const chunk of this.modelAdapter.completeStream({
          messages,
          temperature: 0.3,
          maxTokens,
          signal,
        })) {
          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (delta) {
            answer += delta;
            sink.event({ type: "token", content: delta });
          }
          if (chunk.usage) usage = chunk.usage;
          if (chunk.model) model = chunk.model;
        }
      } else {
        const response = await this.modelAdapter.complete({
          messages,
          temperature: 0.3,
          maxTokens,
        });
        answer = response.choices[0]?.message?.content ?? "";
        usage = response.usage;
        model = response.model;
        sink.start();
        sink.event({ type: "token", content: answer });
      }
    } catch (e) {
      caught = true;
      sink.event({ type: "error", message: e instanceof Error ? e.message : "Streaming failed" });
      sink.end();
      return;
    } finally {
      if (!caught) {
        // Save assistant response (sources are stored only when citations are enabled)
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
        const completionTokens =
          usage?.completionTokens ?? Math.ceil(answer.length / 4);
        const promptTokens =
          usage?.promptTokens ??
          Math.ceil(
            messages
              .map((m) => m.content.length)
              .reduce((a, b) => a + b, 0) / 4,
          );
        const totalTokens = usage?.totalTokens ?? (promptTokens + completionTokens);
        const providerModel = model ?? this.modelAdapter.providerKey;
        const latencyMs = Date.now() - start;

        void costService
          .calculateLlmCost(
            this.modelAdapter.providerKey,
            providerModel,
            promptTokens,
            completionTokens,
          )
          .then((costRes) => {
            return eventWriter.record({
              tenantId: tenantIdStr,
              actorId: actor.actorId.toString(),
              eventType: "completion",
              provider: this.modelAdapter.providerKey,
              model: providerModel,
              conversationId,
              messageId: assistantDoc._id.toString(),
              inputTokens: promptTokens,
              outputTokens: completionTokens,
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
            logger.warn({ err, tenantId: tenantIdStr }, "Failed to record usage event for chat stream");
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

        sink.event({ type: "sources", sources: citationsEnabled ? sources : [] });
        sink.event({ type: "done", messageId: assistantDoc._id.toString(), conversationId });
        sink.end();
      }
    }
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
        conv.lastMessage = last.content.slice(0, 100);
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
      content: m.content,
      sources: m.sources?.length > 0 ? m.sources : undefined,
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
}
