import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../../../common/errors/AppError.js";
import { InMemoryAuditWriter } from "../../../common/observability/auditWriter.js";
import {
  DocumentAccessAuthorizationService,
  createEvaluationDocumentAccessAuthorizationService,
} from "../../document-access/documentAccess.authorization.service.js";
import type { JudgeOutcome } from "../llmJudge.types.js";
import { AnswerRelevanceEvaluator } from "./answerRelevance.evaluator.js";
import { AnswerCorrectnessEvaluator } from "./correctness.evaluator.js";
import { compareRagEvaluationReports, RagComparisonError } from "./evaluation.comparison.js";
import { createEvaluationConfigurationIdentity } from "./evaluation.configuration.js";
import { createRagEvaluationReport } from "./evaluation.report.js";
import {
  DEFAULT_RETRIEVAL_METRIC_CUTOFF_K,
  RagEvaluationConfigurationError,
  RagEvaluationRunner,
} from "./evaluation.runner.js";
import {
  RAG_EVALUATION_CASE_SCHEMA_VERSION,
  RagEvaluationDatasetV2Schema,
  type RagEvaluationCaseV2,
} from "./evaluation.schemas.js";
import { GroundednessEvaluator } from "./groundedness.evaluator.js";
import { DEFAULT_RAG_REGRESSION_POLICY } from "./evaluation.regressionPolicy.js";
import type { RagEvaluationWorkflow, RagWorkflowExecution } from "./evaluation.workflow.js";

const tenantId = "64b000000000000000000001";
const actorId = "64b000000000000000000002";
const docId = "64b000000000000000000003";
const goodChunk = "64b000000000000000000004";
const noiseChunk = "64b000000000000000000005";
const rawDeniedChunk = "64b000000000000000000099";

function evaluationCase(overrides: Partial<RagEvaluationCaseV2> = {}): RagEvaluationCaseV2 {
  return {
    schemaVersion: RAG_EVALUATION_CASE_SCHEMA_VERSION,
    id: "phase-3-1-case",
    description: "Phase 3.1 hardening fixture",
    language: "en",
    question: "What does the policy say?",
    expectedRoute: "rag",
    expectedIntent: "knowledge_question",
    expectedOutcome: "release",
    retrieval: {
      expectedDocumentIds: [docId],
      expectedRelevantDocumentIds: [docId],
      expectedRelevantChunkIds: [goodChunk],
      knownIrrelevantDocumentIds: [],
    },
    grounding: {
      expectedFacts: ["employees receive 24 days"],
      expectedClaims: ["carryover is capped at 10 days"],
      forbiddenFacts: ["employees receive company cars"],
    },
    citations: { expectedSourceDocumentIds: [docId], sourceRequired: true, sourceForbidden: false },
    evaluationModes: ["retrieval", "end_to_end"],
    tags: ["phase-3-1"],
    ...overrides,
  };
}

function workflowExecution(finalAnswer = "Employees receive 24 days; carryover is capped at 10 days."): RagWorkflowExecution {
  return {
    status: "completed",
    artifacts: {
      intent: { route: "rag", intent: "knowledge_question", reasonCode: "KNOWLEDGE_QUERY" },
      compliance: { action: "release", reasonCode: "COMPLIANT_GROUNDED_RESPONSE" },
      retrievalCandidates: [
        { rank: 1, chunkId: goodChunk, documentId: docId, score: 0.9 },
        { rank: 2, chunkId: noiseChunk, documentId: "64b000000000000000000006", score: 0.8 },
      ],
      evidenceSelectedCandidates: [{ rank: 1, chunkId: goodChunk, documentId: docId, score: 0.9 }],
      evidenceSufficiency: "SUFFICIENT",
      approvedEvidenceIds: [goodChunk],
      rejectedEvidenceIds: [noiseChunk],
      evidenceReasonCode: "EVIDENCE_SUFFICIENT",
      finalSourceChunkIds: [goodChunk],
      finalSourceDocumentIds: [docId],
      finalSourceAuthorizationPassed: true,
      runtime: { totalTokensUsed: 12, estimatedCost: 0.01, latencyMs: 10 },
    },
    semanticVerification: {
      preparedClaims: [{ claimIndex: 0, answerClaimIndex: 0, text: finalAnswer, originalText: finalAnswer }],
      claimResults: [{ claimIndex: 0, answerClaimIndex: 0, text: finalAnswer, state: "SUPPORTED", supportingEvidenceIds: [goodChunk], deterministicContradiction: false }],
      supportingEvidenceIds: [goodChunk],
      releasedAnswerText: finalAnswer,
      reasonCode: "SEMANTIC_VERIFIED",
    } as unknown as RagWorkflowExecution["semanticVerification"],
    retrievalArtifacts: {
      rawVectorCandidates: [{ rank: 1, chunkId: rawDeniedChunk, score: 0.99 }],
      rawKeywordCandidates: [{ rank: 1, chunkId: goodChunk, score: 0.8 }],
      postAuthorizationVectorCandidates: [],
      postAuthorizationKeywordCandidates: [{ rank: 1, chunkId: goodChunk, score: 0.8 }],
      fusedCandidateIds: [goodChunk, noiseChunk],
      hydratedCandidateIds: [goodChunk, noiseChunk],
    },
    finalAnswer,
    judgeEvidence: [{ chunkId: goodChunk, documentId: docId, documentTitle: "Policy", text: finalAnswer }],
    authorizationByChunkId: new Map([[goodChunk, true], [noiseChunk, true]]),
    provider: "provider",
    model: "answer-model",
    errorCode: null,
    failureKind: null,
  };
}

