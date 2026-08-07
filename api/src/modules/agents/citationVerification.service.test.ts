import test from "node:test";
import assert from "node:assert/strict";
import { CitationVerificationService } from "./citationVerification.service.js";
import type { CitationVerifierInput } from "./chatAgentIO.js";

const APPROVED = ["chunk-b", "chunk-a", "chunk-c"];

function verify(overrides: Partial<CitationVerifierInput> = {}): ReturnType<
  typeof CitationVerificationService.verify
> {
  return CitationVerificationService.verify({
    decision: "grounded_answer",
    citedChunkIds: ["chunk-a", "chunk-b"],
    approvedEvidenceIds: APPROVED,
    ...overrides,
  });
}

test("CITATIONS_SKIPPED: non-grounded decision is never validated", () => {
  for (const decision of [
    "insufficient_evidence",
    "clarification",
    "unsupported",
    "unsafe",
  ] as const) {
    const result = verify({
      decision,
      citedChunkIds: ["chunk-a", "chunk-b"],
    });
    assert.deepEqual(result, {
      verified: true,
      validatedCitationIds: [],
      rejectedCitationIds: [],
      unsupportedClaims: [],
      reasonCode: "CITATIONS_SKIPPED",
    }, decision);
  }
});

test("CITATIONS_SKIPPED: non-grounded decision ignores cited chunks", () => {
  const result = verify({ decision: "unsupported", citedChunkIds: ["evil"] });
  assert.equal(result.verified, true);
  assert.deepEqual(result.rejectedCitationIds, []);
});

test("CITATIONS_VERIFIED: grounded with all citations valid", () => {
  const result = verify({ citedChunkIds: ["chunk-b", "chunk-a"] });
  assert.equal(result.verified, true);
  assert.equal(result.reasonCode, "CITATIONS_VERIFIED");
  assert.deepEqual(result.validatedCitationIds, ["chunk-b", "chunk-a"]);
  assert.deepEqual(result.rejectedCitationIds, []);
});

test("CITATIONS_VERIFIED: validated ids preserve approved-evidence order", () => {
  const result = verify({ citedChunkIds: ["chunk-a", "chunk-c", "chunk-b"] });
  assert.deepEqual(result.validatedCitationIds, ["chunk-b", "chunk-a", "chunk-c"]);
});

test("CITATIONS_VERIFIED: duplicate cited ids are deduped", () => {
  const result = verify({ citedChunkIds: ["chunk-a", "chunk-b", "chunk-a"] });
  assert.deepEqual(result.validatedCitationIds, ["chunk-b", "chunk-a"]);
  assert.deepEqual(result.rejectedCitationIds, []);
});

test("MISSING_CITATIONS: grounded with zero citations fails closed", () => {
  const result = verify({ citedChunkIds: [] });
  assert.equal(result.verified, false);
  assert.equal(result.reasonCode, "MISSING_CITATIONS");
  assert.deepEqual(result.validatedCitationIds, []);
  assert.deepEqual(result.rejectedCitationIds, []);
});

test("CITATIONS_VERIFIED: grounded with partial validity keeps valid subset", () => {
  const result = verify({ citedChunkIds: ["chunk-a", "evil-chunk"] });
  assert.equal(result.verified, true);
  assert.equal(result.reasonCode, "CITATIONS_VERIFIED");
  assert.deepEqual(result.validatedCitationIds, ["chunk-a"]);
  assert.deepEqual(result.rejectedCitationIds, ["evil-chunk"]);
});

test("MISSING_CITATIONS: grounded with undefined approved evidence fails closed", () => {
  const result = verify({ citedChunkIds: ["chunk-a"], approvedEvidenceIds: undefined });
  assert.equal(result.verified, false);
  assert.deepEqual(result.rejectedCitationIds, ["chunk-a"]);
});

test("MISSING_CITATIONS: rejected ids preserve original cited order", () => {
  const result = verify({ citedChunkIds: ["evil-2", "chunk-a", "evil-1"] });
  assert.deepEqual(result.rejectedCitationIds, ["evil-2", "evil-1"]);
});

test("unsupportedClaims stays empty (extension point, no LLM)", () => {
  for (const result of [
    verify(),
    verify({ decision: "unsafe", citedChunkIds: [] }),
    verify({ citedChunkIds: ["chunk-a", "evil"] }),
  ]) {
    assert.deepEqual(result.unsupportedClaims, []);
  }
});

test("duplicate approved ids do not change outcome", () => {
  const result = verify({
    citedChunkIds: ["chunk-a"],
    approvedEvidenceIds: ["chunk-a", "chunk-a", "chunk-b"],
  });
  assert.equal(result.verified, true);
  assert.deepEqual(result.validatedCitationIds, ["chunk-a"]);
});

// ── Arabic evidence flow: cited ids map to approved evidence ──────────────────

test("Arabic grounded citedChunkIds that map to approved evidence are verified and validated", () => {
  // Simulates an Arabic summary where the model copied the id: anchor from the
  // Arabic context block. The cited id is a member of the server-authorized
  // reranker evidence, so it must survive verification.
  const result = CitationVerificationService.verify({
    decision: "grounded_answer",
    citedChunkIds: ["chunk-1"],
    approvedEvidenceIds: ["chunk-1", "chunk-2"],
  });
  assert.equal(result.verified, true, "Arabic grounded cited id maps to approved evidence");
  assert.equal(result.reasonCode, "CITATIONS_VERIFIED");
  assert.deepEqual(result.validatedCitationIds, ["chunk-1"]);
  assert.deepEqual(result.rejectedCitationIds, []);
});

test("Arabic grounded citedChunkIds referencing unknown ids are rejected and fail closed", () => {
  // The Arabic model invented a citation id that was never in the evidence
  // bundle: it must not survive verification.
  const result = CitationVerificationService.verify({
    decision: "grounded_answer",
    citedChunkIds: ["invented-1"],
    approvedEvidenceIds: ["chunk-1"],
  });
  assert.equal(result.verified, false, "invented Arabic citation must fail verification");
  assert.equal(result.reasonCode, "MISSING_CITATIONS");
  assert.deepEqual(result.validatedCitationIds, []);
  assert.deepEqual(result.rejectedCitationIds, ["invented-1"]);
});
