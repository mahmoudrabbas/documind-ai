import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../../common/errors/AppError.js";
import type { ModelAdapter, ModelCompletionResponse } from "./agents.types.js";
import {
  CitationSemanticVerificationService,
  extractBoundedFactualClaims,
  MAX_UNKNOWN_RETRIES,
  prepareSemanticClaims,
} from "./citationSemanticVerification.service.js";

const evidence = [
  { chunkId: "policy-a", text: "Employees receive 21 days of annual leave. Remote work is allowed two days per week. Core hours are 10 AM to 3 PM." },
  { chunkId: "policy-b", text: "The company supplies one laptop. Confidential records must use approved security controls." },
];

interface Payload { claims: string[] }
type Script = (payload: Payload, call: number) => unknown | Error;

function payloadFrom(content: string): Payload {
  const match = /SEMANTIC_VERIFICATION_DATA_START\n(?<json>.*)\nSEMANTIC_VERIFICATION_DATA_END/su.exec(content);
  assert.ok(match?.groups?.json);
  return JSON.parse(match.groups.json) as Payload;
}

function completion(content: unknown, provider = "scripted-verifier"): ModelCompletionResponse {
  return {
    id: "verification",
    provider,
    model: "verifier-model",
    choices: [{
      index: 0,
      finishReason: "stop",
      message: { role: "assistant", content: typeof content === "string" ? content : JSON.stringify(content) },
    }],
    usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 },
    latencyMs: 4,
    estimatedCost: 0.001,
  };
}

function scriptedModel(script: Script): ModelAdapter & { calls: Payload[] } {
  const calls: Payload[] = [];
  return {
    providerKey: "scripted-verifier",
    calls,
    async complete(params) {
      assert.equal(params.temperature, 0);
      assert.deepEqual(params.structuredOutput, { type: "json_object" });
      const payload = payloadFrom(params.messages.at(-1)?.content ?? "");
      calls.push(payload);
      const value = script(payload, calls.length);
      if (value instanceof Error) throw value;
      return completion(value);
    },
  };
}

function judgments(
  payload: Payload,
  state: (claim: string, index: number) => "supported" | "unsupported" | "contradicted" | "missing" = () => "supported",
): unknown {
  return {
    judgments: payload.claims.flatMap((claim, index) => {
      const verdict = state(claim, index);
      return verdict === "missing" ? [] : [{
        claimIndex: index,
        verdict,
        supportingEvidenceIds: verdict === "supported" ? ["policy-a"] : [],
      }];
    }),
  };
}

const supportAll = (payload: Payload): unknown => judgments(payload);

test("deterministic preparation strips bullets, numbering, headings, labels, and non-factual preambles", () => {
  const answer = [
    "## Policy summary",
    "The following key points apply:",
    "1. Leave: **Employees receive 21 days of annual leave.**",
    "- Schedule: Remote work is allowed two days per week.",
  ].join("\n");
  const prepared = prepareSemanticClaims(answer);
  assert.deepEqual(prepared.factualClaims.map((claim) => claim.text), [
    "Employees receive 21 days of annual leave.",
    "Remote work is allowed two days per week.",
  ]);
  assert.deepEqual(prepared.factualClaims.map((claim) => claim.answerClaimIndex), [2, 3]);
});

test("safe independent clauses become atomic claims without inventing abstract atoms", () => {
  assert.deepEqual(
    extractBoundedFactualClaims("Employees receive 21 days of leave; remote workers must observe core hours."),
    ["Employees receive 21 days of leave.", "remote workers must observe core hours."],
  );
  assert.deepEqual(
    extractBoundedFactualClaims("The company supplies one laptop and one headset."),
    ["The company supplies one laptop and one headset."],
  );
});

test("four supported claims remain supported and pass the final gate", async () => {
  const model = scriptedModel(supportAll);
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Alpha fact. Beta fact. Gamma fact. Delta fact.",
    evidence,
  });
  assert.deepEqual(result.claimResults.map((claim) => claim.state), ["SUPPORTED", "SUPPORTED", "SUPPORTED", "SUPPORTED"]);
  assert.equal(result.releasedAnswerText, "Alpha fact. Beta fact. Gamma fact. Delta fact.");
  assert.equal(model.calls.length, 2, "initial and mandatory final passes");
});

test("three supported plus one explicit unsupported preserves and releases only supported claims", async () => {
  const model = scriptedModel((payload) => judgments(payload, (claim) => claim.includes("Fabricated") ? "unsupported" : "supported"));
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Fact one. Fact two. Fabricated benefit. Fact three.",
    evidence,
  });
  assert.deepEqual(result.claimResults.map((claim) => claim.state), ["SUPPORTED", "SUPPORTED", "UNSUPPORTED", "SUPPORTED"]);
  assert.equal(result.releasedAnswerText, "Fact one.\nFact two.\nFact three.");
  assert.doesNotMatch(result.releasedAnswerText ?? "", /Fabricated/u);
});

