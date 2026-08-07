import test from "node:test";
import assert from "node:assert/strict";
import {
  AnswerWriterService,
  type AnswerWriterEvidenceItem,
} from "./answerWriter.service.js";
import { FailoverModelAdapter } from "../../providers/llm/failoverModelAdapter.js";
import { AppError } from "../../common/errors/AppError.js";
import { LLM_PROVIDER_UNAVAILABLE } from "../../common/errors/errorCodes.js";
import type { AvailabilityProbeModelAdapter } from "../../providers/llm/failoverModelAdapter.js";
import type { ModelCompletionResponse } from "./agents.types.js";

const CHUNK_A = "chunk-a";

const EVIDENCE: AnswerWriterEvidenceItem[] = [
  {
    chunkId: CHUNK_A,
    documentId: "507f1f77bcf86cd799439014",
    text: "CivicOps runs an annual flood-response drill every Q1.",
  },
];

const GROUNDED_JSON = JSON.stringify({
  decision: "grounded_answer",
  answer: "The drill runs every Q1.",
  citedChunkIds: [CHUNK_A],
});

/**
 * Probe-capable adapter used as a failover member: reports availability and
 * records every complete() call including the structured-output request.
 */
class RecordingProbeAdapter implements AvailabilityProbeModelAdapter {
  readonly providerKey: string;
  calls: Array<Record<string, unknown>> = [];
  completeError?: unknown;
  probeResult: { available: boolean; reason?: string };

  constructor(
    providerKey: string,
    options: {
      probeResult?: { available: boolean; reason?: string };
      completeError?: unknown;
    } = {},
  ) {
    this.providerKey = providerKey;
    this.probeResult = options.probeResult ?? { available: true };
    this.completeError = options.completeError;
  }

  async checkAvailability(): Promise<{ available: boolean; reason?: string }> {
    return this.probeResult;
  }

  async complete(params: Record<string, unknown>): Promise<ModelCompletionResponse> {
    this.calls.push({ ...params });
    if (this.completeError !== undefined) {
      throw this.completeError;
    }
    return {
      id: `${this.providerKey}-1`,
      provider: this.providerKey,
      model: `${this.providerKey}-model`,
      choices: [
        { index: 0, message: { role: "assistant", content: GROUNDED_JSON }, finishReason: "stop" },
      ],
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      latencyMs: 5,
      estimatedCost: 0,
    };
  }
}

function generateArgs() {
  return {
    conversationId: "507f1f77bcf86cd799439013",
    question: "When does the flood drill run?",
    task: "direct_question" as const,
    citationsEnabled: true,
    evidence: EVIDENCE,
    maxTokens: 2048,
  };
}

test("AnswerWriter fails over to the fallback when the primary probe reports it down", async () => {
  const primary = new RecordingProbeAdapter("iti-bedrock", { probeResult: { available: false, reason: "gateway down" } });
  const fallback = new RecordingProbeAdapter("groq");
  const service = new AnswerWriterService(new FailoverModelAdapter([primary, fallback]));

  const result = await service.generate(generateArgs());

  assert.ok(result.outcome === "usable");
  assert.equal((result as Extract<typeof result, { outcome: "usable" }>).structured, true);
  assert.equal((result as Extract<typeof result, { outcome: "usable" }>).providerKey, "failover(iti-bedrock,groq)");
  assert.equal((result as Extract<typeof result, { outcome: "usable" }>).answer, "The drill runs every Q1.");
  assert.deepEqual((result as Extract<typeof result, { outcome: "usable" }>).citedChunkIds, [CHUNK_A]);
  assert.equal(primary.calls.length, 0, "downed primary must never receive a completion");
  assert.equal(fallback.calls.length, 1);
});

