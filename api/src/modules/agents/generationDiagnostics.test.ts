import test from "node:test";
import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { createStructuredLogger } from "../../common/utils/structuredLogger.js";
import type { AnswerWriterServiceResult } from "./answerWriter.service.js";
import type {
  CitationVerifierInput,
  CitationVerifierOutput,
} from "./chatAgentIO.js";
import {
  buildAnswerWriterDiagnostics,
  buildCitationVerificationDiagnostics,
} from "./generationDiagnostics.js";

// ── secrets that must never appear in any diagnostics payload ───────────────

const SECRET_CHUNK_ID = "chunk-9f86d081884c7d659a2feaa0c55ad015a3bf4f1b";
const SECRET_DOC_ID = "doc-5f4dcc3b5aa765d61d8327deb882cf99";
const SECRET_ANSWER = "The 2026 bonus plan awards a 3x multiplier to top performers.";
const SECRET_RAW =
  '{"decision":"grounded_answer","answer":"UNCLASSIFIED-TOP-SECRET","citedChunkIds":["chunk-secret"]}';
const SECRET_API_KEY = "sk-live-7f8e9a1b2c3d4e5f6a7b8c9d";

const ALL_SECRETS = [
  SECRET_CHUNK_ID,
  SECRET_DOC_ID,
  SECRET_ANSWER,
  SECRET_RAW,
  SECRET_API_KEY,
];

function assertNoSecrets(label: string, payload: unknown): void {
  const serialized = JSON.stringify(payload);
  for (const secret of ALL_SECRETS) {
    assert.equal(
      serialized.includes(secret),
      false,
      `${label} must not contain ${secret.slice(0, 16)}...`,
    );
  }
}

interface TestCommon {
  rawContent: string;
  sanitizedContent: string;
  providerKey: string;
  modelName: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  estimatedCost: number;
}

function makeCommon(): TestCommon {
  return {
    rawContent: SECRET_RAW,
    sanitizedContent: SECRET_RAW,
    providerKey: "recording",
    modelName: "recording-model",
    promptTokens: 10,
    completionTokens: 20,
    totalTokens: 30,
    latencyMs: 5,
    estimatedCost: 0,
  };
}

function groundedStructuredResult(): AnswerWriterServiceResult {
  return {
    ...makeCommon(),
    outcome: "usable",
    structured: true,
    parsedDecision: "grounded_answer",
    decision: "grounded_answer",
    answer: SECRET_ANSWER,
    citedChunkIds: [SECRET_CHUNK_ID],
  };
}

function parseFailFallbackResult(): AnswerWriterServiceResult {
  return {
    ...makeCommon(),
    outcome: "usable",
    structured: false,
    parsedDecision: "insufficient_evidence",
    decision: "insufficient_evidence",
    answer: "I don't have sufficient authorized evidence to answer that question.",
    citedChunkIds: [],
  };
}

function unusableResult(): AnswerWriterServiceResult {
  return { ...makeCommon(), outcome: "unusable" };
}

// ── answer-writer diagnostics ───────────────────────────────────────────────

test("answer-writer diagnostics: usable structured result emits exactly the five safe fields", () => {
  const fields = buildAnswerWriterDiagnostics(groundedStructuredResult());

  assert.deepEqual(Object.keys(fields).sort(), [
    "citedChunkCount",
    "normalizedDecision",
    "outcome",
    "parsedDecision",
    "structured",
  ]);
  assert.deepEqual(fields, {
    outcome: "usable",
    structured: true,
    parsedDecision: "grounded_answer",
    normalizedDecision: "grounded_answer",
    citedChunkCount: 1,
  });
  assertNoSecrets("answer-writer (usable structured)", fields);
});

test("answer-writer diagnostics: parse-failure fallback (Case B) is visible as structured:false", () => {
  const fields = buildAnswerWriterDiagnostics(parseFailFallbackResult());

  assert.deepEqual(fields, {
    outcome: "usable",
    structured: false,
    parsedDecision: "insufficient_evidence",
    normalizedDecision: "insufficient_evidence",
    citedChunkCount: 0,
  });
  assertNoSecrets("answer-writer (parse fail)", fields);
});