test("a missing judgment is UNKNOWN while completed supported judgments are preserved", async () => {
  const model = scriptedModel((payload) => judgments(payload, (claim) => claim.includes("Unresolved") ? "missing" : "supported"));
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Fact one. Fact two. Unresolved fact. Fact three.",
    evidence,
  });
  assert.deepEqual(result.claimResults.map((claim) => claim.state), ["SUPPORTED", "SUPPORTED", "UNKNOWN", "SUPPORTED"]);
  assert.deepEqual(result.unknownClaims, ["Unresolved fact."]);
  assert.equal(result.retryCount, MAX_UNKNOWN_RETRIES);
  assert.equal(result.releasedAnswerText, "Fact one.\nFact two.\nFact three.");
});

test("UNKNOWN succeeds on its single bounded retry", async () => {
  const model = scriptedModel((payload, call) => judgments(payload, (_claim, index) => call === 1 && index === 1 ? "missing" : "supported"));
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Fact one. Fact two.",
    evidence,
  });
  assert.deepEqual(result.claimResults.map((claim) => claim.state), ["SUPPORTED", "SUPPORTED"]);
  assert.equal(result.retryCount, 1);
  assert.equal(model.calls[1]?.claims.length, 1, "only the unknown claim is retried");
  assert.equal(result.releasedAnswerText, "Fact one. Fact two.");
});

test("UNKNOWN remains unresolved after the bounded retry and is never released", async () => {
  const model = scriptedModel((payload) => judgments(payload, (claim) => claim.includes("Unknown") ? "missing" : "supported"));
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Grounded fact. Unknown fact.",
    evidence,
  });
  assert.equal(result.retryCount, 1);
  assert.equal(result.claimResults[1]?.state, "UNKNOWN");
  assert.equal(result.releasedAnswerText, "Grounded fact.");
});

test("duplicate judgment index makes only the affected claim UNKNOWN", async () => {
  const model = scriptedModel((payload) => ({
    judgments: payload.claims.flatMap((claim, index) => claim.includes("Duplicate")
      ? [
          { claimIndex: index, verdict: "supported", supportingEvidenceIds: ["policy-a"] },
          { claimIndex: index, verdict: "supported", supportingEvidenceIds: ["policy-a"] },
        ]
      : [{ claimIndex: index, verdict: "supported", supportingEvidenceIds: ["policy-a"] }]),
  }));
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Fact one. Duplicate fact. Fact three.",
    evidence,
  });
  assert.deepEqual(result.claimResults.map((claim) => claim.state), ["SUPPORTED", "UNKNOWN", "SUPPORTED"]);
  assert.equal(result.releasedAnswerText, "Fact one.\nFact three.");
});

test("malformed structured responses remain UNKNOWN and fail closed", async () => {
  const model = scriptedModel(() => "not-json");
  const result = await new CitationSemanticVerificationService(model).verify({ answerText: "A factual claim.", evidence });
  assert.deepEqual(result.unknownClaims, ["A factual claim."]);
  assert.equal(result.releasedAnswerText, undefined);
  assert.equal(model.calls.length, 2, "malformed output receives only the bounded UNKNOWN retry");
});

test("valid citation membership with unrelated evidence is semantically unsupported", async () => {
  const model = scriptedModel((payload) => judgments(payload, () => "unsupported"));
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Family health insurance is included.",
    evidence,
  });
  assert.deepEqual(result.unsupportedClaims, ["Family health insurance is included."]);
  assert.equal(result.releasedAnswerText, undefined);
});

test("numeric contradiction is authoritative and is not sent to or salvaged by the model", async () => {
  const model = scriptedModel(supportAll);
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Employees receive 30 days of annual leave.",
    evidence: [{ chunkId: "policy-a", text: "Employees receive 90 days of annual leave." }],
  });
  assert.equal(result.claimResults[0]?.state, "UNSUPPORTED");
  assert.equal(result.claimResults[0]?.deterministicContradiction, true);
  assert.equal(model.calls.length, 0);
  assert.equal(result.releasedAnswerText, undefined);
});

test("compound claim passes when all safely split atoms are supported", async () => {
  const result = await new CitationSemanticVerificationService(scriptedModel(supportAll)).verify({
    answerText: "Employees receive leave; remote workers must observe core hours.", evidence,
  });
  assert.equal(result.releasedAnswerText, "Employees receive leave; remote workers must observe core hours.");
  assert.equal(result.claimResults.length, 2);
});

test("unsupported atom is removed safely from a compound claim", async () => {
  const model = scriptedModel((payload) => judgments(payload, (claim) => claim.includes("company cars") ? "unsupported" : "supported"));
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Employees receive 21 days of leave; employees receive company cars.", evidence,
  });
  assert.equal(result.releasedAnswerText, "Employees receive 21 days of leave.");
  assert.doesNotMatch(result.releasedAnswerText ?? "", /cars/u);
});

test("six supported facts survive one fabricated fact and final verification", async () => {
  const facts = ["Alpha is supported.", "Beta is supported.", "Gamma is supported.", "Delta is supported.", "Epsilon is supported.", "Zeta is supported."];
  const model = scriptedModel((payload) => judgments(payload, (claim) => claim.includes("Fabricated") ? "unsupported" : "supported"));
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: [...facts, "Fabricated seventh fact."].join(" "), evidence,
  });
  assert.equal(result.releasedClaimCount, 6);
  assert.equal(result.reasonCode, "SEMANTIC_VERIFIED");
  assert.doesNotMatch(result.releasedAnswerText ?? "", /Fabricated/u);
});

