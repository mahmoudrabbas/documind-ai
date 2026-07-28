import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FeedbackService } from "../feedback.service.js";
import type { FeedbackRepository } from "../feedback.repository.js";
import type { KnowledgeGapsService } from "../../knowledge-gaps/knowledge-gaps.service.js";

describe("FeedbackService", () => {
  it("submits feedback and updates stats using mock repository", async () => {
    const mockRepo: Pick<FeedbackRepository, "upsertFeedback" | "getFeedbackStats"> = {
      upsertFeedback: async (data: Record<string, unknown>) => ({
        _id: "fb_123",
        id: "fb_123",
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      getFeedbackStats: async () => ({
        totalCount: 1,
        thumbsUpCount: 1,
        thumbsDownCount: 0,
        satisfactionRate: 1.0,
        byCategory: { inaccurate: 0, incomplete: 0, irrelevant: 0, harmful: 0, other: 0 },
      }),
    } as unknown as FeedbackRepository;

    const mockGapService: Pick<KnowledgeGapsService, "reportCandidate"> = {
      reportCandidate: async () => ({}),
    } as unknown as KnowledgeGapsService;

    const service = new FeedbackService(mockRepo as FeedbackRepository, mockGapService as KnowledgeGapsService);

    const result = await service.submitFeedback("tenant_1", "user_1", {
      messageId: "msg_1",
      conversationId: "conv_1",
      rating: "thumbs_up",
    });

    assert.equal(result.id, "fb_123");
    assert.equal(result.rating, "thumbs_up");

    const stats = await service.getFeedbackStats("tenant_1");
    assert.equal(stats.totalCount, 1);
    assert.equal(stats.satisfactionRate, 1.0);
  });
});
