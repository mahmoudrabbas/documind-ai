import assert from "node:assert/strict";
import test from "node:test";
import type { JudgeOutcome } from "../llmJudge.types.js";
import { AnswerRelevanceEvaluator } from "./answerRelevance.evaluator.js";
import { ContextRelevanceEvaluator } from "./contextRelevance.evaluator.js";
import { aggregateRagEvaluationResults } from "./evaluation.aggregate.js";
import { loadRagEvaluationDatasetV2 } from "./evaluation.datasetV2.js";
import { createRagEvaluationReport } from "./evaluation.report.js";
import {
  RAG_EVALUATION_CASE_SCHEMA_VERSION,
  RAG_EVALUATION_RESULT_SCHEMA_VERSION,
  RagEvaluationCaseV2Schema,
  RagEvaluationResultSchema,
  type RagEvaluationResult,
  type RagExpectedOutcome,
} from "./evaluation.schemas.js";
import {
  GroundednessEvaluator,
  type GroundednessEvaluationInput,
} from "./groundedness.evaluator.js";

const contextEvaluator = new ContextRelevanceEvaluator();

function judgeOutcome(relevancy: number, status: JudgeOutcome["status"] = "completed"): JudgeOutcome {
  return {
    status,
    scores: { faithfulness: 0.9, relevancy, coherence: 0.9, overall: 0.9 },
    provider: "test-provider",
    model: "test-model",
    errorCode: null,
  };
}

function answerEvaluator(relevancy: number): AnswerRelevanceEvaluator {
  return new AnswerRelevanceEvaluator({
    evaluate: async () => judgeOutcome(relevancy),
  });
}

function semanticVerification(
  states: readonly ("SUPPORTED" | "UNSUPPORTED" | "UNKNOWN")[],
  released = false,
): GroundednessEvaluationInput["semanticVerification"] {
  return {
    preparedClaims: states.map((_, index) => ({
      claimIndex: index,
      answerClaimIndex: index,
      text: `claim-${index}`,
      originalText: `claim-${index}`,
    })),
    claimResults: states.map((state, index) => ({
      claimIndex: index,
      answerClaimIndex: index,
      text: `claim-${index}`,
      state,
      supportingEvidenceIds: state === "SUPPORTED" ? [`chunk-${index}`] : [],
      deterministicContradiction: false,
    })),
    supportingEvidenceIds: states.flatMap((state, index) =>
      state === "SUPPORTED" ? [`chunk-${index}`] : [],
    ),
    ...(released ? { releasedAnswerText: "verified answer" } : {}),
    reasonCode: released ? "SEMANTIC_VERIFIED" : "SEMANTIC_VERIFICATION_FAILED",
  };
}

