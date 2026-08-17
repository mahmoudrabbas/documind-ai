import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FeedbackService, wireFeedbackJudge, type FeedbackTargetAuthorizer } from "../feedback.service.js";
import type { FeedbackRepository } from "../feedback.repository.js";
import type { KnowledgeGapsService } from "../../knowledge-gaps/knowledge-gaps.service.js";
import type { JudgeEvaluationService } from "../../analytics/judgeEvaluation.service.js";

function makeRepo() {
  return {
    upsertFeedback: async (data: Record<string, unknown>) => ({
      _id: "fb_1",
      id: "fb_1",
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  } as unknown as FeedbackRepository;
}

function makeGapService() {
  return {
    reportCandidate: async () => ({}),
  } as unknown as KnowledgeGapsService;
}

const targetAuthorizer: FeedbackTargetAuthorizer = { assertOwnedMessage: async () => {} };

interface RecordedJudge {
  calls: Array<{ tenantId: string; actorId: string; messageId: string; conversationId: string }>;
  reject: boolean;
  evaluateAsync: (input: { tenantId: string; actorId: string; messageId: string; conversationId: string }) => Promise<void>;
}

function makeJudge(reject = false): RecordedJudge {
  const judge: RecordedJudge = {
    calls: [],
    reject,
    evaluateAsync: async () => {},
  };
  judge.evaluateAsync = async (input) => {
    judge.calls.push(input);
    if (judge.reject) throw new Error("judge boom");
  };
  return judge;
}

describe("FeedbackService judge trigger", () => {
  it("fires evaluateAsync after a thumbs_down submission", async () => {
    const judge = makeJudge();
    const service = new FeedbackService(makeRepo(), makeGapService(), judge, targetAuthorizer);
    await service.submitFeedback("tenant_1", "user_1", {
      messageId: "msg_1",
      conversationId: "conv_1",
      rating: "thumbs_down",
    });
    assert.equal(judge.calls.length, 1);
    assert.deepEqual(judge.calls[0], {
      tenantId: "tenant_1",
      actorId: "user_1",
      messageId: "msg_1",
      conversationId: "conv_1",
    });
  });

  it("fires evaluateAsync for any rating, not only thumbs_down", async () => {
    const judge = makeJudge();
    const service = new FeedbackService(makeRepo(), makeGapService(), judge, targetAuthorizer);
    await service.submitFeedback("tenant_1", "user_1", {
      messageId: "msg_2",
      conversationId: "conv_2",
      rating: "thumbs_up",
    });
    assert.equal(judge.calls.length, 1);
    assert.equal(judge.calls[0].messageId, "msg_2");
  });

  it("does not call the judge when none is configured", async () => {
    const judge = makeJudge();
    const service = new FeedbackService(makeRepo(), makeGapService(), null, targetAuthorizer);
    await service.submitFeedback("tenant_1", "user_1", {
      messageId: "msg_3",
      conversationId: "conv_3",
      rating: "thumbs_down",
    });
    assert.equal(judge.calls.length, 0);
  });

  it("returns the feedback even if the judge rejects (fire-and-forget)", async () => {
    const judge = makeJudge(true);
    const service = new FeedbackService(makeRepo(), makeGapService(), judge, targetAuthorizer);
    const result = await service.submitFeedback("tenant_1", "user_1", {
      messageId: "msg_4",
      conversationId: "conv_4",
      rating: "thumbs_down",
    });
    assert.equal(result.id, "fb_1");
    assert.equal(judge.calls.length, 1);
  });
});

describe("wireFeedbackJudge", () => {
  it("wireFeedbackJudge accepts a JudgeEvaluationService-shaped judge", () => {
    const fake = { evaluateAsync: async () => {} } as Pick<JudgeEvaluationService, "evaluateAsync">;
    assert.doesNotThrow(() => wireFeedbackJudge(fake));
  });
});
