import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runRagComparisonCli } from "../../../scripts/compare-rag-evaluations.js";
import {
  RagComparisonError,
  compareRagEvaluationReports,
} from "./evaluation.comparison.js";
import { RagComparisonReportSchema } from "./evaluation.comparison.schemas.js";
import { createEvaluationConfigurationIdentity } from "./evaluation.configuration.js";
import { createRagEvaluationReport } from "./evaluation.report.js";
import {
  DEFAULT_RAG_REGRESSION_POLICY,
  type RagRegressionPolicy,
} from "./evaluation.regressionPolicy.js";
import {
  RAG_EVALUATION_RESULT_SCHEMA_VERSION,
  RagEvaluationResultSchema,
  type RagEvaluationConfiguration,
  type RagEvaluationReport,
  type RagEvaluationResult,
} from "./evaluation.schemas.js";

const GENERATED_AT = new Date("2026-08-11T10:00:00.000Z");

interface ResultOptions {
  id?: string;
  datasetVersion?: string;
  passed?: boolean;
  outcomeCorrect?: boolean;
  precision?: number | null;
  recall?: number | null;
  mrr?: number | null;
  metricK?: number;
  fullyGrounded?: boolean;
  claimSupportRate?: number | null;
  answerRelevance?: number | null;
  authorizationViolation?: boolean;
  finalSourceAuthorizationPassed?: boolean;
  unsupportedClaims?: number;
  unknownClaims?: number;
  latencyMs?: number;
  tokens?: number;
  estimatedCost?: number;
  executionFailed?: boolean;
}