function evaluationResult(options: {
  id?: string;
  relevantId?: string;
  retrievedId?: string;
  passed?: boolean;
  expectedOutcome?: RagExpectedOutcome;
  actualOutcome?: RagExpectedOutcome;
  fullyGrounded?: boolean;
  claimSupportRate?: number;
  answerScore?: number;
  authorizationViolation?: boolean;
  latencyMs?: number;
  tokens?: number;
  cost?: number;
} = {}): RagEvaluationResult {
  const relevantId = options.relevantId ?? "doc-1";
  const retrievedId = options.retrievedId ?? relevantId;
  const authorizationViolation = options.authorizationViolation ?? false;
  const context = contextEvaluator.evaluate({
    retrieved: [
      {
        documentId: retrievedId,
        authorized: !authorizationViolation,
        authorizationReasonCode: authorizationViolation ? "DENIED" : undefined,
      },
    ],
    relevantDocumentIds: [relevantId],
    k: 1,
  });
  const expectedOutcome = options.expectedOutcome ?? "release";
  const actualOutcome = options.actualOutcome ?? expectedOutcome;
  const fullyGrounded = options.fullyGrounded ?? true;
  const violation = context.authorizationViolations;

  return RagEvaluationResultSchema.parse({
    schemaVersion: RAG_EVALUATION_RESULT_SCHEMA_VERSION,
    evaluationCaseId: options.id ?? "case-1",
    datasetVersion: "dataset-2",
    actualRoute: "rag",
    actualIntent: "knowledge_question",
    actualAction:
      actualOutcome === "clarify"
        ? "clarify"
        : actualOutcome === "refuse"
          ? "refuse"
          : "release",
    reasonCode: "TEST",
    retrievedDocumentIds: [retrievedId],
    retrievedChunkIds: [],
    contextRelevance: context,
    groundedness: {
      evaluated: true,
      factualClaimCount: 1,
      supportedClaimCount: fullyGrounded ? 1 : 0,
      unsupportedClaimCount: fullyGrounded ? 0 : 1,
      unknownClaimCount: 0,
      claimSupportRate: options.claimSupportRate ?? (fullyGrounded ? 1 : 0),
      fullyGrounded,
      supportingEvidenceIds: fullyGrounded ? ["chunk-1"] : [],
      faithfulnessScore: 0.9,
      semanticReasonCode: fullyGrounded
        ? "SEMANTIC_VERIFIED"
        : "SEMANTIC_VERIFICATION_FAILED",
    },
    correctness: {
      evaluated: false,
      required: false,
      status: "unavailable",
      expectedFactCoverage: null,
      expectedClaimCoverage: null,
      matchedExpectedFacts: [],
      matchedExpectedClaims: [],
      missingExpectedFacts: [],
      missingExpectedClaims: [],
      forbiddenFactsPresent: [],
    },
    finalAnswer: "final answer",
    answerRelevance: {
      evaluated: true,
      score: options.answerScore ?? 0.8,
      relevant: (options.answerScore ?? 0.8) >= 0.7,
      threshold: 0.7,
      classification: fullyGrounded
        ? "relevant_grounded_answer"
        : "relevant_ungrounded_answer",
      expectedOutcome,
      actualOutcome,
      outcomeCorrect: expectedOutcome === actualOutcome,
      judgeStatus: "completed",
      judgeProvider: "test-provider",
      judgeModel: "test-model",
      errorCode: null,
    },
    finalSourceDocumentIds: actualOutcome === "release" ? [retrievedId] : [],
    finalSourceChunkIds: [],
    authorizationInvariantPassed: context.authorizationInvariantPassed,
    authorizationViolations: violation,
    operational: {
      ...(options.latencyMs === undefined ? {} : { latencyMs: options.latencyMs }),
      ...(options.tokens === undefined ? {} : { tokens: options.tokens }),
      ...(options.cost === undefined ? {} : { estimatedCost: options.cost }),
    },
    execution: { status: "completed", failureKind: null, errorCode: null },
    expectedOutcome,
    actualOutcome,
    outcomeCorrect: expectedOutcome === actualOutcome,
    casePassed:
      (options.passed ?? true) &&
      expectedOutcome === actualOutcome &&
      !authorizationViolation,
  });
}

test("1. context relevance: perfect retrieval", () => {
  const result = contextEvaluator.evaluate({
    retrieved: [
      { documentId: "a", authorized: true },
      { documentId: "b", authorized: true },
    ],
    relevantDocumentIds: ["a", "b"],
    k: 2,
  });
  assert.equal(result.document.precision, 1);
  assert.equal(result.document.recall, 1);
  assert.equal(result.document.hit, true);
});

test("2. context relevance: partial recall", () => {
  const result = contextEvaluator.evaluate({
    retrieved: [{ documentId: "a", authorized: true }],
    relevantDocumentIds: ["a", "b"],
  });
  assert.equal(result.document.recall, 0.5);
  assert.deepEqual(result.document.misses, ["b"]);
});

test("3. context relevance: irrelevant extras lower precision", () => {
  const result = contextEvaluator.evaluate({
    retrieved: [
      { documentId: "a", authorized: true },
      { documentId: "noise", authorized: true },
    ],
    relevantDocumentIds: ["a"],
  });
  assert.equal(result.document.precision, 0.5);
  assert.deepEqual(result.document.falsePositives, ["noise"]);
});

test("4. context relevance: lower relevant rank affects reciprocal rank", () => {
  const result = contextEvaluator.evaluate({
    retrieved: [
      { documentId: "noise", authorized: true },
      { documentId: "a", authorized: true },
    ],
    relevantDocumentIds: ["a"],
  });
  assert.equal(result.document.reciprocalRank, 0.5);
});

