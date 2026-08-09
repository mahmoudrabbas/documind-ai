import assert from "node:assert/strict";
import test from "node:test";
import type { ModelAdapter } from "./agents.types.js";
import {
  CitationSemanticVerificationService,
  extractBoundedFactualClaims,
} from "./citationSemanticVerification.service.js";

function judgmentModel(
  verdicts: readonly ("supported" | "unsupported" | "contradicted" | "not_factual")[],
  supportingByClaim: Readonly<Record<number, readonly string[]>> = {},
): ModelAdapter {
  return {
    providerKey: "semantic-test",
    async complete(params) {
      const payload = JSON.parse(params.messages.at(-1)?.content ?? "{}") as {
        evidence?: Array<{ chunkId: string }>;
      };
      const defaultChunkId = payload.evidence?.[0]?.chunkId;
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
              judgments: verdicts.map((verdict, claimIndex) => ({
                claimIndex,
                verdict,
                supportingChunkIds: verdict === "supported"
                  ? [...(supportingByClaim[claimIndex] ?? (defaultChunkId ? [defaultChunkId] : []))]
                  : [],
              })),
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
  assert.deepEqual(result.supportingEvidenceIds, ["leave-chunk"]);
});

test("fails a contradicted numeric claim even if the model labels it supported", async () => {
  const result = await new CitationSemanticVerificationService(judgmentModel(["supported"])).verify({
    answerText: "Employees receive 30 days of annual leave.",
    evidence: leaveEvidence,
  });
  assert.deepEqual(result.unsupportedClaims, ["Employees receive 30 days of annual leave."]);
});

test("passes question-sourced values used in valid threshold inferences", async () => {
  const cases = [
    {
      questionText: "Do receipts become mandatory above $20?",
      answerText: "No. Receipts do not become mandatory above $20; the rule applies above USD 25.",
      evidence: [{ chunkId: "receipt", text: "Receipts are required for any single expense greater than USD 25." }],
    },
    {
      questionText: "Can an employee who has worked for 30 days request regular remote work?",
      answerText: "No. An employee with 30 days does not meet the minimum of 90 days.",
      evidence: [{ chunkId: "remote", text: "Employees who completed at least 90 days may request regular remote work." }],
    },
    {
      questionText: "Are three quotations required for a $1500 purchase?",
      answerText: "No. A $1500 purchase is not above the USD 2,000 threshold.",
      evidence: [{ chunkId: "quotes", text: "For purchases above USD 2,000, at least three written vendor quotations are required." }],
    },
    {
      questionText: "Can I work remotely if I have been employed for 120 days?",
      answerText: "Yes. At 120 days, the minimum employment duration of 90 days is satisfied.",
      evidence: [{ chunkId: "remote", text: "Employees who completed at least 90 days may request regular remote work." }],
    },
  ];
  for (const input of cases) {
    const result = await new CitationSemanticVerificationService(judgmentModel(["supported", "supported"])).verify(input);
    assert.deepEqual(result.unsupportedClaims, [], input.questionText);
  }
});

test("keeps fixed-value contradictions strict even when the wrong value came from the question", async () => {
  const result = await new CitationSemanticVerificationService(judgmentModel(["supported"])).verify({
    questionText: "Does the account lock for 20 minutes after 5 failed logins?",
    answerText: "The account locks for 20 minutes after 5 failed logins.",
    evidence: [{ chunkId: "security", text: "After 5 consecutive failed login attempts, the account is locked for 30 minutes." }],
  });
  assert.deepEqual(result.unsupportedClaims, ["The account locks for 20 minutes after 5 failed logins."]);
});

test("rejects threshold comparisons with incompatible units", async () => {
  const result = await new CitationSemanticVerificationService(judgmentModel(["supported"])).verify({
    questionText: "Is 120 hours enough?",
    answerText: "The 120-hour duration satisfies the 90-day minimum.",
    evidence: [{ chunkId: "remote", text: "Employees who completed at least 90 days may request regular remote work." }],
  });
  assert.deepEqual(result.unsupportedClaims, ["The 120-hour duration satisfies the 90-day minimum."]);
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

test("returns only chunks that support released factual claims", async () => {
  const result = await new CitationSemanticVerificationService(
    judgmentModel(["supported"], { 0: ["remote-work"] }),
  ).verify({
    answerText: "Employees may request remote work after at least 90 days.",
    evidence: [
      { chunkId: "hr-policy", text: "Remote work is limited to two days per week." },
      { chunkId: "remote-work", text: "Employees with at least 90 days may request regular remote work." },
    ],
  });
  assert.deepEqual(result.unsupportedClaims, []);
  assert.deepEqual(result.supportingEvidenceIds, ["remote-work"]);
});

test("preserves multiple supporting chunks when distinct claims require them", async () => {
  const result = await new CitationSemanticVerificationService(
    judgmentModel(["supported", "supported"], {
      0: ["remote-work"],
      1: ["expense-policy"],
    }),
  ).verify({
    answerText: "Remote work requires 90 days. Meals are reimbursed up to USD 50.",
    evidence: [
      { chunkId: "remote-work", text: "Remote work requires at least 90 days of employment." },
      { chunkId: "expense-policy", text: "Meals are reimbursed up to USD 50." },
    ],
  });
  assert.deepEqual(result.unsupportedClaims, []);
  assert.deepEqual(result.supportingEvidenceIds, ["remote-work", "expense-policy"]);
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