function evaluationResult(options: ResultOptions = {}): RagEvaluationResult {
  const id = options.id ?? "case-a";
  const datasetVersion = options.datasetVersion ?? "dataset-v1";
  const precision = options.precision === undefined ? 0.8 : options.precision;
  const recall = options.recall === undefined ? 0.8 : options.recall;
  const mrr = options.mrr === undefined ? 0.8 : options.mrr;
  const metricK = options.metricK ?? 5;
  const fullyGrounded = options.fullyGrounded ?? true;
  const claimSupportRate =
    options.claimSupportRate === undefined
      ? fullyGrounded
        ? 1
        : 0.5
      : options.claimSupportRate;
  const answerRelevance =
    options.answerRelevance === undefined ? 0.8 : options.answerRelevance;
  const authorizationViolation = options.authorizationViolation ?? false;
  const finalSourceAuthorizationPassed =
    options.finalSourceAuthorizationPassed ?? true;
  const outcomeCorrect = options.outcomeCorrect ?? true;
  const executionFailed = options.executionFailed ?? false;
  const unsupportedClaims = options.unsupportedClaims ?? (fullyGrounded ? 0 : 1);
  const unknownClaims = options.unknownClaims ?? 0;
  const violation = authorizationViolation
    ? [{ rank: 1, documentId: "doc-a", chunkId: "chunk-a", reasonCode: "DENIED" }]
    : [];
  const securityPassed = authorizationViolation === false && finalSourceAuthorizationPassed;
  const passed =
    !executionFailed && (options.passed ?? true) && outcomeCorrect && securityPassed;
  const retrievalEvaluated = precision !== null && recall !== null && mrr !== null;
  return RagEvaluationResultSchema.parse({
    schemaVersion: RAG_EVALUATION_RESULT_SCHEMA_VERSION,
    evaluationCaseId: id,
    datasetVersion,
    actualRoute: "rag",
    actualIntent: "knowledge_question",
    actualAction: executionFailed ? null : "release",
    reasonCode: "TEST_RESULT",
    retrievedDocumentIds: ["doc-a"],
    retrievedChunkIds: ["chunk-a"],
    contextRelevance: {
      document: {
        evaluated: retrievalEvaluated,
        k: metricK,
        retrievedIds: retrievalEvaluated ? ["doc-a"] : [],
        relevantIds: retrievalEvaluated ? ["doc-a"] : [],
        hits: retrievalEvaluated ? ["doc-a"] : [],
        falsePositives: [],
        misses: [],
        precision,
        recall,
        reciprocalRank: mrr,
        hit: retrievalEvaluated ? true : null,
      },
      chunk: {
        evaluated: false,
        k: metricK,
        retrievedIds: [],
        relevantIds: [],
        hits: [],
        falsePositives: [],
        misses: [],
        precision: null,
        recall: null,
        reciprocalRank: null,
        hit: null,
      },
      authorizationInvariantPassed: !authorizationViolation,
      authorizationViolations: violation,
    },
    groundedness: {
      evaluated: claimSupportRate !== null,
      factualClaimCount: claimSupportRate === null ? 0 : 1,
      supportedClaimCount: fullyGrounded ? 1 : 0,
      unsupportedClaimCount: unsupportedClaims,
      unknownClaimCount: unknownClaims,
      claimSupportRate,
      fullyGrounded,
      supportingEvidenceIds: fullyGrounded ? ["chunk-a"] : [],
      faithfulnessScore: fullyGrounded ? 1 : 0.5,
    },
    correctness: {
      evaluated: true,
      required: true,
      status: "correct",
      expectedFactCoverage: 1,
      expectedClaimCoverage: null,
      matchedExpectedFacts: ["fact"],
      matchedExpectedClaims: [],
      missingExpectedFacts: [],
      missingExpectedClaims: [],
      forbiddenFactsPresent: [],
    },
    finalAnswer: "Final evaluated answer",
    answerRelevance: {
      evaluated: answerRelevance !== null,
      score: answerRelevance,
      relevant: answerRelevance === null ? null : answerRelevance >= 0.7,
      threshold: 0.7,
      classification:
        answerRelevance === null
          ? "evaluation_unavailable"
          : fullyGrounded
            ? "relevant_grounded_answer"
            : "relevant_ungrounded_answer",
      expectedOutcome: "release",
      actualOutcome: executionFailed
        ? "error"
        : outcomeCorrect
          ? "release"
          : "refuse",
      outcomeCorrect: executionFailed ? false : outcomeCorrect,
      judgeStatus: answerRelevance === null ? "not_run" : "completed",
      errorCode: null,
    },
    finalSourceDocumentIds: ["doc-a"],
    finalSourceChunkIds: ["chunk-a"],
    authorizationInvariantPassed: securityPassed,
    authorizationViolations: violation,
    operational: {
      ...(options.latencyMs === undefined ? {} : { latencyMs: options.latencyMs }),
      ...(options.tokens === undefined ? {} : { tokens: options.tokens }),
      ...(options.estimatedCost === undefined
        ? {}
        : { estimatedCost: options.estimatedCost }),
    },
    workflowArtifacts: {
      preAuthorizationDiagnostics: { vectorCandidateCount: 0, keywordCandidateCount: 0, vectorCandidates: [], keywordCandidates: [] },
      fusedCandidateIds: ["chunk-a"],
      postAuthorizationCandidateIds: ["chunk-a"],
      retrievalRankedCandidates: [{ rank: 1, chunkId: "chunk-a", documentId: "doc-a" }],
      evidenceSelectedCandidates: [{ rank: 1, chunkId: "chunk-a", documentId: "doc-a" }],
      evidenceSufficiency: "SUFFICIENT",
      approvedEvidenceIds: ["chunk-a"],
      rejectedEvidenceIds: [],
      finalSourceAuthorizationPassed,
    },
    execution: executionFailed
      ? {
          status: "failed",
          failureKind: "provider_unavailable",
          errorCode: "LLM_PROVIDER_UNAVAILABLE",
        }
      : { status: "completed", failureKind: null, errorCode: null },
    expectedOutcome: "release",
    actualOutcome: executionFailed
      ? "error"
      : outcomeCorrect
        ? "release"
        : "refuse",
    outcomeCorrect: executionFailed ? false : outcomeCorrect,
    casePassed: passed,
  });
}