test("5. context relevance: no retrieved results", () => {
  const result = contextEvaluator.evaluate({ retrieved: [], relevantDocumentIds: ["a"] });
  assert.equal(result.document.precision, 0);
  assert.equal(result.document.recall, 0);
  assert.equal(result.document.hit, false);
});

test("6. context relevance: duplicate IDs count once", () => {
  const result = contextEvaluator.evaluate({
    retrieved: [
      { documentId: "a", authorized: true },
      { documentId: "a", authorized: true },
      { documentId: "noise", authorized: true },
    ],
    relevantDocumentIds: ["a"],
  });
  assert.deepEqual(result.document.retrievedIds, ["a", "noise"]);
  assert.equal(result.document.precision, 0.5);
});

test("7. context relevance: unauthorized results are invariant violations", () => {
  const result = contextEvaluator.evaluate({
    retrieved: [{ documentId: "secret", chunkId: "secret-c", authorized: false }],
    relevantDocumentIds: ["allowed"],
    relevantChunkIds: ["allowed-c"],
  });
  assert.equal(result.authorizationInvariantPassed, false);
  assert.equal(result.authorizationViolations.length, 1);
  assert.deepEqual(result.document.falsePositives, []);
  assert.deepEqual(result.document.retrievedIds, []);
});

test("context relevance: absent labels remain unevaluated", () => {
  const result = contextEvaluator.evaluate({
    retrieved: [{ documentId: "a", authorized: true }],
  });
  assert.equal(result.document.evaluated, false);
  assert.equal(result.document.precision, null);
  assert.equal(result.chunk.recall, null);
});

test("context relevance: chunk labels are evaluated independently", () => {
  const result = contextEvaluator.evaluate({
    retrieved: [
      { documentId: "a", chunkId: "a-irrelevant", authorized: true },
      { documentId: "a", chunkId: "a-relevant", authorized: true },
    ],
    relevantDocumentIds: ["a"],
    relevantChunkIds: ["a-relevant"],
  });
  assert.equal(result.document.precision, 1);
  assert.equal(result.chunk.precision, 0.5);
  assert.equal(result.chunk.reciprocalRank, 0.5);
});

test("context relevance: authorization scans beyond the metric cutoff", () => {
  const result = contextEvaluator.evaluate({
    retrieved: [
      { documentId: "allowed", authorized: true },
      { documentId: "secret", authorized: false },
    ],
    relevantDocumentIds: ["allowed"],
    k: 1,
  });
  assert.equal(result.document.precision, 1);
  assert.equal(result.authorizationInvariantPassed, false);
});

test("8. groundedness: all claims supported", () => {
  const result = new GroundednessEvaluator().evaluate({
    semanticVerification: semanticVerification(["SUPPORTED", "SUPPORTED"], true),
  });
  assert.equal(result.claimSupportRate, 1);
  assert.equal(result.fullyGrounded, true);
});

test("9. groundedness: partial claim support", () => {
  const result = new GroundednessEvaluator().evaluate({
    semanticVerification: semanticVerification(["SUPPORTED", "UNSUPPORTED"]),
  });
  assert.equal(result.claimSupportRate, 0.5);
  assert.equal(result.unsupportedClaimCount, 1);
  assert.equal(result.fullyGrounded, false);
});

test("10. groundedness: UNKNOWN claims remain distinct", () => {
  const result = new GroundednessEvaluator().evaluate({
    semanticVerification: semanticVerification(["SUPPORTED", "UNKNOWN"]),
  });
  assert.equal(result.unknownClaimCount, 1);
  assert.equal(result.unsupportedClaimCount, 0);
});

test("11. groundedness: no factual claims is not scored or fully grounded", () => {
  const result = new GroundednessEvaluator().evaluate({
    semanticVerification: semanticVerification([]),
  });
  assert.equal(result.claimSupportRate, null);
  assert.equal(result.fullyGrounded, false);
});

test("12. groundedness: fully grounded preserves final verified answer", () => {
  const result = new GroundednessEvaluator().evaluate({
    semanticVerification: semanticVerification(["SUPPORTED"], true),
    faithfulnessScore: 0.95,
  });
  assert.equal(result.finalVerifiedAnswer, "verified answer");
  assert.equal(result.faithfulnessScore, 0.95);
});

