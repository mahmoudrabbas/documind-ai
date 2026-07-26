import mongoose from "mongoose";
import { z } from "zod";
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
import type { ChatSource, ChatResponse, ChatHistoryMessage } from "./chat.types.js";
import { ChatSendBodySchema, type ChatSendBody } from "./chat.validator.js";

const RAG_SYSTEM_PROMPT = `You are DocuMind AI, an intelligent assistant that answers questions based on company documents. You must ONLY answer using the provided context from the company's knowledge base. If the context does not contain enough information to answer the question, say so clearly. Never make up information. Be concise and helpful. When referencing information, mention which document it came from.`;

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

    // 3. Generate conversationId if not provided
    const conversationId = input.conversationId ?? new mongoose.Types.ObjectId().toString();

    // 4. Analyze query intent via IntentQueryService
    let queryText = input.message;
    try {
      const intentResult = await getIntentQueryService().analyzeQuery(
        {
          question: input.message,
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

      // Use the best semantic query for retrieval
      if (
        intentResult.semanticQueries &&
        intentResult.semanticQueries.length > 0
      ) {
        queryText = intentResult.semanticQueries[0].text;
      }

      // If intent is unsafe or needs clarification, short-circuit
      if (intentResult.detectedIntent === "unsafe") {
        return {
          answer:
            intentResult.language === "ar"
              ? "لا يمكن معالجة هذا الطلب لمخالفته لسياسات الأمان."
              : "This request cannot be processed due to safety policies.",
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
        const msg =
          lang === "ar"
            ? intentResult.clarification.messageAr
            : intentResult.clarification.messageEn;
        return {
          answer: msg ?? "Could you please clarify your question?",
          sources: [],
          conversationId,
        };
      }
    } catch (err) {
      // Intent analysis failure is non-fallback — use raw message
      logger.warn({ err, tenantId: tenantIdStr }, "Intent analysis failed, using raw message");
    }

    // 5. Retrieve relevant chunks via hybrid search
    const accessContext: AccessContext = {
      tenantId: tenantIdStr,
      actorId: actor.actorId,
      actorEmail: actor.actorEmail,
      baseRole: actor.actorRole,
    };

    let sources: ChatSource[] = [];
    try {
      const retrievalResult = await this.retrievalService.hybridSearch(
        { queryText: queryText, topK: 5 },
        accessContext,
      );

      // Enrich sources with document titles
      const docIds = [
        ...new Set(
          retrievalResult.candidates.map((c) => c.documentId),
        ),
      ];

      let docTitles = new Map<string, string>();
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
        text: c.text,
        pageNumber: c.pageNumber,
        sectionTitle: c.sectionTitle,
        score: c.score,
        documentTitle: docTitles.get(c.documentId) ?? "Unknown Document",
      }));
    } catch (err) {
      logger.warn({ err, tenantId: tenantIdStr }, "Retrieval search failed, proceeding without context");
    }

    // 6. Build RAG prompt and generate answer
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: RAG_SYSTEM_PROMPT },
    ];

    // Add conversation history for context
    if (input.history && input.history.length > 0) {
      const recentHistory = input.history.slice(-10);
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

    // 7. Call LLM
    try {
      const response = await this.modelAdapter.complete({
        messages,
        temperature: 0.3,
        maxTokens: 1500,
      });

      const answer = response.choices[0]?.message?.content ?? "";

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