function configuration(
  overrides: Partial<RagEvaluationConfiguration> = {},
): RagEvaluationConfiguration {
  return {
    name: "phase-3-fixture",
    retrieval: { metricCutoffK: 10, workflowTopK: { directQuestion: 5, summarization: 12 }, weights: { keyword: 1, vector: 1 } },
    fusion: { strategy: "rrf", version: "1" },
    rerankerDetails: { provider: "local", name: "reranker", componentVersion: "1" },
    embedding: { provider: "openai", model: "embedding-a", modelRevisionStatus: "unavailable", componentVersion: "embedding-v1" },
    answer: { provider: "openai", model: "answer-a", modelRevisionStatus: "unavailable", componentVersion: "answer-v1" },
    verifier: { provider: "openai", model: "verifier-a", modelRevisionStatus: "unavailable", componentVersion: "verifier-v1" },
    promptVersions: { answer: "1", intent: "1" },
    evidenceThresholds: { minimumScore: 0.25 },
    workflowVersions: { chat: "1" },
    metricSemanticsVersion: "1.0.0",
    ...overrides,
  };
}

function report(
  results: RagEvaluationResult[],
  options: {
    datasetVersion?: string;
    configuration?: RagEvaluationConfiguration;
    generatedAt?: Date;
  } = {},
): RagEvaluationReport {
  const datasetVersion = options.datasetVersion ?? "dataset-v1";
  return createRagEvaluationReport({
    datasetVersion,
    configuration: options.configuration ?? configuration(),
    results: results.map((result) => ({ ...result, datasetVersion })),
    generatedAt: options.generatedAt ?? GENERATED_AT,
  });
}

function policy(
  mutate?: (value: RagRegressionPolicy) => void,
): RagRegressionPolicy {
  const value = structuredClone(DEFAULT_RAG_REGRESSION_POLICY);
  mutate?.(value);
  return value;
}

function metric(
  comparison: ReturnType<typeof compareRagEvaluationReports>,
  name: string,
) {
  return comparison.aggregateDeltas.find((entry) => entry.metric === name)!;
}

test("1. same configuration with different key order has the same hash", () => {
  const left = configuration({
    promptVersions: { answer: "1", intent: "1" },
    retrieval: { metricCutoffK: 10, workflowTopK: { directQuestion: 5, summarization: 12 }, weights: { keyword: 1, vector: 1 } },
  });
  const right = configuration({
    promptVersions: { intent: "1", answer: "1" },
    retrieval: { weights: { vector: 1, keyword: 1 }, metricCutoffK: 10, workflowTopK: { directQuestion: 5, summarization: 12 } },
  });
  assert.equal(
    createEvaluationConfigurationIdentity("dataset-v1", left).configurationHash,
    createEvaluationConfigurationIdentity("dataset-v1", right).configurationHash,
  );
});

test("2. relevant configuration change changes the hash", () => {
  const left = createEvaluationConfigurationIdentity("dataset-v1", configuration());
  const right = createEvaluationConfigurationIdentity(
    "dataset-v1",
    configuration({ retrieval: { metricCutoffK: 20, workflowTopK: { directQuestion: 5, summarization: 12 }, weights: { keyword: 1, vector: 1 } } }),
  );
  assert.notEqual(left.configurationHash, right.configurationHash);
});

test("3. irrelevant timestamp and request ID do not affect the hash", () => {
  const left = configuration({ metadata: { generatedAt: "yesterday", requestId: "a" } });
  const right = configuration({ metadata: { generatedAt: "today", requestId: "b" } });
  assert.equal(
    createEvaluationConfigurationIdentity("dataset-v1", left).configurationHash,
    createEvaluationConfigurationIdentity("dataset-v1", right).configurationHash,
  );
});

test("4. secrets in irrelevant metadata are excluded from identity", () => {
  const identity = createEvaluationConfigurationIdentity(
    "dataset-v1",
    configuration({ metadata: { apiKey: "must-not-appear", password: "hidden" } }),
  );
  assert.doesNotMatch(JSON.stringify(identity), /must-not-appear|hidden/);
  assert.throws(() =>
    createEvaluationConfigurationIdentity(
      "dataset-v1",
      configuration({ promptVersions: { apiKey: "must-not-hash" } }),
    ),
  );
});

test("5. compatible reports compare", () => {
  assert.equal(
    compareRagEvaluationReports(report([evaluationResult()]), report([evaluationResult()]), { generatedAt: GENERATED_AT }).gate.passed,
    true,
  );
});