test("13. answer relevance: relevant grounded answer", async () => {
  const result = await answerEvaluator(0.9).evaluate({
    question: "What is the leave allowance?",
    finalAnswer: "It is 20 days.",
    evidence: [],
    expectedOutcome: "release",
    actualOutcome: "release",
    fullyGrounded: true,
  });
  assert.equal(result.classification, "relevant_grounded_answer");
});

test("14. answer relevance: grounded but irrelevant answer", async () => {
  const result = await answerEvaluator(0.2).evaluate({
    question: "What is the leave allowance?",
    finalAnswer: "The office opens at nine.",
    evidence: [],
    expectedOutcome: "release",
    actualOutcome: "release",
    fullyGrounded: true,
  });
  assert.equal(result.classification, "grounded_but_irrelevant_answer");
});

test("15. answer relevance: correct refusal", async () => {
  const result = await answerEvaluator(0.8).evaluate({
    question: "Tell me a secret",
    finalAnswer: "I cannot answer that.",
    evidence: [],
    expectedOutcome: "refuse",
    actualOutcome: "refuse",
    fullyGrounded: false,
  });
  assert.equal(result.classification, "correct_refusal");
});

test("16. answer relevance: incorrect refusal", async () => {
  const result = await answerEvaluator(0.8).evaluate({
    question: "What is the policy?",
    finalAnswer: "I cannot answer that.",
    evidence: [],
    expectedOutcome: "release",
    actualOutcome: "refuse",
    fullyGrounded: false,
  });
  assert.equal(result.classification, "incorrect_refusal");
});

test("17. answer relevance: clarification distinguishes relevant prompt", async () => {
  const correct = await answerEvaluator(0.9).evaluate({
    question: "What about it?",
    finalAnswer: "Which policy do you mean?",
    evidence: [],
    expectedOutcome: "clarify",
    actualOutcome: "clarify",
    fullyGrounded: false,
  });
  const irrelevant = await answerEvaluator(0.1).evaluate({
    question: "What about it?",
    finalAnswer: "What is your favorite color?",
    evidence: [],
    expectedOutcome: "clarify",
    actualOutcome: "clarify",
    fullyGrounded: false,
  });
  assert.equal(correct.classification, "correct_clarification");
  assert.equal(irrelevant.classification, "irrelevant_clarification");
});

test("18. aggregation: combines multiple cases", () => {
  const aggregate = aggregateRagEvaluationResults([
    evaluationResult({ id: "a" }),
    evaluationResult({ id: "b", retrievedId: "noise", passed: false }),
  ]);
  assert.equal(aggregate.casePassRate, 0.5);
  assert.equal(aggregate.retrievalHitRate, 0.5);
  assert.equal(aggregate.mrr, 0.5);
});

test("19. aggregation: security violation count is hard", () => {
  const aggregate = aggregateRagEvaluationResults([
    evaluationResult({ authorizationViolation: true }),
  ]);
  assert.equal(aggregate.authorizationViolationCount, 1);
  assert.equal(aggregate.authorizationInvariantPassed, false);
  assert.equal(aggregate.casePassRate, 0);
});

test("20. aggregation: empty dataset behavior is defined", () => {
  const aggregate = aggregateRagEvaluationResults([]);
  assert.equal(aggregate.caseCount, 0);
  assert.equal(aggregate.casePassRate, 0);
  assert.equal(aggregate.retrievalHitRate, null);
  assert.equal(aggregate.latency.meanMs, null);
});

test("21. aggregation: latency, token, and cost samples aggregate independently", () => {
  const aggregate = aggregateRagEvaluationResults([
    evaluationResult({ id: "a", latencyMs: 100, tokens: 10, cost: 0.1 }),
    evaluationResult({ id: "b", latencyMs: 300, tokens: 30, cost: 0.3 }),
  ]);
  assert.equal(aggregate.latency.meanMs, 200);
  assert.equal(aggregate.latency.p50Ms, 100);
  assert.equal(aggregate.totalTokens, 40);
  assert.equal(aggregate.totalEstimatedCost, 0.4);
});