test("all unsupported or unresolved claims produce no releasable answer", async () => {
  for (const verdict of ["unsupported", "missing"] as const) {
    const result = await new CitationSemanticVerificationService(
      scriptedModel((payload) => judgments(payload, () => verdict)),
    ).verify({ answerText: "Claim one. Claim two.", evidence });
    assert.equal(result.releasedAnswerText, undefined);
  }
});

test("mandatory final verification blocks a candidate when the verifier later rejects it", async () => {
  const model = scriptedModel((payload, call) => judgments(payload, () => call === 1 ? "supported" : "unsupported"));
  const result = await new CitationSemanticVerificationService(model).verify({ answerText: "Initially supported fact.", evidence });
  assert.equal(result.claimResults[0]?.state, "SUPPORTED");
  assert.equal(result.releasedAnswerText, undefined);
  assert.equal(result.reasonCode, "SEMANTIC_VERIFICATION_FAILED");
});

test("redundant factual summary is verified as written without invented category atoms", async () => {
  const model = scriptedModel(supportAll);
  const summary = "Overall, the policy covers leave, remote scheduling, and security.";
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: `Employees receive 21 days of leave. ${summary}`,
    evidence,
  });
  assert.ok(result.releasedAnswerText);
  assert.equal(model.calls[0]?.claims.at(-1), summary);
});

test("unsupported summary addition is removed before final verification", async () => {
  const summary = "Overall, the policy includes free company cars.";
  const model = scriptedModel((payload) => judgments(payload, (claim) => claim === summary ? "unsupported" : "supported"));
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: `Employees receive 21 days of leave. ${summary}`,
    evidence,
  });
  assert.equal(result.releasedAnswerText, "Employees receive 21 days of leave.");
});

test("safe provider field-name, casing, and string-index variants normalize", async () => {
  const model = scriptedModel((payload) => ({
    judgments: payload.claims.map((_claim, index) => ({
      claim_index: String(index),
      verdict: "SUPPORTED",
      supporting_evidence_ids: ["policy-a"],
    })),
  }));
  const result = await new CitationSemanticVerificationService(model).verify({ answerText: "Supported fact.", evidence });
  assert.equal(result.releasedAnswerText, "Supported fact.");
});

test("invalid supporting evidence membership remains UNKNOWN", async () => {
  const model = scriptedModel((payload) => ({
    judgments: payload.claims.map((_claim, index) => ({ claimIndex: index, verdict: "supported", supportingEvidenceIds: ["not-authorized"] })),
  }));
  const result = await new CitationSemanticVerificationService(model).verify({ answerText: "Supported fact.", evidence });
  assert.equal(result.claimResults[0]?.state, "UNKNOWN");
  assert.equal(result.releasedAnswerText, undefined);
});

test("Arabic and English grounded answers both pass the common semantic contract", async () => {
  for (const answerText of ["Employees receive 21 days of annual leave.", "يحصل الموظفون على 21 يومًا من الإجازة السنوية."]) {
    const result = await new CitationSemanticVerificationService(scriptedModel(supportAll)).verify({ answerText, evidence });
    assert.equal(result.releasedAnswerText, answerText);
  }
});

test("scripted incomplete variations have deterministic safe release semantics across repeated runs", async () => {
  for (let run = 0; run < 5; run += 1) {
    const model = scriptedModel((payload, call) => judgments(payload, (_claim, index) => call <= 2 && index === run % 3 ? "missing" : "supported"));
    const result = await new CitationSemanticVerificationService(model).verify({
      answerText: "Grounded one. Grounded two. Grounded three.", evidence,
    });
    assert.ok(result.releasedAnswerText);
    assert.doesNotMatch(result.releasedAnswerText ?? "", /undefined|null/u);
    assert.ok(result.claimResults.some((claim) => claim.state === "UNKNOWN") || result.claimResults.every((claim) => claim.state === "SUPPORTED"));
  }
});

async function assertProviderError(error: Error, expectedCode: string): Promise<void> {
  const service = new CitationSemanticVerificationService(scriptedModel(() => error));
  await assert.rejects(
    service.verify({ answerText: "A factual claim.", evidence }),
    (caught: unknown) => caught instanceof AppError && caught.code === expectedCode,
  );
}

test("provider rate limits remain canonical infrastructure errors", async () => {
  await assertProviderError(Object.assign(new Error("vendor secret"), { status: 429 }), "LLM_RATE_LIMITED");
});

test("provider unavailability remains a canonical infrastructure error", async () => {
  await assertProviderError(Object.assign(new Error("vendor secret"), { status: 503 }), "LLM_PROVIDER_UNAVAILABLE");
});

test("provider timeout remains a canonical infrastructure error", async () => {
  await assertProviderError(Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }), "LLM_TIMEOUT");
});
