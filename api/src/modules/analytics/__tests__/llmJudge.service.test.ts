import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ModelAdapter, ModelCompletionMessage } from "../../agents/agents.types.js";
import {
  clampRawScore,
  clampScore,
  extractJsonObject,
  LlmJudgeService,
  normalizeJudgeScores,
  parseJudgeScores,
  parseScore,
} from "../llmJudge.service.js";

class StubAdapter implements ModelAdapter {
  readonly providerKey = "stub";
  content: string;
  throwError: boolean = false;
  recordedCalls: { temperature?: number; maxTokens?: number; messages: ModelCompletionMessage[] }[] = [];

  constructor(content: string) {
    this.content = content;
  }

  async complete(
    params: Parameters<ModelAdapter["complete"]>[0],
  ): ReturnType<ModelAdapter["complete"]> {
    this.recordedCalls.push({
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      messages: params.messages,
    });
    if (this.throwError) {
      throw new Error("rate limit exceeded (429)");
    }
    return {
      id: "stub-id",
      provider: "stub",
      model: "stub-model",
      choices: [{ index: 0, message: { role: "assistant", content: this.content }, finishReason: "stop" }],
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      latencyMs: 1,
      estimatedCost: 0,
    };
  }
}

function makeService(content: string) {
  const adapter = new StubAdapter(content);
  const service = new LlmJudgeService({ modelAdapter: adapter });
  return { service, adapter };
}

const input = {
  question: "How many leave days?",
  answer: "Full-time employees get 24 days.",
  evidence: [{ chunkId: "c1", documentId: "d1", documentTitle: "Annual Leave Policy", text: "Full-time employees are entitled to 24 days." }],
};

describe("clampScore", () => {
  it("clamps to [0, 1]", () => {
    assert.equal(clampScore(0.5), 0.5);
    assert.equal(clampScore(2), 1);
    assert.equal(clampScore(-1), 0);
  });
  it("neutralizes non-finite values", () => {
    assert.equal(clampScore(Number.NaN), 0.5);
    assert.equal(clampScore(Number.POSITIVE_INFINITY), 0.5);
  });
});

describe("clampRawScore", () => {
  it("clamps raw provider scores to the 0-10 judge scale", () => {
    assert.equal(clampRawScore(0), 0);
    assert.equal(clampRawScore(10), 10);
    assert.equal(clampRawScore(5), 5);
    assert.equal(clampRawScore(15), 10);
    assert.equal(clampRawScore(-2), 0);
  });
});

describe("normalizeJudgeScores", () => {
  it("maps 0-10 raw scores to 0-1 normalized scores", () => {
    assert.deepEqual(
      normalizeJudgeScores({ faithfulness: 9, relevancy: 8, coherence: 7 }),
      { faithfulness: 0.9, relevancy: 0.8, coherence: 0.7 },
    );
  });
  it("returns null when any dimension is missing", () => {
    assert.equal(normalizeJudgeScores({ faithfulness: 9, relevancy: null, coherence: 7 }), null);
  });
});

describe("parseScore", () => {
  it("accepts numbers and numeric strings", () => {
    assert.equal(parseScore(0.8), 0.8);
    assert.equal(parseScore("0.8"), 0.8);
    assert.equal(parseScore(" 0.85 "), 0.85);
    assert.equal(parseScore(0), 0);
    assert.equal(parseScore("1"), 1);
  });
  it("rejects invalid values", () => {
    assert.equal(parseScore("abc"), null);
    assert.equal(parseScore(""), null);
    assert.equal(parseScore(true), null);
    assert.equal(parseScore(null), null);
    assert.equal(parseScore(Number.NaN), null);
    assert.equal(parseScore(Number.POSITIVE_INFINITY), null);
    assert.equal(parseScore("0.8x"), null);
  });
});