test("answer-writer diagnostics: unusable result collapses to nulls and still emits no content", () => {
  const fields = buildAnswerWriterDiagnostics(unusableResult());

  assert.deepEqual(fields, {
    outcome: "unusable",
    structured: null,
    parsedDecision: null,
    normalizedDecision: null,
    citedChunkCount: null,
  });
  assertNoSecrets("answer-writer (unusable)", fields);
});

// ── citation-verification diagnostics ───────────────────────────────────────

function groundedInput(
  cited: string[],
  approved: string[] = [SECRET_CHUNK_ID],
): CitationVerifierInput {
  return {
    decision: "grounded_answer",
    citedChunkIds: cited,
    approvedEvidenceIds: approved,
  };
}

test("citation-verification diagnostics: rejected grounded answer emits exactly the seven safe fields", () => {
  const output: CitationVerifierOutput = {
    verified: false,
    validatedCitationIds: [],
    rejectedCitationIds: [SECRET_CHUNK_ID],
    unsupportedClaims: [],
    reasonCode: "MISSING_CITATIONS",
  };
  const fields = buildCitationVerificationDiagnostics(
    groundedInput([SECRET_CHUNK_ID]),
    output,
  );

  assert.deepEqual(Object.keys(fields).sort(), [
    "approvedEvidenceCount",
    "citedCount",
    "inputDecision",
    "reasonCode",
    "rejectedCount",
    "validatedCount",
    "verified",
  ]);
  assert.deepEqual(fields, {
    inputDecision: "grounded_answer",
    citedCount: 1,
    approvedEvidenceCount: 1,
    verified: false,
    validatedCount: 0,
    rejectedCount: 1,
    reasonCode: "MISSING_CITATIONS",
  });
  assertNoSecrets("citation-verification (rejected)", fields);
});

test("citation-verification diagnostics: partial rejection keeps verified:true and reports counts", () => {
  const fields = buildCitationVerificationDiagnostics(
    groundedInput([SECRET_CHUNK_ID, "chunk-b"], [SECRET_CHUNK_ID]),
    {
      verified: true,
      validatedCitationIds: [SECRET_CHUNK_ID],
      rejectedCitationIds: ["chunk-b"],
      unsupportedClaims: [],
      reasonCode: "CITATIONS_VERIFIED",
    },
  );

  assert.deepEqual(fields, {
    inputDecision: "grounded_answer",
    citedCount: 2,
    approvedEvidenceCount: 1,
    verified: true,
    validatedCount: 1,
    rejectedCount: 1,
    reasonCode: "CITATIONS_VERIFIED",
  });
  assertNoSecrets("citation-verification (partial)", fields);
});

test("citation-verification diagnostics: skipped non-grounded decision", () => {
  const fields = buildCitationVerificationDiagnostics(
    { decision: "insufficient_evidence", citedChunkIds: [] },
    {
      verified: true,
      validatedCitationIds: [],
      rejectedCitationIds: [],
      unsupportedClaims: [],
      reasonCode: "CITATIONS_SKIPPED",
    },
  );

  assert.deepEqual(fields, {
    inputDecision: "insufficient_evidence",
    citedCount: 0,
    approvedEvidenceCount: 0,
    verified: true,
    validatedCount: 0,
    rejectedCount: 0,
    reasonCode: "CITATIONS_SKIPPED",
  });
  assertNoSecrets("citation-verification (skipped)", fields);
});

// ── A vs B: correlating the two logs per chat turn ──────────────────────────

