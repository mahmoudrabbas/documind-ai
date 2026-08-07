import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JudgeEvaluationService } from "../judgeEvaluation.service.js";
import type { JudgeEvidenceLoader } from "../judgeEvidence.js";
import type { JudgeOutcome } from "../llmJudge.types.js";
import type { JudgeTriggerInput } from "../judgeEvaluation.service.js";
import type {
  loadAssistantMessageForJudge,
  loadConversationForJudge,
  loadExistingEvaluationForJudge,
  loadPrecedingQuestionForJudge,
  persistJudgeEvaluation,
  JudgeEvaluationRecord,
} from "../judgeEvaluation.repository.js";

const completedOutcome: JudgeOutcome = {
  status: "completed",
  scores: { faithfulness: 0.9, relevancy: 0.8, coherence: 0.7, overall: 0.83 },
  provider: "stub",
  model: "stub-model",
  errorCode: null,
};

const input: JudgeTriggerInput = {
  tenantId: "tenant-1",
  actorId: "user-1",
  messageId: "message-1",
  conversationId: "conversation-1",
};

interface FakeJudge {
  evaluateCalls: number;
  judgeVersion: string;
  outcome: JudgeOutcome;
  error?: Error;
  evaluate: (input: unknown) => Promise<JudgeOutcome>;
}

function makeFakeJudge(judgeVersion = "judge-v1"): FakeJudge {
  const fake: FakeJudge = {
    evaluateCalls: 0,
    judgeVersion,
    outcome: completedOutcome,
    evaluate: async () => {
      fake.evaluateCalls++;
      if (fake.error) throw fake.error;
      return fake.outcome;
    },
  };
  return fake;
}

function makeEvidenceLoader(evidenceCount = 1): { loader: JudgeEvidenceLoader; calls: () => number } {
  let count = 0;
  const loader: JudgeEvidenceLoader = {
    load: async () => {
      count++;
      if (evidenceCount === 0) return [];
      return [{ chunkId: "c1", documentId: "d1", documentTitle: "Doc", text: "evidence" }];
    },
  };
  return { loader, calls: () => count };
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => "message-1" },
    tenantId: { toString: () => "tenant-1" },
    conversationId: { toString: () => "conversation-1" },
    role: "assistant",
    content: "The answer.",
    sequenceNumber: 2,
    sources: [],
    ...overrides,
  };
}

function makeConversation(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => "conversation-1" },
    tenantId: { toString: () => "tenant-1" },
    userId: { toString: () => "user-1" },
    ...overrides,
  };
}

interface Harness {
  service: JudgeEvaluationService;
  fakeJudge: FakeJudge;
  persisted: unknown[];
  duplicateKeys: number;
  existing?: { judgeStatus: string };
  reloadCount: number;
}

function makeHarness(overrides: {
  message?: unknown;
  conversation?: unknown;
  question?: unknown;
  evidenceCount?: number;
  existing?: { judgeStatus: string } | null;
  existingAfterPersist?: { judgeStatus: string } | null;
  persistError?: Error;
} = {}): Harness {
  const fakeJudge = makeFakeJudge();
  const { loader } = makeEvidenceLoader(overrides.evidenceCount ?? 1);
  const harness: Harness = {
    service: new JudgeEvaluationService({
      judge: fakeJudge,
      evidenceLoader: loader,
      loadAssistantMessage: (async () =>
        ("message" in overrides ? overrides.message : makeMessage())) as unknown as typeof loadAssistantMessageForJudge,
      loadConversation: (async () =>
        ("conversation" in overrides ? overrides.conversation : makeConversation())) as unknown as typeof loadConversationForJudge,
      loadPrecedingQuestion: (async () =>
        ("question" in overrides ? overrides.question : { content: "What is the policy?" })) as unknown as typeof loadPrecedingQuestionForJudge,
      loadExistingEvaluation: (async (_tenantId: string, _messageId: string, judgeVersion: string) => {
        if (judgeVersion !== "judge-v1") return null;
        harness.reloadCount += 1;
        if (harness.reloadCount === 1) return overrides.existing ?? null;
        return overrides.existingAfterPersist ?? null;
      }) as unknown as typeof loadExistingEvaluationForJudge,
      persistEvaluation: (async (record: JudgeEvaluationRecord) => {
        if (overrides.persistError) throw overrides.persistError;
        harness.persisted.push(record);
        return record;
      }) as unknown as typeof persistJudgeEvaluation,
    }),
    fakeJudge,
    persisted: [],
    duplicateKeys: 0,
    reloadCount: 0,
  };
  return harness;
}

