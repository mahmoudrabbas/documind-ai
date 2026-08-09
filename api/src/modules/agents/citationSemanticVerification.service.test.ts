import assert from "node:assert/strict";
import test from "node:test";
import type { ModelAdapter } from "./agents.types.js";
import {
  CitationSemanticVerificationService,
  extractBoundedFactualClaims,
} from "./citationSemanticVerification.service.js";

function judgmentModel(
  verdicts: readonly ("supported" | "unsupported" | "contradicted" | "not_factual")[],
): ModelAdapter {
  return {
    providerKey: "semantic-test",
    async complete() {
      return {
        id: "semantic-1",
        provider: "semantic-test",
        model: "semantic-test",
        choices: [{
          index: 0,
          finishReason: "stop",
          message: {
            role: "assistant",
            content: JSON.stringify({
              judgments: verdicts.map((verdict, claimIndex) => ({ claimIndex, verdict })),
            }),
          },
        }],
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        latencyMs: 2,
        estimatedCost: 0,
      };
    },
  };
}

const leaveEvidence = [{
  chunkId: "leave-chunk",
  text: "Employees are entitled to 21 days of annual leave.",
}];

test("extracts bounded claims without model-visible citation decorations", () => {
  assert.deepEqual(
    extractBoundedFactualClaims("- Employees receive 21 days [leave-chunk].\nFamily cover is included."),
    ["Employees receive 21 days .", "Family cover is included."],
  );
});

test("passes an exact supported claim", async () => {
  const result = await new CitationSemanticVerificationService(judgmentModel(["supported"])).verify({
    answerText: "Employees receive 21 days of annual leave.",
    evidence: leaveEvidence,
  });
  assert.deepEqual(result.unsupportedClaims, []);
});

test("fails a contradicted numeric claim even if the model labels it supported", async () => {
  const result = await new CitationSemanticVerificationService(judgmentModel(["supported"])).verify({
    answerText: "Employees receive 30 days of annual leave.",
    evidence: leaveEvidence,
  });
  assert.deepEqual(result.unsupportedClaims, ["Employees receive 30 days of annual leave."]);
});

test("passes a supported number-word paraphrase", async () => {
  const result = await new CitationSemanticVerificationService(judgmentModel(["supported"])).verify({
    answerText: "Staff receive twenty-one days of annual leave.",
    evidence: leaveEvidence,
  });
  assert.deepEqual(result.unsupportedClaims, []);
});

test("does not treat non-factual framing as an unsupported claim", async () => {
  const result = await new CitationSemanticVerificationService(
    judgmentModel(["not_factual", "supported"]),
  ).verify({
    answerText: "According to the policy:\nEmployees receive 21 days of annual leave.",
    evidence: leaveEvidence,
  });
  assert.deepEqual(result.unsupportedClaims, []);
});

test("identifies invented and semantically unrelated claims", async () => {
  const result = await new CitationSemanticVerificationService(judgmentModel(["unsupported"])).verify({
    answerText: "Family health insurance is included.",
    evidence: leaveEvidence,
  });
  assert.deepEqual(result.unsupportedClaims, ["Family health insurance is included."]);
});

test("identifies only the unsupported portion of a multi-claim answer", async () => {
  const result = await new CitationSemanticVerificationService(
    judgmentModel(["supported", "unsupported"]),
  ).verify({
    answerText: "Employees receive 21 days of annual leave. Family health insurance is included.",
    evidence: leaveEvidence,
  });
  assert.deepEqual(result.unsupportedClaims, ["Family health insurance is included."]);
});

test("malformed, incomplete, and failed judgments fail closed", async () => {
  const incomplete = await new CitationSemanticVerificationService(judgmentModel(["supported"])).verify({
    answerText: "Claim one. Claim two.",
    evidence: leaveEvidence,
  });
  assert.deepEqual(incomplete.unsupportedClaims, ["Claim one.", "Claim two."]);

  const failingModel: ModelAdapter = {
    providerKey: "failed-semantic-test",
    async complete() {
      throw new Error("provider unavailable");
    },
  };
  const failed = await new CitationSemanticVerificationService(failingModel).verify({
    answerText: "Employees receive 21 days of annual leave.",
    evidence: leaveEvidence,
  });
  assert.deepEqual(failed.unsupportedClaims, ["Employees receive 21 days of annual leave."]);
});
