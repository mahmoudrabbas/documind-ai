import { MongoAuditWriter } from "../../common/observability/auditWriter.js";
import { logger } from "../../common/logger/logger.js";
import { feedbackRepository, FeedbackRepository } from "./feedback.repository.js";
import { knowledgeGapsService, KnowledgeGapsService } from "../knowledge-gaps/knowledge-gaps.service.js";
import type { SubmitFeedbackInput, ListFeedbackQueryInput } from "./feedback.dto.js";
import type { JudgeEvaluationService } from "../analytics/judgeEvaluation.service.js";

const auditWriter = new MongoAuditWriter();

export class FeedbackService {
  constructor(
    private repo: FeedbackRepository = feedbackRepository,
    private gapService: KnowledgeGapsService = knowledgeGapsService,
    private judge?: Pick<JudgeEvaluationService, "evaluateAsync"> | null,
  ) {}

  setJudge(judge: Pick<JudgeEvaluationService, "evaluateAsync"> | null): void {
    this.judge = judge;
  }

  async submitFeedback(tenantId: string, userId: string, input: SubmitFeedbackInput) {
    const feedback = await this.repo.upsertFeedback({
      tenantId,
      userId,
      messageId: input.messageId,
      conversationId: input.conversationId,
      rating: input.rating,
      category: input.category,
      comment: input.comment,
    });

    const feedbackIdStr = String(feedback._id);

    await auditWriter.write({
      tenantId,
      actorId: userId,
      action: "FEEDBACK_SUBMITTED",
      resourceType: "Feedback",
      resourceId: feedbackIdStr,
      outcome: "SUCCESS",
      changes: { rating: input.rating, category: input.category },
    });

    // If feedback is thumbs_down, automatically create/update a knowledge gap candidate
    if (input.rating === "thumbs_down") {
      try {
        const questionText = input.comment
          ? `Negative feedback: ${input.comment}`
          : `Negative feedback on assistant response (message ${input.messageId})`;

        await this.gapService.reportCandidate(tenantId, userId, {
          question: questionText,
          outcome: "negative_feedback",
          category: input.category,
          evidenceSummaryIds: [],
          confidence: 0.8,
          messageId: input.messageId,
          conversationId: input.conversationId,
        });
      } catch (_err) {
        // Log but do not fail feedback submission if gap creation encounters issue
      }
    }

    // Fire-and-forget LLM-as-a-Judge evaluation of the assistant reply. This
    // is best-effort and non-blocking: the HTTP response never waits for it
    // and judge failures are caught inside evaluateAsync.
    if (this.judge) {
      void this.judge
        .evaluateAsync({
          tenantId,
          actorId: userId,
          messageId: input.messageId,
          conversationId: input.conversationId,
        })
        .catch((err) => {
          // Belt-and-suspenders: evaluateAsync is designed to never reject, but
          // never let a stray rejection surface as an unhandled rejection.
          logger.error({ err }, "LLM judge evaluation failed after feedback submission");
        });
    }

    return feedback;
  }

  async getMyFeedbackForMessage(tenantId: string, userId: string, messageId: string) {
    return this.repo.findFeedbackByUserAndMessage(tenantId, userId, messageId);
  }

  async listFeedback(tenantId: string, query: ListFeedbackQueryInput) {
    return this.repo.findFeedback({ tenantId, ...query });
  }

  async getFeedbackStats(tenantId: string) {
    return this.repo.getFeedbackStats(tenantId);
  }
}

export const feedbackService = new FeedbackService();

/**
 * Wires the LLM-as-a-Judge background evaluation into the feedback flow. Called
 * from the server entry point so unit tests can construct FeedbackService
 * without a judge and keep pure unit tests side-effect free.
 */
export function wireFeedbackJudge(judge: Pick<JudgeEvaluationService, "evaluateAsync">): void {
  feedbackService.setJudge(judge);
}