describe("JudgeEvaluationService.runEvaluation", () => {
  it("persists a completed evaluation for a valid assistant message", async () => {
    const harness = makeHarness({
      message: makeMessage({
        content: "The leave policy grants 30 days.",
        sources: [{ chunkId: "c1", documentId: "d1" }],
      }),
    });
    await harness.service.runEvaluation(input);
    assert.equal(harness.fakeJudge.evaluateCalls, 1);
    assert.equal(harness.persisted.length, 1);
    const record = harness.persisted[0] as {
      judgeStatus: string;
      judgeScores: { overall: number };
      judgeVersion: string;
      judgeErrorCode: string | null;
    };
    assert.equal(record.judgeStatus, "completed");
    assert.equal(record.judgeScores.overall, 0.83);
    assert.equal(record.judgeVersion, "judge-v1");
    assert.equal(record.judgeErrorCode, null);
  });

  it("skips when the message does not exist", async () => {
    const harness = makeHarness({ message: null });
    await harness.service.runEvaluation(input);
    assert.equal(harness.fakeJudge.evaluateCalls, 0);
    assert.equal(harness.persisted.length, 0);
  });

  it("skips when the message is not an assistant reply", async () => {
    const harness = makeHarness({ message: makeMessage({ role: "user" }) });
    await harness.service.runEvaluation(input);
    assert.equal(harness.fakeJudge.evaluateCalls, 0);
  });

  it("skips when the conversation does not match the message", async () => {
    const harness = makeHarness({ message: makeMessage({ conversationId: { toString: () => "other-conv" } }) });
    await harness.service.runEvaluation(input);
    assert.equal(harness.fakeJudge.evaluateCalls, 0);
  });

  it("skips when the assistant reply is empty", async () => {
    const harness = makeHarness({ message: makeMessage({ content: "   " }) });
    await harness.service.runEvaluation(input);
    assert.equal(harness.fakeJudge.evaluateCalls, 0);
  });

  it("skips when the conversation is missing", async () => {
    const harness = makeHarness({ conversation: null });
    await harness.service.runEvaluation(input);
    assert.equal(harness.fakeJudge.evaluateCalls, 0);
  });

  it("skips when the conversation is not owned by the submitting user", async () => {
    const harness = makeHarness({ conversation: makeConversation({ userId: { toString: () => "user-2" } }) });
    await harness.service.runEvaluation(input);
    assert.equal(harness.fakeJudge.evaluateCalls, 0);
  });

  it("skips when there is no preceding user question", async () => {
    const harness = makeHarness({ question: null });
    await harness.service.runEvaluation(input);
    assert.equal(harness.fakeJudge.evaluateCalls, 0);
  });

  it("skips when there is no usable evidence", async () => {
    const harness = makeHarness({ evidenceCount: 0 });
    await harness.service.runEvaluation(input);
    assert.equal(harness.fakeJudge.evaluateCalls, 0);
    assert.equal(harness.persisted.length, 0);
  });

  it("skips a source-less social/unsupported reply gracefully (no judge, no persist)", async () => {
    const { loader, calls: evidenceCalls } = makeEvidenceLoader(0);
    const harness = makeHarness({
      message: makeMessage({
        content: "أهلاً بك! كيف يمكنني مساعدتك؟",
        sources: [],
      }),
      evidenceCount: 0,
    });
    harness.service = new (Object.getPrototypeOf(harness.service).constructor)({
      judge: harness.fakeJudge,
      evidenceLoader: loader,
      loadAssistantMessage: harness.service["loadAssistantMessage"],
      loadConversation: harness.service["loadConversation"],
      loadPrecedingQuestion: harness.service["loadPrecedingQuestion"],
      loadExistingEvaluation: harness.service["loadExistingEvaluation"],
      persistEvaluation: harness.service["persistEvaluation"],
    });
    await harness.service.runEvaluation(input);
    assert.equal(harness.fakeJudge.evaluateCalls, 0);
    assert.equal(harness.persisted.length, 0);
    assert.equal(evidenceCalls(), 0, "evidence loader must not be called for source-less replies");
  });

  it("skips judge and evidence loading for source-less refusal/clarification replies", async () => {
    const { loader, calls: evidenceCalls } = makeEvidenceLoader(5);
    const harness = makeHarness({
      message: makeMessage({
        content: "I don't have sufficient authorized evidence to answer that question.",
        sources: [],
      }),
      evidenceCount: 5,
    });
    harness.service = new (Object.getPrototypeOf(harness.service).constructor)({
      judge: harness.fakeJudge,
      evidenceLoader: loader,
      loadAssistantMessage: harness.service["loadAssistantMessage"],
      loadConversation: harness.service["loadConversation"],
      loadPrecedingQuestion: harness.service["loadPrecedingQuestion"],
      loadExistingEvaluation: harness.service["loadExistingEvaluation"],
      persistEvaluation: harness.service["persistEvaluation"],
    });
    await harness.service.runEvaluation(input);
    assert.equal(harness.fakeJudge.evaluateCalls, 0);
    assert.equal(harness.persisted.length, 0);
    assert.equal(evidenceCalls(), 0, "evidence loader must not be called even if evidence available");
  });

  it("still evaluates sourced assistant replies normally", async () => {
    const { loader, calls: evidenceCalls } = makeEvidenceLoader(2);
    const harness = makeHarness({
      message: makeMessage({
        content: "The leave policy grants 30 days.",
        sources: [{ chunkId: "c1", documentId: "d1" }],
      }),
      evidenceCount: 2,
    });
    harness.service = new (Object.getPrototypeOf(harness.service).constructor)({
      judge: harness.fakeJudge,
      evidenceLoader: loader,
      loadAssistantMessage: harness.service["loadAssistantMessage"],
      loadConversation: harness.service["loadConversation"],
      loadPrecedingQuestion: harness.service["loadPrecedingQuestion"],
      loadExistingEvaluation: harness.service["loadExistingEvaluation"],
      persistEvaluation: harness.service["persistEvaluation"],
    });
    await harness.service.runEvaluation(input);
    assert.equal(harness.fakeJudge.evaluateCalls, 1);
    assert.equal(harness.persisted.length, 1);
    assert.equal(evidenceCalls(), 1, "evidence loader must be called for sourced replies");
  });

  it("reuses an existing completed evaluation for the same judge version", async () => {
    const harness = makeHarness({
      existing: { judgeStatus: "completed" },
      message: makeMessage({
        content: "The leave policy grants 30 days.",
        sources: [{ chunkId: "c1", documentId: "d1" }],
      }),
    });
    await harness.service.runEvaluation(input);
    assert.equal(harness.fakeJudge.evaluateCalls, 0);
    assert.equal(harness.persisted.length, 0);
  });

  it("retries a failed evaluation (provider call happens and result replaces it)", async () => {
    const harness = makeHarness({
      existing: { judgeStatus: "failed" },
      message: makeMessage({
        content: "The leave policy grants 30 days.",
        sources: [{ chunkId: "c1", documentId: "d1" }],
      }),
    });
    await harness.service.runEvaluation(input);
    assert.equal(harness.fakeJudge.evaluateCalls, 1);
    assert.equal(harness.persisted.length, 1);
    assert.equal((harness.persisted[0] as { judgeStatus: string }).judgeStatus, "completed");
  });

  it("retries a degraded evaluation (provider call happens and result replaces it)", async () => {
    const harness = makeHarness({
      existing: { judgeStatus: "degraded" },
      message: makeMessage({
        content: "The leave policy grants 30 days.",
        sources: [{ chunkId: "c1", documentId: "d1" }],
      }),
    });
    await harness.service.runEvaluation(input);
    assert.equal(harness.fakeJudge.evaluateCalls, 1);
    assert.equal(harness.persisted.length, 1);
    assert.equal((harness.persisted[0] as { judgeStatus: string }).judgeStatus, "completed");
  });

  it("re-evaluates when the existing evaluation belongs to an older judge version", async () => {
    const harness = makeHarness({
      existing: { judgeStatus: "completed" },
      message: makeMessage({
        content: "The leave policy grants 30 days.",
        sources: [{ chunkId: "c1", documentId: "d1" }],
      }),
    });
    harness.fakeJudge.judgeVersion = "judge-v2";
    await harness.service.runEvaluation(input);
    assert.equal(harness.fakeJudge.evaluateCalls, 1);
    assert.equal(harness.persisted.length, 1);
  });

  it("reuses a concurrently-persisted completed evaluation on a duplicate-key error", async () => {
    const dupError = Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
    const harness = makeHarness({
      persistError: dupError,
      existingAfterPersist: { judgeStatus: "completed" },
      message: makeMessage({
        content: "The leave policy grants 30 days.",
        sources: [{ chunkId: "c1", documentId: "d1" }],
      }),
    });
    await assert.doesNotReject(harness.service.runEvaluation(input));
  });

  it("rethrows a duplicate-key error when no completed evaluation exists concurrently", async () => {
    const dupError = Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
    const harness = makeHarness({
      persistError: dupError,
      message: makeMessage({
        content: "The leave policy grants 30 days.",
        sources: [{ chunkId: "c1", documentId: "d1" }],
      }),
    });
    await assert.rejects(harness.service.runEvaluation(input), /E11000/);
  });

  it("rethrows non-duplicate persistence errors", async () => {
    const harness = makeHarness({
      persistError: new Error("connection lost"),
      message: makeMessage({
        content: "The leave policy grants 30 days.",
        sources: [{ chunkId: "c1", documentId: "d1" }],
      }),
    });
    await assert.rejects(harness.service.runEvaluation(input), /connection lost/);
  });

  it("passes the nearest preceding user question as the question", async () => {
    const harness = makeHarness({
      question: { content: "How many leave days?" },
      message: makeMessage({
        content: "The leave policy grants 30 days.",
        sources: [{ chunkId: "c1", documentId: "d1" }],
      }),
    });
    await harness.service.runEvaluation(input);
    assert.equal(harness.fakeJudge.evaluateCalls, 1);
  });
});