test("6. different dataset versions are rejected", () => {
  assert.throws(
    () => compareRagEvaluationReports(
      report([evaluationResult()], { datasetVersion: "dataset-a" }),
      report([evaluationResult()], { datasetVersion: "dataset-b" }),
    ),
    (error: unknown) => error instanceof RagComparisonError && error.code === "INCOMPATIBLE_DATASET_VERSION",
  );
});

test("7. different case sets are rejected", () => {
  assert.throws(
    () => compareRagEvaluationReports(
      report([evaluationResult({ id: "a" })]),
      report([evaluationResult({ id: "b" })]),
    ),
    (error: unknown) => error instanceof RagComparisonError && error.code === "INCOMPATIBLE_CASE_SET",
  );
});

test("8. malformed report is rejected", () => {
  assert.throws(
    () => compareRagEvaluationReports(
      { reportVersion: "1.1.0", datasetVersion: "dataset-v1" },
      report([evaluationResult()]),
    ),
    (error: unknown) => error instanceof RagComparisonError && error.code === "MALFORMED_BASELINE_REPORT",
  );
});

test("compatibility rejects different retrieval metric cutoffs", () => {
  assert.throws(
    () => compareRagEvaluationReports(
      report([evaluationResult({ metricK: 5 })]),
      report([evaluationResult({ metricK: 10 })]),
    ),
    (error: unknown) => error instanceof RagComparisonError && error.code === "INCOMPATIBLE_METRIC_TOP_K",
  );
});

test("compatibility rejects different metric semantics", () => {
  assert.throws(
    () => compareRagEvaluationReports(
      report([evaluationResult()], {
        configuration: configuration({ metricSemanticsVersion: "1.0.0" }),
      }),
      report([evaluationResult()], {
        configuration: configuration({ metricSemanticsVersion: "2.0.0" }),
      }),
    ),
    (error: unknown) => error instanceof RagComparisonError && error.code === "INCOMPATIBLE_METRIC_SEMANTICS",
  );
});

test("9. improved precision is detected", () => {
  const compared = compareRagEvaluationReports(
    report([evaluationResult({ precision: 0.5 })]),
    report([evaluationResult({ precision: 0.8 })]),
  );
  assert.equal(metric(compared, "meanPrecisionAtK").status, "improved");
});

test("10. regressed recall is detected", () => {
  const compared = compareRagEvaluationReports(
    report([evaluationResult({ recall: 1 })]),
    report([evaluationResult({ recall: 0.5 })]),
  );
  assert.equal(metric(compared, "meanRecallAtK").status, "regressed");
});

test("11. improved MRR is detected", () => {
  const compared = compareRagEvaluationReports(
    report([evaluationResult({ mrr: 0.5 })]),
    report([evaluationResult({ mrr: 1 })]),
  );
  assert.equal(metric(compared, "mrr").status, "improved");
});

test("12. groundedness regression is a hard failure", () => {
  const compared = compareRagEvaluationReports(
    report([evaluationResult({ fullyGrounded: true })]),
    report([evaluationResult({ fullyGrounded: false })]),
  );
  assert.ok(compared.gate.hardFailures.some((entry) => entry.code === "GROUNDEDNESS_REGRESSION"));
});

test("13. answer relevance regression is detected", () => {
  const compared = compareRagEvaluationReports(
    report([evaluationResult({ answerRelevance: 0.9 })]),
    report([evaluationResult({ answerRelevance: 0.7 })]),
  );
  assert.equal(metric(compared, "meanAnswerRelevance").status, "regressed");
});

test("14. outcome correctness regression is a hard failure", () => {
  const compared = compareRagEvaluationReports(
    report([evaluationResult({ outcomeCorrect: true })]),
    report([evaluationResult({ outcomeCorrect: false })]),
  );
  assert.ok(compared.gate.hardFailures.some((entry) => entry.code === "OUTCOME_CORRECTNESS_REGRESSION"));
});

test("15. latency increase is detected", () => {
  const compared = compareRagEvaluationReports(
    report([evaluationResult({ latencyMs: 100 })]),
    report([evaluationResult({ latencyMs: 150 })]),
  );
  assert.equal(metric(compared, "meanLatencyMs").status, "regressed");
});