const judgeOutcome: JudgeOutcome = {
  status: "completed",
  scores: { faithfulness: 1, relevancy: 1, coherence: 1, overall: 1 },
  provider: "judge-provider",
  model: "judge-model",
  errorCode: null,
};

function runner(execution = workflowExecution(), options: { topK?: number; caseIds?: string[]; tags?: string[] } = {}) {
  const workflow: RagEvaluationWorkflow = { execute: async () => execution };
  return new RagEvaluationRunner({
    workflow,
    answerRelevanceEvaluator: new AnswerRelevanceEvaluator({ evaluate: async () => judgeOutcome }),
    ...options,
    resolveExecutionContext: async () => ({
      tenantId,
      actorId,
      actorEmail: "eval@example.test",
      baseRole: "EMPLOYEE",
    }),
  });
}

function dataset(entry = evaluationCase()) {
  return RagEvaluationDatasetV2Schema.parse({
    schemaVersion: RAG_EVALUATION_CASE_SCHEMA_VERSION,
    datasetVersion: "phase-3-1",
    description: "Phase 3.1 tests",
    cases: [entry],
  });
}

test("production denial audit remains durable while evaluation denial is non-durable with the same decision", async () => {
  const durable = new InMemoryAuditWriter();
  const production = new DocumentAccessAuthorizationService(durable);
  const evaluation = createEvaluationDocumentAccessAuthorizationService();
  const errors: string[] = [];
  for (const service of [production, evaluation]) {
    try {
      await service.authorizeDocumentAction({ tenantId: "invalid", actorId: "invalid" }, "invalid", "use_in_ai");
    } catch (error) {
      errors.push(error instanceof AppError ? error.code : "unknown");
    }
  }
  await assert.rejects(
    () => evaluation.authorizeDocumentAction({ tenantId: "invalid", actorId: "invalid" }, "invalid", "use_in_ai"),
    (error: unknown) => error instanceof AppError && error.code === "DOCUMENT_NOT_FOUND",
  );
  assert.deepEqual(errors, ["DOCUMENT_NOT_FOUND", "DOCUMENT_NOT_FOUND"]);
  assert.equal(durable.events.filter((event) => event.action === "DOCUMENT_ACCESS_DENIED").length, 1);
});

test("expected facts and claims are covered independently", () => {
  const result = new AnswerCorrectnessEvaluator().evaluate(evaluationCase(), workflowExecution().finalAnswer);
  assert.equal(result.expectedFactCoverage, 1);
  assert.equal(result.expectedClaimCoverage, 1);
  assert.equal(result.status, "correct");
});

test("missing expected facts and claims fail correctness", () => {
  const result = new AnswerCorrectnessEvaluator().evaluate(evaluationCase(), "Employees receive 24 days.");
  assert.equal(result.status, "incomplete");
  assert.deepEqual(result.missingExpectedClaims, ["carryover is capped at 10 days"]);
});

test("forbidden facts fail correctness", () => {
  const result = new AnswerCorrectnessEvaluator().evaluate(evaluationCase(), "Employees receive company cars.");
  assert.equal(result.status, "forbidden_content");
  assert.equal(result.forbiddenFactsPresent.length, 1);
});

test("absent truth labels remain unevaluated", () => {
  const entry = evaluationCase({ grounding: { expectedFacts: [], expectedClaims: [], forbiddenFacts: [] } });
  assert.equal(new AnswerCorrectnessEvaluator().evaluate(entry, "anything").evaluated, false);
});

test("rejected evidence candidate still lowers retrieval precision and selection remains separate", async () => {
  const result = (await runner().run(dataset())).results[0]!;
  assert.equal(result.contextRelevance.chunk.precision, 0.5);
  assert.deepEqual(result.workflowArtifacts?.evidenceSelectedCandidates.map((item) => item.chunkId), [goodChunk]);
});