describe("JudgeEvaluationService.evaluateAsync", () => {
  it("never rejects even when runEvaluation throws", async () => {
    const harness = makeHarness({
      message: makeMessage({
        content: "The leave policy grants 30 days.",
        sources: [{ chunkId: "c1", documentId: "d1" }],
      }),
    });
    const original = harness.service.runEvaluation.bind(harness.service);
    harness.service.runEvaluation = async () => {
      throw new Error("boom");
    };
    await assert.doesNotReject(harness.service.evaluateAsync(input));
    harness.service.runEvaluation = original;
  });

  it("persists degraded and failed outcomes with their error codes", async () => {
    const harness = makeHarness({
      message: makeMessage({
        content: "The leave policy grants 30 days.",
        sources: [{ chunkId: "c1", documentId: "d1" }],
      }),
    });
    harness.fakeJudge.outcome = {
      status: "failed",
      scores: { faithfulness: 0.5, relevancy: 0.5, coherence: 0.5, overall: 0.5 },
      provider: "stub",
      model: "stub-model",
      errorCode: "LLM_RATE_LIMITED",
    };
    await harness.service.runEvaluation(input);
    const record = harness.persisted[0] as { judgeStatus: string; judgeErrorCode: string };
    assert.equal(record.judgeStatus, "failed");
    assert.equal(record.judgeErrorCode, "LLM_RATE_LIMITED");
  });
});