test("correlated logs distinguish Case A (structured passed, citation rejected) from Case B (parse failed closed before verification)", () => {
  // Case A: the answer-writer produced valid structured output, then citation
  // verification rejected/downgraded it.
  const aWriter = buildAnswerWriterDiagnostics(groundedStructuredResult());
  const aVerify = buildCitationVerificationDiagnostics(
    groundedInput([SECRET_CHUNK_ID]),
    {
      verified: false,
      validatedCitationIds: [],
      rejectedCitationIds: [SECRET_CHUNK_ID],
      unsupportedClaims: [],
      reasonCode: "MISSING_CITATIONS",
    },
  );
  assert.equal(aWriter.structured, true);
  assert.equal(aWriter.parsedDecision, "grounded_answer");
  assert.equal(aWriter.normalizedDecision, "grounded_answer");
  assert.equal(aVerify.inputDecision, "grounded_answer");
  assert.equal(aVerify.verified, false);
  assert.equal(aVerify.reasonCode, "MISSING_CITATIONS");

  // Case B: the answer-writer structured parsing itself failed closed, so
  // verification never saw a grounded claim and skipped.
  const bWriter = buildAnswerWriterDiagnostics(parseFailFallbackResult());
  const bVerify = buildCitationVerificationDiagnostics(
    { decision: "insufficient_evidence", citedChunkIds: [] },
    {
      verified: true,
      validatedCitationIds: [],
      rejectedCitationIds: [],
      unsupportedClaims: [],
      reasonCode: "CITATIONS_SKIPPED",
    },
  );
  assert.equal(bWriter.structured, false);
  assert.equal(bWriter.parsedDecision, "insufficient_evidence");
  assert.equal(bVerify.inputDecision, "insufficient_evidence");
  assert.equal(bVerify.reasonCode, "CITATIONS_SKIPPED");

  assertNoSecrets("case A + case B", { aWriter, aVerify, bWriter, bVerify });
});

// ── real logger path: pino serialization leaks nothing ──────────────────────

function captureLogger(): {
  logger: ReturnType<typeof createStructuredLogger>;
  lines: string[];
} {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });
  const logger = createStructuredLogger("diagnostics-test", destination);
  // Test env silences the logger by default; force emission to verify output.
  logger.level = "info";
  return { logger, lines };
}

test("the logger emits exactly the safe fields when writing answer-writer diagnostics", () => {
  const fields = buildAnswerWriterDiagnostics(groundedStructuredResult());
  const { logger, lines } = captureLogger();
  logger.info(fields, "answer writer generation outcome");

  assert.equal(lines.length, 1);
  const record = JSON.parse(lines[0]);
  assert.equal(record.level, "info");
  assert.equal(record.message, "answer writer generation outcome");
  assert.equal(record.outcome, "usable");
  assert.equal(record.structured, true);
  assert.equal(record.parsedDecision, "grounded_answer");
  assert.equal(record.normalizedDecision, "grounded_answer");
  assert.equal(record.citedChunkCount, 1);
  assertNoSecrets("serialized answer-writer log line", record);
});

test("the logger emits exactly the safe fields when writing citation-verification diagnostics", () => {
  const fields = buildCitationVerificationDiagnostics(
    groundedInput([SECRET_CHUNK_ID]),
    {
      verified: false,
      validatedCitationIds: [],
      rejectedCitationIds: [SECRET_CHUNK_ID],
      unsupportedClaims: [],
      reasonCode: "MISSING_CITATIONS",
    },
  );
  const { logger, lines } = captureLogger();
  logger.info(fields, "citation verification outcome");

  assert.equal(lines.length, 1);
  const record = JSON.parse(lines[0]);
  assert.equal(record.message, "citation verification outcome");
  assert.equal(record.inputDecision, "grounded_answer");
  assert.equal(record.citedCount, 1);
  assert.equal(record.approvedEvidenceCount, 1);
  assert.equal(record.verified, false);
  assert.equal(record.validatedCount, 0);
  assert.equal(record.rejectedCount, 1);
  assert.equal(record.reasonCode, "MISSING_CITATIONS");
  assertNoSecrets("serialized citation-verification log line", record);
});
