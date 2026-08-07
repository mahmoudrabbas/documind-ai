import { logger } from "../../common/logger/logger.js";
import type { LlmJudgeService } from "./llmJudge.service.js";
import type { JudgeEvidenceLoader } from "./judgeEvidence.js";
import {
  isDuplicateKeyError,
  loadAssistantMessageForJudge,
  loadConversationForJudge,
  loadExistingEvaluationForJudge,
  loadPrecedingQuestionForJudge,
  persistJudgeEvaluation,
  type JudgeEvaluationRecord,
} from "./judgeEvaluation.repository.js";

/**
 * Best-effort orchestration for LLM-as-a-Judge evaluations triggered from the
 * feedback flow.
 *
 * The entry point `evaluateAsync` is fire-and-forget: it never throws to the
 * caller and never blocks the HTTP response. All validation failures (missing
 * message, wrong role, cross-tenant access, ownership mismatch, no preceding
 * question, no usable evidence, already evaluated) degrade to a silent skip
 * with a log line — a missing judge evaluation is never allowed to break
 * feedback submission.
 */

export interface JudgeTriggerInput {
  tenantId: string;
  actorId: string;
  messageId: string;
  conversationId: string;
}

export interface JudgeEvaluationServiceDeps {
  judge: Pick<LlmJudgeService, "evaluate" | "judgeVersion">;
  evidenceLoader: JudgeEvidenceLoader;
  loadAssistantMessage?: typeof loadAssistantMessageForJudge;
  loadConversation?: typeof loadConversationForJudge;
  loadPrecedingQuestion?: typeof loadPrecedingQuestionForJudge;
  loadExistingEvaluation?: typeof loadExistingEvaluationForJudge;
  persistEvaluation?: typeof persistJudgeEvaluation;
}

export class JudgeEvaluationService {
  private readonly judge: Pick<LlmJudgeService, "evaluate" | "judgeVersion">;
  private readonly evidenceLoader: JudgeEvidenceLoader;
  private readonly loadAssistantMessage: typeof loadAssistantMessageForJudge;
  private readonly loadConversation: typeof loadConversationForJudge;
  private readonly loadPrecedingQuestion: typeof loadPrecedingQuestionForJudge;
  private readonly loadExistingEvaluation: typeof loadExistingEvaluationForJudge;
  private readonly persistEvaluation: typeof persistJudgeEvaluation;

  constructor(deps: JudgeEvaluationServiceDeps) {
    this.judge = deps.judge;
    this.evidenceLoader = deps.evidenceLoader;
    this.loadAssistantMessage = deps.loadAssistantMessage ?? loadAssistantMessageForJudge;
    this.loadConversation = deps.loadConversation ?? loadConversationForJudge;
    this.loadPrecedingQuestion = deps.loadPrecedingQuestion ?? loadPrecedingQuestionForJudge;
    this.loadExistingEvaluation = deps.loadExistingEvaluation ?? loadExistingEvaluationForJudge;
    this.persistEvaluation = deps.persistEvaluation ?? persistJudgeEvaluation;
  }

  /**
   * Fire-and-forget entry point. All rejections are caught and logged; the
   * caller (feedback submission) must never await or propagate this.
   */
  async evaluateAsync(input: JudgeTriggerInput): Promise<void> {
    try {
      await this.runEvaluation(input);
    } catch (error) {
      logger.error(
        { error, tenantId: input.tenantId, messageId: input.messageId },
        "Judge evaluation background task failed",
      );
    }
  }

  async runEvaluation(input: JudgeTriggerInput): Promise<void> {
    const message = await this.loadAssistantMessage(input.tenantId, input.messageId);
    if (!message) {
      logger.warn({ tenantId: input.tenantId, messageId: input.messageId }, "Judge: assistant message not found; skipping");
      return;
    }
    if (message.role !== "assistant") {
      logger.warn({ tenantId: input.tenantId, messageId: input.messageId }, "Judge: message is not an assistant reply; skipping");
      return;
    }
    if (message.conversationId.toString() !== input.conversationId) {
      logger.warn({ tenantId: input.tenantId, messageId: input.messageId }, "Judge: conversation mismatch; skipping");
      return;
    }
    if (!message.content || message.content.trim() === "") {
      logger.warn({ tenantId: input.tenantId, messageId: input.messageId }, "Judge: assistant reply is empty; skipping");
      return;
    }

    // Issue 7: source-less replies (social/unsupported/clarification/refusal)
    // must never invoke the LLM judge. Fail-closed: no judge call, no
    // persisted evaluation. The message was produced by the compliance gate
    // with an empty sources array.
    if (!message.sources || message.sources.length === 0) {
      logger.info(
        { tenantId: input.tenantId, messageId: input.messageId },
        "Judge: assistant reply has no sources; skipping evaluation",
      );
      return;
    }

    const conversation = await this.loadConversation(input.tenantId, input.conversationId);
    if (!conversation) {
      logger.warn({ tenantId: input.tenantId, messageId: input.messageId }, "Judge: conversation not found; skipping");
      return;
    }
    if (conversation.userId.toString() !== input.actorId) {
      logger.warn({ tenantId: input.tenantId, messageId: input.messageId }, "Judge: conversation not owned by submitting user; skipping");
      return;
    }

    const question = await this.loadPrecedingQuestion(input.tenantId, input.conversationId, message.sequenceNumber);
    if (!question || !question.content || question.content.trim() === "") {
      logger.warn({ tenantId: input.tenantId, messageId: input.messageId }, "Judge: no preceding user question; skipping");
      return;
    }

    const evidence = await this.evidenceLoader.load(
      { tenantId: input.tenantId, actorId: input.actorId },
      message.sources ?? [],
    );
    if (evidence.length === 0) {
      logger.warn({ tenantId: input.tenantId, messageId: input.messageId }, "Judge: no usable evidence; skipping");
      return;
    }

    const judgeVersion = this.judge.judgeVersion;
    const existing = await this.loadExistingEvaluation(input.tenantId, input.messageId, judgeVersion);
    if (existing?.judgeStatus === "completed") {
      logger.info({ tenantId: input.tenantId, messageId: input.messageId, judgeVersion }, "Judge: completed evaluation already exists; reusing");
      return;
    }

    const outcome = await this.judge.evaluate({
      question: question.content,
      answer: message.content,
      evidence,
    });

    const record: JudgeEvaluationRecord = {
      tenantId: input.tenantId,
      messageId: input.messageId,
      conversationId: input.conversationId,
      judgeStatus: outcome.status,
      judgeScores: outcome.scores,
      judgeProvider: outcome.provider,
      judgeModel: outcome.model,
      judgeVersion,
      judgeEvaluatedAt: new Date(),
      judgeErrorCode: outcome.errorCode,
    };

    try {
      await this.persistEvaluation(record);
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
      // The unique index rejected our upsert, which only happens when a
      // concurrent writer persisted a `completed` evaluation for the same key.
      // Re-fetch and reuse it so a successful recovery is never lost.
      const concurrent = await this.loadExistingEvaluation(input.tenantId, input.messageId, judgeVersion);
      if (concurrent?.judgeStatus === "completed") {
        logger.info(
          { tenantId: input.tenantId, messageId: input.messageId, judgeVersion },
          "Judge: concurrent completed evaluation won; reusing",
        );
        return;
      }
      throw error;
    }
  }
}