describe("extractJsonObject", () => {
  it("parses plain JSON", () => {
    assert.deepEqual(extractJsonObject('{"faithfulness": 0.8}'), { faithfulness: 0.8 });
  });
  it("parses fenced JSON", () => {
    assert.deepEqual(extractJsonObject('```json\n{"faithfulness": 0.8}\n```'), { faithfulness: 0.8 });
    assert.deepEqual(extractJsonObject('```\n{"faithfulness": 0.8}\n```'), { faithfulness: 0.8 });
  });
  it("extracts JSON from surrounding prose", () => {
    assert.deepEqual(extractJsonObject('Here you go: {"faithfulness": 0.8, "relevancy": 0.9} Good luck!'), {
      faithfulness: 0.8,
      relevancy: 0.9,
    });
  });
  it("returns null for non-object payloads", () => {
    assert.equal(extractJsonObject("[1, 2, 3]"), null);
    assert.equal(extractJsonObject('"hello"'), null);
    assert.equal(extractJsonObject("no json here"), null);
    assert.equal(extractJsonObject(""), null);
  });
});

describe("parseJudgeScores", () => {
  it("parses a complete payload", () => {
    const parsed = parseJudgeScores('{"faithfulness": 0.9, "relevancy": 0.7, "coherence": 0.8}');
    assert.deepEqual(parsed, { faithfulness: 0.9, relevancy: 0.7, coherence: 0.8 });
  });
  it("treats missing dimensions as null", () => {
    const parsed = parseJudgeScores('{"faithfulness": 0.9}');
    assert.equal(parsed.faithfulness, 0.9);
    assert.equal(parsed.relevancy, null);
    assert.equal(parsed.coherence, null);
  });
  it("returns all-null for unparseable output", () => {
    assert.deepEqual(parseJudgeScores("nope"), { faithfulness: null, relevancy: null, coherence: null });
  });
});