test("AnswerWriter fails over when the primary completion reports the provider unavailable", async () => {
  const primary = new RecordingProbeAdapter("iti-bedrock", {
    completeError: new AppError(503, LLM_PROVIDER_UNAVAILABLE, "gateway unavailable"),
  });
  const fallback = new RecordingProbeAdapter("groq");
  const service = new AnswerWriterService(new FailoverModelAdapter([primary, fallback]));

  const result = await service.generate(generateArgs());

  assert.ok(result.outcome === "usable");
  const usable = result as Extract<typeof result, { outcome: "usable" }>;
  assert.equal(usable.structured, true);
  assert.equal(usable.providerKey, "failover(iti-bedrock,groq)");
  assert.equal(primary.calls.length, 1);
  assert.equal(fallback.calls.length, 1);
});

test("AnswerWriter forwards the structured-output request to the surviving provider", async () => {
  const primary = new RecordingProbeAdapter("iti-bedrock", { probeResult: { available: false } });
  const fallback = new RecordingProbeAdapter("groq");
  const service = new AnswerWriterService(new FailoverModelAdapter([primary, fallback]));

  await service.generate(generateArgs());

  const fallbackCall = fallback.calls[0] as { structuredOutput?: { type: "json_object" } };
  assert.deepEqual(fallbackCall.structuredOutput, { type: "json_object" });
});

test("AnswerWriter surfaces a controlled error when every provider fails", async () => {
  const primary = new RecordingProbeAdapter("iti-bedrock", { probeResult: { available: false } });
  const fallback = new RecordingProbeAdapter("groq", {
    completeError: new AppError(503, LLM_PROVIDER_UNAVAILABLE, "groq down too"),
  });
  const service = new AnswerWriterService(new FailoverModelAdapter([primary, fallback]));

  await assert.rejects(
    service.generate(generateArgs()),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal((error as AppError).code, LLM_PROVIDER_UNAVAILABLE);
      assert.equal((error as AppError).message, "groq down too");
      return true;
    },
  );
});

/**
 * A completed-but-broken primary response must NOT trigger failover: malformed
 * JSON and schema-rejected output are a deterministic answerWriter contract
 * problem, not a provider-availability problem. The service fails closed and
 * the fallback must never be consulted.
 */
function serviceWithBrokenContent(content: string): {
  service: AnswerWriterService;
  fallback: RecordingProbeAdapter;
} {
  const primary = new (class extends RecordingProbeAdapter {
    override async complete(): Promise<ModelCompletionResponse> {
      this.calls.push({});
      return {
        id: "iti-1",
        provider: "iti-bedrock",
        model: "iti-model",
        choices: [
          { index: 0, message: { role: "assistant", content }, finishReason: "stop" },
        ],
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        latencyMs: 5,
        estimatedCost: 0,
      };
    }
  })("iti-bedrock");
  const fallback = new RecordingProbeAdapter("groq");
  return {
    service: new AnswerWriterService(new FailoverModelAdapter([primary, fallback])),
    fallback,
  };
}

test("AnswerWriter does NOT fail over on malformed JSON", async () => {
  const { service, fallback } = serviceWithBrokenContent('{"decision": "grounded_answer", "answer": ');

  const result = await service.generate(generateArgs());

  assert.ok(result.outcome === "usable");
  assert.equal((result as Extract<typeof result, { outcome: "usable" }>).structured, false);
  assert.equal(fallback.calls.length, 0, "malformed JSON must not trigger Groq failover");
});

test("AnswerWriter does NOT fail over on Zod-invalid structured output", async () => {
  const { service, fallback } = serviceWithBrokenContent(
    JSON.stringify({ decision: "grounded_answer", answer: "ok", citedChunkIds: ["unknown-chunk"], extraKey: true }),
  );

  const result = await service.generate(generateArgs());

  assert.ok(result.outcome === "usable");
  assert.equal((result as Extract<typeof result, { outcome: "usable" }>).structured, false);
  assert.equal(fallback.calls.length, 0, "schema-invalid output must not trigger Groq failover");
});
