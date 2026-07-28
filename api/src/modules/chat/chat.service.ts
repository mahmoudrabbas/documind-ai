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
import type { ModelAdapter } from "../agents/agents.types.js";
import { getIntentQueryService } from "../intent-query/intentQuery.factory.js";
import DocumentModel from "../../db/models/document.model.js";
import type {
  ChatSource,
  ChatResponse,
  ConversationListItem,
  ConversationMessageDetail,
  ConversationListResponse,
  ConversationMessagesResponse,
} from "./chat.types.js";
import {
  ChatSendBodySchema,
  type ChatSendBody,
  ChatListConversationsQuerySchema,
} from "./chat.validator.js";
import * as chatRepo from "./chat.repository.js";

const RAG_SYSTEM_PROMPT = `You are DocuMind AI, an intelligent assistant that answers questions based on company documents. You must ONLY answer using the provided context from the company's knowledge base. If the context does not contain enough information to answer the question, say so clearly. Never make up information. Be concise and helpful. When referencing information, mention which document it came from.`;
const INSUFFICIENT_AUTHORIZED_EVIDENCE = "I don't have sufficient authorized evidence to answer that question.";

export function insufficientAuthorizedEvidenceResponse(conversationId: string): ChatResponse {
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

    // 1. Validate input
    const input = this.validateInput(rawInput);

    // 2. Authorize tenant
    const actor = await authorizeTenantOperation(context, Permission.CHAT_CREATE);
    const tenantIdStr = actor.tenantId.toString();
    const userIdStr = actor.actorId.toString();

    // 3. Create or verify conversation
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

    // 4. Save user message
    const currentCount = await chatRepo.countMessages(tenantIdStr, conversationId);
    await chatRepo.addMessage(tenantIdStr, conversationId, "user", input.message, currentCount);

    // 5. Load conversation history from DB for LLM context
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

    // 6. Analyze query intent via IntentQueryService
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
        await chatRepo.addMessage(
          tenantIdStr,
          conversationId,
          "assistant",
          unsafeAnswer,
          currentCount + 1,
        );
        return { answer: unsafeAnswer, sources: [], conversationId };
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
        await chatRepo.addMessage(
          tenantIdStr,
          conversationId,
          "assistant",
          answer,
          currentCount + 1,
        );
        return { answer, sources: [], conversationId };
      }
    } catch (err) {
      logger.warn({ err, tenantId: tenantIdStr }, "Intent analysis failed, using raw message");
    }

    // 7. Retrieve relevant chunks via hybrid search
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
      await chatRepo.addMessage(tenantIdStr, conversationId, "assistant", INSUFFICIENT_AUTHORIZED_EVIDENCE, currentCount + 1, []);
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
      return insufficientAuthorizedEvidenceResponse(conversationId);
    }

    // 8. Build RAG prompt and generate answer
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: RAG_SYSTEM_PROMPT },
    ];

    // Add conversation history from DB
    if (historyFromDb.length > 0) {
      const recentHistory = historyFromDb.slice(-10);
      for (const msg of recentHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Add retrieved context
    if (sources.length > 0) {
      const contextBlock = sources
        .map(
          (s, i) =>
            `[Source ${i + 1}: ${s.documentTitle}${s.sectionTitle ? ` — ${s.sectionTitle}` : ""}${s.pageNumber ? ` (p.${s.pageNumber})` : ""}]\n${s.text}`,
        )
        .join("\n\n");

      messages.push({
        role: "system",
        content: `Use the following context to answer the question. Always cite your sources.\n\nContext:\n${contextBlock}`,
      });
    }

    messages.push({ role: "user", content: input.message });

    // 9. Call LLM
    try {
      const response = await this.modelAdapter.complete({
        messages,
        temperature: 0.3,
        maxTokens: 1500,
      });

      const answer = response.choices[0]?.message?.content ?? "";

      // 10. Save assistant response
      await chatRepo.addMessage(
        tenantIdStr,
        conversationId,
        "assistant",
        answer,
        currentCount + 1,
        sources.map((s) => ({
          chunkId: s.chunkId,
          documentId: s.documentId,
          documentTitle: s.documentTitle ?? "Unknown Document",
          sectionTitle: s.sectionTitle,
          pageNumber: s.pageNumber,
          score: s.score,
        })),
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
          sourceCount: sources.length,
          latencyMs: Date.now() - start,
        },
      });

      return { answer, sources, conversationId };
    } catch (err) {
      logger.error({ err, tenantId: tenantIdStr }, "LLM completion failed");
      throw new AppError(
        500,
        "CHAT_LLM_ERROR",
        "Failed to generate response. Please try again.",
      );
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