test("unauthorized candidates are excluded from retrieval metrics and serialized IDs", async () => {
  const execution = workflowExecution();
  execution.authorizationByChunkId = new Map([[goodChunk, true], [noiseChunk, false]]);
  const result = (await runner(execution).run(dataset())).results[0]!;
  assert.deepEqual(result.retrievedChunkIds, [goodChunk]);
  assert.equal(JSON.stringify(result.workflowArtifacts).includes(rawDeniedChunk), false);
  assert.equal(JSON.stringify(result).includes(noiseChunk), false);
  assert.equal(result.workflowArtifacts?.preAuthorizationDiagnostics.vectorCandidateCount, 1);
  assert.match(result.workflowArtifacts!.preAuthorizationDiagnostics.vectorCandidates[0]!.fingerprint, /^[a-f0-9]{24}$/);
});

test("fixed default K and explicit K affect metrics only", async () => {
  const defaultResult = (await runner().run(dataset())).results[0]!;
  const explicitResult = (await runner(workflowExecution(), { topK: 1 }).run(dataset())).results[0]!;
  assert.equal(defaultResult.contextRelevance.chunk.k, DEFAULT_RETRIEVAL_METRIC_CUTOFF_K);
  assert.equal(explicitResult.contextRelevance.chunk.k, 1);
  assert.equal(workflowExecution().artifacts?.retrievalCandidates.length, 2);
});

test("empty case and tag selections fail", async () => {
  await assert.rejects(() => runner(workflowExecution(), { caseIds: ["missing"] }).run(dataset()), RagEvaluationConfigurationError);
  await assert.rejects(() => runner(workflowExecution(), { tags: ["missing"] }).run(dataset()), RagEvaluationConfigurationError);
});

test("unsupported authorization scenario and actor mismatch fail before workflow", async () => {
  const unsupported = evaluationCase({ authorization: { tenantScenario: "other-tenant", actor: { baseRole: "EMPLOYEE" }, permissionScenario: "scenario" } });
  await assert.rejects(() => runner().run(dataset(unsupported)), /permission scenario is unsupported/);
  const mismatch = evaluationCase({ authorization: { tenantScenario: "same_tenant", actor: { actorId: "different", baseRole: "EMPLOYEE" }, permissionScenario: "documents_use_in_ai_unrestricted" } });
  await assert.rejects(() => runner().run(dataset(mismatch)), /actorId mismatch/);
});

test("configuration fingerprint covers runtime quality controls and excludes volatile metadata", () => {
  const base = {
    retrieval: { metricCutoffK: 10, workflowTopK: { directQuestion: 5, summarization: 12 }, weights: { vector: 1, keyword: 1 } },
    answerRelevanceJudge: { provider: "p", model: "judge-a", modelRevisionStatus: "unavailable" as const, componentVersion: "judge-v1" },
    citationsEnabled: true,
    maxTokens: 1200,
    metadata: { requestId: "secret-runtime-id", apiKey: "secret" },
  };
  const left = createEvaluationConfigurationIdentity("dataset", base);
  const right = createEvaluationConfigurationIdentity("dataset", { ...base, answerRelevanceJudge: { provider: "p", model: "judge-b", modelRevisionStatus: "unavailable", componentVersion: "judge-v1" }, metadata: { requestId: "other" } });
  assert.notEqual(left.configurationHash, right.configurationHash);
  assert.match(JSON.stringify(left.normalizedConfiguration), /citationsEnabled/);
  assert.match(JSON.stringify(left.normalizedConfiguration), /maxTokens/);
  assert.doesNotMatch(JSON.stringify(left), /secret-runtime-id|apiKey|secret/);
});

test("forged stored aggregates and empty comparison reports are rejected", async () => {
  const result = (await runner().run(dataset())).results[0]!;
  const report = createRagEvaluationReport({ datasetVersion: "phase-3-1", configuration: {}, results: [result] });
  const forged = structuredClone(report);
  forged.aggregateMetrics.casePassRate = 0;
  assert.throws(() => compareRagEvaluationReports(report, forged), (error: unknown) => error instanceof RagComparisonError && error.code === "INCONSISTENT_REPORT_AGGREGATES");
  const forgedRetrieval = structuredClone(report);
  forgedRetrieval.aggregateMetrics.meanPrecisionAtK = 1;
  assert.throws(() => compareRagEvaluationReports(report, forgedRetrieval), /stored aggregates/);
  const forgedSecurity = structuredClone(report);
  forgedSecurity.aggregateMetrics.authorizationViolationCount = 9;
  assert.throws(() => compareRagEvaluationReports(report, forgedSecurity), /stored aggregates/);
  const empty = { ...report, results: [], aggregateMetrics: { ...report.aggregateMetrics, caseCount: 0, passedCaseCount: 0, casePassRate: 0 } };
  assert.throws(() => compareRagEvaluationReports(empty, empty), RagComparisonError);
});

