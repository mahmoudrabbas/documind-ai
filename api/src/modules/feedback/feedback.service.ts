import { MongoAuditWriter } from "../../common/observability/auditWriter.js";
import { feedbackRepository, FeedbackRepository } from "./feedback.repository.js";
import { knowledgeGapsService, KnowledgeGapsService } from "../knowledge-gaps/knowledge-gaps.service.js";
import type { SubmitFeedbackInput, ListFeedbackQueryInput } from "./feedback.dto.js";

const auditWriter = new MongoAuditWriter();

export class FeedbackService {
  constructor(
    private repo: FeedbackRepository = feedbackRepository,
    private gapService: KnowledgeGapsService = knowledgeGapsService,
  ) {}

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