test("16. token and cost increases are detected", () => {
  const compared = compareRagEvaluationReports(
    report([evaluationResult({ tokens: 100, estimatedCost: 1 })]),
    report([evaluationResult({ tokens: 150, estimatedCost: 2 })]),
  );
  assert.equal(metric(compared, "meanTokens").status, "regressed");
  assert.equal(metric(compared, "meanEstimatedCost").status, "regressed");
});

test("17. zero to zero authorization violations passes", () => {
  const compared = compareRagEvaluationReports(
    report([evaluationResult()]),
    report([evaluationResult()]),
  );
  assert.equal(compared.gate.passed, true);
});

test("18. candidate authorization violation hard fails", () => {
  const compared = compareRagEvaluationReports(
    report([evaluationResult()]),
    report([evaluationResult({ authorizationViolation: true })]),
  );
  assert.equal(compared.gate.passed, false);
  assert.ok(compared.gate.hardFailures.some((entry) => entry.code === "AUTHORIZATION_VIOLATION"));
});

test("19. quality improvement cannot override a security failure", () => {
  const compared = compareRagEvaluationReports(
    report([evaluationResult({ precision: 0.4 })]),
    report([evaluationResult({ precision: 1, authorizationViolation: true })]),
  );
  assert.equal(metric(compared, "meanPrecisionAtK").status, "improved");
  assert.equal(compared.gate.passed, false);
});

test("20. quality floor passes", () => {
  const compared = compareRagEvaluationReports(
    report([evaluationResult({ answerRelevance: 0.9 })]),
    report([evaluationResult({ answerRelevance: 0.9 })]),
    { policy: policy((value) => { value.qualityFloors.answerRelevance = 0.8; }) },
  );
  assert.equal(compared.gate.passed, true);
});

test("21. quality floor fails", () => {
  const compared = compareRagEvaluationReports(
    report([evaluationResult({ answerRelevance: 0.7 })]),
    report([evaluationResult({ answerRelevance: 0.7 })]),
    { policy: policy((value) => { value.qualityFloors.answerRelevance = 0.8; }) },
  );
  assert.ok(compared.gate.qualityFailures.some((entry) => entry.code === "QUALITY_FLOOR_FAILED"));
});

test("22. allowed delta passes", () => {
  const compared = compareRagEvaluationReports(
    report([evaluationResult({ precision: 0.9 })]),
    report([evaluationResult({ precision: 0.85 })]),
    { policy: policy((value) => { value.allowedRegressions.precisionAtK = 0.05; }) },
  );
  assert.equal(compared.gate.passed, true);
});

test("23. excessive regression fails", () => {
  const compared = compareRagEvaluationReports(
    report([evaluationResult({ recall: 0.9 })]),
    report([evaluationResult({ recall: 0.7 })]),
    { policy: policy((value) => { value.allowedRegressions.recallAtK = 0.1; }) },
  );
  assert.ok(compared.gate.qualityFailures.some((entry) => entry.metric === "meanRecallAtK"));
});

test("24. operational warning does not fail gate when policy permits", () => {
  const compared = compareRagEvaluationReports(
    report([evaluationResult({ latencyMs: 100 })]),
    report([evaluationResult({ latencyMs: 200 })]),
  );
  assert.equal(compared.gate.passed, true);
  assert.equal(compared.gate.operationalWarnings.length, 1);
});

test("25. improved case", () => {
  const compared = compareRagEvaluationReports(
    report([evaluationResult({ passed: false, precision: 0.5 })]),
    report([evaluationResult({ passed: true, precision: 1 })]),
  );
  assert.equal(compared.perCaseComparisons[0]?.status, "improved");
});

test("26. unchanged case", () => {
  const compared = compareRagEvaluationReports(
    report([evaluationResult()]),
    report([evaluationResult()]),
  );
  assert.equal(compared.perCaseComparisons[0]?.status, "unchanged");
});

test("27. regressed case", () => {
  const compared = compareRagEvaluationReports(
    report([evaluationResult({ precision: 1 })]),
    report([evaluationResult({ precision: 0.5 })]),
  );
  assert.equal(compared.perCaseComparisons[0]?.status, "regressed");
});

