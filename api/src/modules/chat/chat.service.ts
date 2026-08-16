import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { AppError } from "../../common/errors/AppError.js";
import {
  ATTACHMENT_NOT_FOUND,
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
import type { RetrievalCandidate } from "../retrieval/retrieval.types.js";
import type { EvidenceBundle } from "../reranker/reranker.types.js";
import {
  EVIDENCE_ITEM_MIN_TOTAL_SCORE,
  isSufficientBundle,
} from "../reranker/reranker.types.js";
import type { ModelAdapter } from "../agents/agents.types.js";
import type { QueryLanguageValue } from "../intent-query/intentQuery.types.js";
import type { MessageAttachment } from "../../db/models/message.model.js";
import type {
  ChatAttachment,
  ChatResponse,
  ChatVisionResponse,
  ConversationListItem,
  ConversationMessageDetail,
  ConversationListResponse,
  ConversationMessagesResponse,
} from "./chat.types.js";
import {
  ChatListConversationsQuerySchema,
  ChatVisionBodySchema,
  type ChatVisionBody,
} from "./chat.validator.js";
import * as chatRepo from "./chat.repository.js";
import {
  sanitizeAssistantOutput,
  hasUnclosedReasoningBlock,
} from "../../providers/llm/outputSanitizer.js";
import { isArabicContext } from "../agents/answerWriter.service.js";
export {
  buildRagMessages,
  type AnswerTask,
} from "../agents/answerWriter.service.js";
import {
  getVisionAdapter,
  type VisionAdapter,
} from "../../providers/llm/visionAdapter.js";
import { storageProvider } from "../../providers/storage/index.js";
import type { StorageProvider } from "../../providers/storage/types.js";
import { validateVisionFile } from "./chat.vision.js";
import { VoxtralSttAdapter } from "../../providers/stt/voxtralStt.adapter.js";
import type { ChatWorkflowExecutionContext } from "./chatWorkflowService.js";

const SUMMARY_MAX_SOURCES = 8;
const SUMMARY_CONTEXT_CHARS = 24_000;

function selfResource(context: OperationAuthorizationContext) {
  return { tenantId: context.tenantId, ownerId: context.actorId };
}

export { detectAnswerTask } from "./chat.answerTask.js";

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

const INSUFFICIENT_AUTHORIZED_EVIDENCE = "I don't have sufficient authorized evidence to answer that question.";
const INSUFFICIENT_AUTHORIZED_EVIDENCE_AR = "عذراً، لم أتمكن من العثور على معلومات كافية في المستندات المتاحة للإجابة على سؤالك. يرجى التأكد من رفع المستندات ذات الصلة أو إعادة صياغة سؤالك.";


export function insufficientAuthorizedEvidenceResponse(
  conversationId: string,
  language: QueryLanguageValue = "en",
): Omit<ChatResponse, "messageId"> {
  const answer = isArabicContext(language)
    ? INSUFFICIENT_AUTHORIZED_EVIDENCE_AR
    : INSUFFICIENT_AUTHORIZED_EVIDENCE;
  return { answer, sources: [], conversationId };
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

export { safeHistoryForRag } from "./chat.history.js";

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

export interface StandardChatWorkflowService {
  execute(
    rawInput: unknown,
    context: OperationAuthorizationContext,
  ): Promise<ChatResponse>;
}

export class ChatService {
  private readonly sttAdapter: VoxtralSttAdapter;

  constructor(
    _retrievalService: HybridRetrievalService,
    _modelAdapter: ModelAdapter,
    private readonly visionAdapter?: VisionAdapter,
    private readonly storage?: StorageProvider,
    sttAdapter?: VoxtralSttAdapter,
    private readonly standardChatWorkflow?: StandardChatWorkflowService,
  ) {
    this.sttAdapter = sttAdapter || new VoxtralSttAdapter();
  }

  async sendMessage(
    rawInput: unknown,
    context: OperationAuthorizationContext,
  ): Promise<ChatResponse> {
    if (!this.standardChatWorkflow) {
      throw new AppError(
        503,
        "CHAT_WORKFLOW_UNAVAILABLE",
        "Controlled chat workflow is unavailable",
      );
    }
    return this.standardChatWorkflow.execute(rawInput, context);
  }

  async sendMessageStream(
    rawInput: unknown,
    context: ChatWorkflowExecutionContext,
  ): Promise<ChatResponse> {
    if (!this.standardChatWorkflow) {
      throw new AppError(
        503,
        "CHAT_WORKFLOW_UNAVAILABLE",
        "Controlled chat workflow is unavailable",
      );
    }
    return this.standardChatWorkflow.execute(rawInput, context);
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
    const actor = await authorizeTenantOperation(context, Permission.CHAT_CREATE, selfResource(context));
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
    const actor = await authorizeTenantOperation(context, Permission.CHAT_READ, selfResource(context));
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
    const actor = await authorizeTenantOperation(context, Permission.CHAT_READ, selfResource(context));
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
    const actor = await authorizeTenantOperation(context, Permission.CHAT_READ, selfResource(context));
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
    const actor = await authorizeTenantOperation(context, Permission.CHAT_DELETE, selfResource(context));
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

  async transcribeAudio(
    file: { buffer: Buffer; mimetype: string; size: number } | undefined,
    context: OperationAuthorizationContext,
  ): Promise<{ text: string }> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new AppError(400, "BAD_REQUEST", "Audio file is required");
    }

    const maxSizeBytes = 10 * 1024 * 1024;
    if (file.size > maxSizeBytes || file.buffer.length > maxSizeBytes) {
      throw new AppError(
        400,
        "STT_FILE_TOO_LARGE",
        "Audio file size exceeds maximum limit of 10MB",
      );
    }

    const allowedMimeTypes = [
      "audio/webm",
      "audio/wav",
      "audio/mp4",
      "audio/ogg",
      "audio/mpeg",
      "audio/x-m4a",
      "audio/m4a",
      "audio/aac",
    ];
    const mime = file.mimetype.toLowerCase();
    const isAllowed = allowedMimeTypes.some((type) => mime.includes(type.split("/")[1]));
    if (!isAllowed) {
      throw new AppError(
        400,
        "STT_UNSUPPORTED_MIME_TYPE",
        `Unsupported audio format '${file.mimetype}'. Allowed formats: webm, wav, mp4, ogg, mpeg, m4a.`,
      );
    }

    const actor = await authorizeTenantOperation(context, Permission.CHAT_CREATE, selfResource(context));

    logger.info(
      { tenantId: actor.tenantId.toString(), mimeType: file.mimetype, sizeBytes: file.size },
      "Transcribing voice recording via Voxtral STT adapter",
    );

    const text = await this.sttAdapter.transcribe(file.buffer, file.mimetype);

    return { text };
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