test("measurement availability counts are correct and disappearance fails the default gate", async () => {
  const result = (await runner().run(dataset())).results[0]!;
  const baseline = createRagEvaluationReport({ datasetVersion: "phase-3-1", configuration: {}, results: [result] });
  assert.equal(baseline.aggregateMetrics.correctnessEvaluatedCaseCount, 1);
  assert.equal(baseline.aggregateMetrics.correctnessUnavailableCaseCount, 0);
  const unavailable = structuredClone(result);
  unavailable.answerRelevance = {
    ...unavailable.answerRelevance,
    evaluated: false,
    score: null,
    relevant: null,
    classification: "evaluation_unavailable",
    judgeStatus: "not_run",
  };
  unavailable.casePassed = false;
  const candidate = createRagEvaluationReport({ datasetVersion: "phase-3-1", configuration: {}, results: [unavailable] });
  assert.equal(candidate.aggregateMetrics.answerRelevanceEvaluatedCaseCount, 0);
  assert.equal(candidate.aggregateMetrics.answerRelevanceUnavailableCaseCount, 1);
  const compared = compareRagEvaluationReports(baseline, candidate);
  assert.ok(compared.gate.hardFailures.some((finding) => finding.code === "ANSWER_RELEVANCE_MEASUREMENT_UNAVAILABLE"));
});

test("unlabeled cases do not inflate correctness availability denominators", async () => {
  const unlabeledCase = evaluationCase({ grounding: { expectedFacts: [], expectedClaims: [], forbiddenFacts: [] } });
  const result = (await runner().run(dataset(unlabeledCase))).results[0]!;
  const report = createRagEvaluationReport({ datasetVersion: "phase-3-1", configuration: {}, results: [result] });
  assert.equal(report.aggregateMetrics.correctnessEvaluatedCaseCount, 0);
  assert.equal(report.aggregateMetrics.correctnessUnavailableCaseCount, 0);
  assert.equal(report.aggregateMetrics.correctAnswerRate, null);
});

test("correctness availability and correct-answer-rate regressions are independently gated", async () => {
  const original = (await runner().run(dataset())).results[0]!;
  const baselineResult = structuredClone(original);
  baselineResult.casePassed = false;
  const baseline = createRagEvaluationReport({ datasetVersion: "phase-3-1", configuration: {}, results: [baselineResult] });

  const unavailableResult = structuredClone(baselineResult);
  unavailableResult.correctness = {
    ...unavailableResult.correctness,
    evaluated: false,
    status: "unavailable",
  };
  const unavailable = createRagEvaluationReport({ datasetVersion: "phase-3-1", configuration: {}, results: [unavailableResult] });
  assert.ok(compareRagEvaluationReports(baseline, unavailable).gate.hardFailures.some(
    (entry) => entry.code === "CORRECTNESS_MEASUREMENT_UNAVAILABLE",
  ));

  const incompleteResult = structuredClone(baselineResult);
  incompleteResult.correctness = { ...incompleteResult.correctness, status: "incomplete" };
  const incomplete = createRagEvaluationReport({ datasetVersion: "phase-3-1", configuration: {}, results: [incompleteResult] });
  assert.ok(compareRagEvaluationReports(baseline, incomplete).gate.qualityFailures.some(
    (entry) => entry.metric === "correctAnswerRate",
  ));

  const permissive = structuredClone(DEFAULT_RAG_REGRESSION_POLICY);
  permissive.allowedRegressions.correctAnswerRate = 1;
  assert.equal(compareRagEvaluationReports(baseline, incomplete, { policy: permissive }).gate.passed, true);
});

test("document-absence claim needs explicit negative evidence or exhaustive coverage", () => {
  const semantic = {
    preparedClaims: [{ claimIndex: 0, answerClaimIndex: 0, text: "The policy does not state employees receive a company car.", originalText: "The policy does not state employees receive a company car." }],
    claimResults: [{ claimIndex: 0, answerClaimIndex: 0, text: "The policy does not state employees receive a company car.", state: "SUPPORTED" as const, supportingEvidenceIds: [goodChunk], deterministicContradiction: false }],
    supportingEvidenceIds: [goodChunk],
    releasedAnswerText: "The policy does not state employees receive a company car.",
    reasonCode: "SEMANTIC_VERIFIED" as const,
  };
  const partial = new GroundednessEvaluator().evaluate({ semanticVerification: semantic, evidenceTexts: ["The policy discusses leave."] });
  const exhaustive = new GroundednessEvaluator().evaluate({ semanticVerification: semantic, exhaustiveDocumentCoverage: true });
  assert.equal(partial.fullyGrounded, false);
  assert.equal(partial.unknownClaimCount, 1);
  assert.equal(exhaustive.fullyGrounded, true);
});