test("28. unavailable metric remains unavailable", () => {
  const compared = compareRagEvaluationReports(
    report([evaluationResult({ answerRelevance: null })]),
    report([evaluationResult({ answerRelevance: null })]),
  );
  const answer = compared.perCaseComparisons[0]?.metricComparisons.find(
    (entry) => entry.metric === "answerRelevance",
  );
  assert.equal(answer?.status, "unavailable");
});

test("per-case workflow failure is unavailable", () => {
  const compared = compareRagEvaluationReports(
    report([evaluationResult({ executionFailed: true })]),
    report([evaluationResult({ executionFailed: true })]),
  );
  assert.equal(compared.perCaseComparisons[0]?.status, "unavailable");
});

test("29. comparison JSON validates", () => {
  const compared = compareRagEvaluationReports(
    report([evaluationResult()]),
    report([evaluationResult()]),
    { generatedAt: GENERATED_AT },
  );
  assert.doesNotThrow(() => RagComparisonReportSchema.parse(JSON.parse(JSON.stringify(compared))));
});

test("30. case and finding ordering is stable", () => {
  const compared = compareRagEvaluationReports(
    report([evaluationResult({ id: "z" }), evaluationResult({ id: "a" })]),
    report([evaluationResult({ id: "a" }), evaluationResult({ id: "z" })]),
    { generatedAt: GENERATED_AT },
  );
  assert.deepEqual(compared.compatibility.evaluationCaseIds, ["a", "z"]);
  assert.deepEqual(compared.perCaseComparisons.map((entry) => entry.evaluationCaseId), ["a", "z"]);
});

async function writeCliInputs(
  baseline: RagEvaluationReport,
  candidate: RagEvaluationReport,
): Promise<{ directory: string; baselinePath: string; candidatePath: string; outputPath: string }> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "documind-rag-compare-"));
  const baselinePath = path.join(directory, "baseline.json");
  const candidatePath = path.join(directory, "candidate.json");
  await fs.writeFile(baselinePath, JSON.stringify(baseline), "utf8");
  await fs.writeFile(candidatePath, JSON.stringify(candidate), "utf8");
  return { directory, baselinePath, candidatePath, outputPath: path.join(directory, "comparison.json") };
}

test("31. passing comparison exits zero", async () => {
  const files = await writeCliInputs(report([evaluationResult()]), report([evaluationResult()]));
  const exitCode = await runRagComparisonCli(
    ["--baseline", files.baselinePath, "--candidate", files.candidatePath, "--output", files.outputPath],
    { stdout: () => undefined, stderr: () => undefined, generatedAt: GENERATED_AT },
  );
  assert.equal(exitCode, 0);
  assert.equal(RagComparisonReportSchema.parse(await readJson(files.outputPath)).gate.passed, true);
});

test("32. failing comparison exits non-zero", async () => {
  const files = await writeCliInputs(
    report([evaluationResult()]),
    report([evaluationResult({ authorizationViolation: true })]),
  );
  const exitCode = await runRagComparisonCli(
    ["--baseline", files.baselinePath, "--candidate", files.candidatePath, "--output", files.outputPath],
    { stdout: () => undefined, stderr: () => undefined, generatedAt: GENERATED_AT },
  );
  assert.equal(exitCode, 1);
});

test("33. malformed CLI input is a controlled failure", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "documind-rag-malformed-"));
  const malformedPath = path.join(directory, "malformed.json");
  const candidatePath = path.join(directory, "candidate.json");
  await fs.writeFile(malformedPath, "{not-json", "utf8");
  await fs.writeFile(candidatePath, JSON.stringify(report([evaluationResult()])), "utf8");
  const messages: string[] = [];
  const exitCode = await runRagComparisonCli(
    ["--baseline", malformedPath, "--candidate", candidatePath, "--output", path.join(directory, "comparison.json")],
    { stdout: () => undefined, stderr: (message) => messages.push(message), generatedAt: GENERATED_AT },
  );
  assert.equal(exitCode, 2);
  assert.match(messages.join(""), /RAG comparison error/);
});

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}