test("22. dataset: existing 22-case V1 dataset migrates safely", () => {
  const dataset = loadRagEvaluationDatasetV2();
  assert.equal(dataset.cases.length, 22);
  assert.match(dataset.datasetVersion, /^v1-migrated-/u);
  assert.ok(dataset.cases.every((entry) => entry.tags.includes("v1-migrated")));
});

test("23. dataset: Arabic evaluation case", () => {
  const evaluationCase = RagEvaluationCaseV2Schema.parse({
    schemaVersion: RAG_EVALUATION_CASE_SCHEMA_VERSION,
    id: "arabic-policy",
    description: "Arabic leave policy question",
    language: "ar",
    question: "ما هي سياسة الإجازات؟",
    expectedRoute: "rag",
    expectedOutcome: "release",
    retrieval: {
      expectedDocumentIds: ["leave-policy"],
      expectedRelevantDocumentIds: ["leave-policy"],
      expectedRelevantChunkIds: [],
      knownIrrelevantDocumentIds: [],
    },
    grounding: { expectedFacts: [], expectedClaims: [], forbiddenFacts: [] },
    citations: {
      expectedSourceDocumentIds: ["leave-policy"],
      sourceRequired: true,
      sourceForbidden: false,
    },
    evaluationModes: ["end_to_end"],
  });
  assert.equal(evaluationCase.language, "ar");
});

test("24. dataset: permission-aware case", () => {
  const evaluationCase = RagEvaluationCaseV2Schema.parse({
    schemaVersion: RAG_EVALUATION_CASE_SCHEMA_VERSION,
    id: "restricted-policy",
    description: "Employee cannot use a restricted document",
    language: "en",
    question: "What does the restricted policy say?",
    expectedOutcome: "refuse",
    authorization: {
      tenantScenario: "tenant-a",
      actor: {
        baseRole: "EMPLOYEE",
        customRoleId: "restricted-reader",
        scopes: {
          selfOnly: true,
          departmentIds: ["sales"],
          documentCategories: [],
          documentClassifications: ["internal"],
        },
      },
      permissionScenario: "documents-use-in-ai-denied",
    },
    retrieval: {
      expectedDocumentIds: [],
      expectedRelevantDocumentIds: [],
      expectedRelevantChunkIds: [],
      knownIrrelevantDocumentIds: [],
    },
    grounding: { expectedFacts: [], expectedClaims: [], forbiddenFacts: [] },
    citations: {
      expectedSourceDocumentIds: [],
      sourceRequired: false,
      sourceForbidden: true,
    },
    evaluationModes: ["end_to_end"],
  });
  assert.equal(evaluationCase.authorization?.actor.scopes?.selfOnly, true);
});

test("25. dataset: malformed evaluation case is rejected", () => {
  assert.throws(() =>
    RagEvaluationCaseV2Schema.parse({
      schemaVersion: RAG_EVALUATION_CASE_SCHEMA_VERSION,
      id: "bad",
      description: "Invalid contradictory citation requirements",
      language: "en",
      question: "Question?",
      expectedOutcome: "release",
      retrieval: {},
      grounding: {},
      citations: {
        expectedSourceDocumentIds: [],
        sourceRequired: true,
        sourceForbidden: true,
      },
      evaluationModes: ["end_to_end"],
    }),
  );
});

test("versioned report contract includes extensible configuration metadata", () => {
  const result = evaluationResult();
  const report = createRagEvaluationReport({
    datasetVersion: "dataset-2",
    generatedAt: new Date("2026-08-11T00:00:00.000Z"),
    configuration: {
      name: "baseline",
      retrieval: { metricCutoffK: 10, workflowTopK: { directQuestion: 5, summarization: 12 }, weights: { vector: 0.6, keyword: 0.4 } },
      reranker: "current-reranker",
      embeddingModel: "embedding-model",
      answerModel: "answer-model",
      verifierModel: "verifier-model",
      promptVersions: { answer: "v1" },
      thresholds: { sufficiency: 0.5 },
    },
    results: [result],
  });
  assert.equal(report.reportVersion, "1.1.0");
  assert.equal(report.aggregateMetrics.caseCount, 1);
});