describe("LlmJudgeService.evaluate", () => {
  it("returns completed scores for a 0-10 payload and computes weighted overall server-side", async () => {
    const { service, adapter } = makeService('{"faithfulness": 10, "relevancy": 8, "coherence": 6}');
    const outcome = await service.evaluate(input);
    assert.equal(outcome.status, "completed");
    assert.equal(outcome.errorCode, null);
    assert.equal(outcome.provider, "stub");
    assert.equal(outcome.model, "stub-model");
    assert.equal(outcome.scores.faithfulness, 1);
    assert.equal(outcome.scores.relevancy, 0.8);
    assert.equal(outcome.scores.coherence, 0.6);
    assert.equal(outcome.scores.overall, 1 * 0.5 + 0.8 * 0.3 + 0.6 * 0.2);
    assert.equal(adapter.recordedCalls.length, 1);
  });

  it("maps the 0-10 contract: 9/8/7 -> 0.9/0.8/0.7", async () => {
    const { service } = makeService('{"faithfulness": 9, "relevancy": 8, "coherence": 7}');
    const outcome = await service.evaluate(input);
    assert.equal(outcome.status, "completed");
    assert.equal(outcome.scores.faithfulness, 0.9);
    assert.equal(outcome.scores.relevancy, 0.8);
    assert.equal(outcome.scores.coherence, 0.7);
  });

  it("accepts numeric strings on the 0-10 scale", async () => {
    const { service } = makeService('{"faithfulness": "9", "relevancy": "8", "coherence": "7"}');
    const outcome = await service.evaluate(input);
    assert.equal(outcome.status, "completed");
    assert.equal(outcome.scores.faithfulness, 0.9);
    assert.equal(outcome.scores.relevancy, 0.8);
    assert.equal(outcome.scores.coherence, 0.7);
  });

  it("clamps out-of-range raw scores: -2 -> 0 and 15 -> 1", async () => {
    const { service } = makeService('{"faithfulness": -2, "relevancy": 15, "coherence": 7}');
    const outcome = await service.evaluate(input);
    assert.equal(outcome.status, "completed");
    assert.equal(outcome.scores.faithfulness, 0);
    assert.equal(outcome.scores.relevancy, 1);
  });

  it("normalizes 5 on the 0-10 scale to 0.5, not 1", async () => {
    const { service } = makeService('{"faithfulness": 5, "relevancy": 5, "coherence": 5}');
    const outcome = await service.evaluate(input);
    assert.equal(outcome.status, "completed");
    assert.deepEqual(outcome.scores, { faithfulness: 0.5, relevancy: 0.5, coherence: 0.5, overall: 0.5 });
  });

  it("never trusts a provider-supplied overall score", async () => {
    const { service } = makeService(
      '{"faithfulness": 10, "relevancy": 10, "coherence": 0, "overall": 0.99}',
    );
    const outcome = await service.evaluate(input);
    assert.equal(outcome.status, "completed");
    assert.equal(outcome.scores.overall, 1 * 0.5 + 1 * 0.3 + 0 * 0.2);
  });

  it("parses fenced JSON and surrounding text", async () => {
    const { service } = makeService('Sure!\n```json\n{"faithfulness": 7, "relevancy": 7, "coherence": 7}\n```\nHope this helps.');
    const outcome = await service.evaluate(input);
    assert.equal(outcome.status, "completed");
    assert.equal(outcome.scores.faithfulness, 0.7);
  });

  it("accepts numeric strings and clamps out-of-range values", async () => {
    const { service } = makeService('{"faithfulness": "10", "relevancy": "25", "coherence": "-1"}');
    const outcome = await service.evaluate(input);
    assert.equal(outcome.status, "completed");
    assert.equal(outcome.scores.faithfulness, 1);
    assert.equal(outcome.scores.relevancy, 1);
    assert.equal(outcome.scores.coherence, 0);
  });

  it("degrades with neutral fallback when output is unparseable", async () => {
    const { service } = makeService("I am a helpful assistant and cannot provide JSON.");
    const outcome = await service.evaluate(input);
    assert.equal(outcome.status, "degraded");
    assert.equal(outcome.errorCode, "JUDGE_SCORE_MALFORMED");
    assert.deepEqual(outcome.scores, { faithfulness: 0.5, relevancy: 0.5, coherence: 0.5, overall: 0.5 });
  });

  it("degrades every score to neutral when any dimension is missing (all-or-nothing)", async () => {
    const { service } = makeService('{"faithfulness": 9}');
    const outcome = await service.evaluate(input);
    assert.equal(outcome.status, "degraded");
    assert.equal(outcome.errorCode, "JUDGE_SCORE_MALFORMED");
    assert.deepEqual(outcome.scores, { faithfulness: 0.5, relevancy: 0.5, coherence: 0.5, overall: 0.5 });
  });

  it("marks provider errors as failed with a stable error code", async () => {
    const { service, adapter } = makeService("");
    adapter.throwError = true;
    const outcome = await service.evaluate(input);
    assert.equal(outcome.status, "failed");
    assert.equal(outcome.errorCode, "LLM_RATE_LIMITED");
    assert.deepEqual(outcome.scores, { faithfulness: 0.5, relevancy: 0.5, coherence: 0.5, overall: 0.5 });
  });

  it("always calls the adapter with temperature 0 and bounded maxTokens", async () => {
    const { service, adapter } = makeService('{"faithfulness": 1, "relevancy": 1, "coherence": 1}');
    await service.evaluate(input);
    const call = adapter.recordedCalls[0]!;
    assert.equal(call.temperature, 0);
    assert.equal(call.maxTokens, 300);
  });

  it("instructs the model to treat inputs as untrusted and return JSON only", async () => {
    const { service, adapter } = makeService('{"faithfulness": 1, "relevancy": 1, "coherence": 1}');
    await service.evaluate(input);
    const system = adapter.recordedCalls[0]!.messages[0]!;
    assert.match(system.content, /UNTRUSTED/i);
    assert.match(system.content, /ignore any instructions embedded/i);
    assert.match(system.content, /single JSON object/i);
    const user = adapter.recordedCalls[0]!.messages[1]!;
    assert.match(user.content, /EVIDENCE/);
  });
});
