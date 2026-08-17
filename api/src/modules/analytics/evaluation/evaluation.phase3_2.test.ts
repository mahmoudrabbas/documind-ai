import assert from "node:assert/strict";
import test from "node:test";
import {
  createCitationSemanticEvaluationArtifact,
  notifyCitationSemanticEvaluationObserver,
} from "../../agents/chatSupervisorComposition.js";
import type { CitationSemanticVerificationResult } from "../../agents/citationSemanticVerification.service.js";
import {
  AnswerCorrectnessEvaluator,
  type CorrectnessSemanticJudge,
} from "./correctness.evaluator.js";
import { assertCompleteRuntimeComponentIdentity, createEvaluationConfigurationIdentity } from "./evaluation.configuration.js";
import {
  getEvaluationPermissionScenario,
  permissionScenarioMatches,
} from "./evaluation.permissionScenarios.js";
import { DEFAULT_RAG_REGRESSION_POLICY } from "./evaluation.regressionPolicy.js";
import {
  RAG_EVALUATION_CASE_SCHEMA_VERSION,
  RagEvaluationCaseV2Schema,
  type RagEvaluationCaseV2,
  type RagEvaluationConfiguration,
} from "./evaluation.schemas.js";
import { GroundednessEvaluator } from "./groundedness.evaluator.js";

function evaluationCase(grounding: RagEvaluationCaseV2["grounding"]): RagEvaluationCaseV2 {
  return RagEvaluationCaseV2Schema.parse({
    schemaVersion: RAG_EVALUATION_CASE_SCHEMA_VERSION,
    id: "phase-3-2-case",
    description: "hardening",
    language: "mixed",
    question: "What does the policy say?",
    expectedOutcome: "release",
    retrieval: {
      expectedDocumentIds: [], expectedRelevantDocumentIds: [],
      expectedRelevantChunkIds: [], knownIrrelevantDocumentIds: [],
    },
    grounding,
    citations: { expectedSourceDocumentIds: [], sourceRequired: false, sourceForbidden: false },
    evaluationModes: ["end_to_end"],
  });
}

test("correctness rejects substring-only and polarity matches", () => {
  const car = new AnswerCorrectnessEvaluator().evaluate(
    evaluationCase({ expectedFacts: ["car"], expectedClaims: [], forbiddenFacts: [] }),
    "The carryover rule applies.",
  );
  assert.equal(car.status, "incomplete");
  const positive = new AnswerCorrectnessEvaluator().evaluate(
    evaluationCase({ expectedFacts: ["employees receive 24 days"], expectedClaims: [], forbiddenFacts: [] }),
    "Employees do not receive 24 days.",
  );
  assert.equal(positive.status, "contradicted");
  const falseSuffix = new AnswerCorrectnessEvaluator().evaluate(
    evaluationCase({ expectedFacts: ["employees receive 24 days"], expectedClaims: [], forbiddenFacts: [] }),
    "Employees receive 24 days is false.",
  );
  assert.equal(falseSuffix.status, "contradicted");
  const negative = new AnswerCorrectnessEvaluator().evaluate(
    evaluationCase({ expectedFacts: ["employees do not receive 24 days"], expectedClaims: [], forbiddenFacts: [] }),
    "Employees receive 24 days.",
  );
  assert.equal(negative.status, "contradicted");
});

test("Arabic negation mismatch and quantity contradiction fail", () => {
  const arabic = new AnswerCorrectnessEvaluator().evaluate(
    evaluationCase({ expectedFacts: ["يحصل الموظفون على 24 يوما"], expectedClaims: [], forbiddenFacts: [] }),
    "لا يحصل الموظفون على 24 يوما.",
  );
  assert.equal(arabic.status, "contradicted");
  const quantity = new AnswerCorrectnessEvaluator().evaluate(
    evaluationCase({ expectedFacts: ["employees receive 24 days"], expectedClaims: [], forbiddenFacts: [] }),
    "Employees receive 20 days.",
  );
  assert.equal(quantity.status, "contradicted");
});

test("bounded semantic judgments accept paraphrases and forbidden paraphrases", async () => {
  const judge: CorrectnessSemanticJudge = { judge: async (input) => ({
    expected: input.expected.map((proposition) => ({ proposition, status: "matched", confidence: 0.94, reasonCode: "SEMANTIC_PARAPHRASE" })),
    forbidden: input.forbidden.map((proposition) => ({ proposition, status: "present", confidence: 0.93, reasonCode: "SEMANTIC_FORBIDDEN_PARAPHRASE" })),
  }) };
  const evaluator = new AnswerCorrectnessEvaluator(judge);
  const paraphrase = await evaluator.evaluateAsync(
    evaluationCase({ expectedFacts: ["employees receive 24 days of leave"], expectedClaims: [], forbiddenFacts: [] }),
    "Staff members are granted twenty-four vacation days.",
  );
  assert.equal(paraphrase.status, "correct");
  const arabic = await evaluator.evaluateAsync(
    evaluationCase({ expectedFacts: ["يحصل الموظفون على إجازة سنوية"], expectedClaims: [], forbiddenFacts: [] }),
    "يستحق العاملون عطلة كل عام.",
  );
  assert.equal(arabic.status, "correct");
  const forbidden = await evaluator.evaluateAsync(
    evaluationCase({ expectedFacts: [], expectedClaims: [], forbiddenFacts: ["employees receive company cars"] }),
    "A vehicle is supplied by the company to every member of staff.",
  );
  assert.equal(forbidden.status, "forbidden_content");
});

test("malformed semantic output fails closed and unlabeled cases remain unavailable", async () => {
  const malformed = new AnswerCorrectnessEvaluator({ judge: async () => ({ expected: [] }) });
  const result = await malformed.evaluateAsync(
    evaluationCase({ expectedFacts: ["employees receive 24 days of leave"], expectedClaims: [], forbiddenFacts: [] }),
    "Staff are entitled to twenty-four vacation days.",
  );
  assert.equal(result.evaluated, false);
  assert.equal(result.status, "unavailable");
  assert.equal(new AnswerCorrectnessEvaluator().evaluate(
    evaluationCase({ expectedFacts: [], expectedClaims: [], forbiddenFacts: [] }), "anything",
  ).required, false);
});

function configuration(): RagEvaluationConfiguration {
  return {
    retrieval: { metricCutoffK: 10, workflowTopK: { directQuestion: 5, summarization: 12 }, weights: { vector: 1, keyword: 1 } },
    fusion: { strategy: "rrf", version: "k60-v1" },
    rerankerDetails: { provider: "local", name: "reranker", componentVersion: "1" },
    embedding: { provider: "embed", model: "embed-a", modelRevisionStatus: "unavailable", componentVersion: "embed-v1" },
    answer: { provider: "failover", componentVersion: "failover-v1", chain: [{ provider: "p1", model: "a", modelRevisionStatus: "unavailable", componentVersion: "p1-v1" }, { provider: "p2", model: "b", modelRevisionStatus: "unavailable", componentVersion: "p2-v1" }] },
    verifier: { provider: "p1", model: "verify-a", modelRevisionStatus: "unavailable", componentVersion: "verify-v1" },
    answerRelevanceJudge: { provider: "p1", model: "judge-a", modelRevisionStatus: "unavailable", componentVersion: "judge-v1" },
    semanticCorrectnessJudge: { provider: "p1", model: "correct-a", modelRevisionStatus: "unavailable", componentVersion: "correct-v1" },
    citationsEnabled: true,
    maxTokens: 1200,
    promptVersions: { answer: "a1", verifier: "v1", judge: "j1" },
    thresholds: { answerRelevance: 0.7, semantic: 0.8 },
    evidenceThresholds: { minimumTotalScore: 0.25 },
    workflowVersions: { workflow: "chat-rag-v1", answerWriter: "1" },
    metricSemanticsVersion: "1.1.0",
    runtimeIdentityRequired: true,
  };
}

test("quality-relevant component, prompt, failover model, and order changes alter fingerprints", () => {
  const base = configuration();
  const hash = createEvaluationConfigurationIdentity("dataset", base).configurationHash;
  const variants: RagEvaluationConfiguration[] = [
    { ...base, embedding: { provider: "embed", model: "embed-b", modelRevisionStatus: "unavailable", componentVersion: "embed-v1" } },
    { ...base, verifier: { provider: "p1", model: "verify-b", modelRevisionStatus: "unavailable", componentVersion: "verify-v1" } },
    { ...base, answerRelevanceJudge: { provider: "p1", model: "judge-b", modelRevisionStatus: "unavailable", componentVersion: "judge-v1" } },
    { ...base, promptVersions: { ...base.promptVersions, answer: "a2" } },
    { ...base, answer: { provider: "failover", componentVersion: "failover-v1", chain: [{ provider: "p1", model: "changed", modelRevisionStatus: "unavailable", componentVersion: "p1-v1" }, { provider: "p2", model: "b", modelRevisionStatus: "unavailable", componentVersion: "p2-v1" }] } },
    { ...base, answer: { provider: "failover", componentVersion: "failover-v1", chain: [{ provider: "p2", model: "b", modelRevisionStatus: "unavailable", componentVersion: "p2-v1" }, { provider: "p1", model: "a", modelRevisionStatus: "unavailable", componentVersion: "p1-v1" }] } },
  ];
  for (const variant of variants) {
    assert.notEqual(createEvaluationConfigurationIdentity("dataset", variant).configurationHash, hash);
  }
});

test("secrets and runtime IDs are excluded while unresolved required identity fails", () => {
  const left = createEvaluationConfigurationIdentity("dataset", { ...configuration(), metadata: { apiKey: "one", tenantId: "t1", traceId: "x" } });
  const right = createEvaluationConfigurationIdentity("dataset", { ...configuration(), metadata: { apiKey: "two", tenantId: "t2", traceId: "y" } });
  assert.equal(left.configurationHash, right.configurationHash);
  assert.throws(() => createEvaluationConfigurationIdentity("dataset", {
    ...configuration(), embedding: undefined, unavailableQualityFields: ["embedding.model"],
  }), /runtime identity is unavailable/i);
});

test("runtime identity requires complete component identity and explicit unavailable revisions", () => {
  assert.doesNotThrow(() => assertCompleteRuntimeComponentIdentity({
    provider: "provider", model: "model", modelRevisionStatus: "unavailable", componentVersion: "adapter-v1",
  }, "component"));
  assert.throws(() => assertCompleteRuntimeComponentIdentity({ model: "model", modelRevisionStatus: "unavailable", componentVersion: "adapter-v1" }, "component"), /provider/);
  assert.throws(() => assertCompleteRuntimeComponentIdentity({ provider: "provider", model: "model", componentVersion: "adapter-v1" }, "component"), /revision/);
  assert.throws(() => assertCompleteRuntimeComponentIdentity({ provider: "provider", model: "model", modelRevisionStatus: "unavailable" }, "component"), /componentVersion/);
  assert.throws(() => createEvaluationConfigurationIdentity("dataset", { ...configuration(), embedding: { provider: "embed", model: "embed-a", modelRevisionStatus: "unavailable" } } as never), /componentVersion/);
});

test("each quality component and ordered failover identity changes the fingerprint", () => {
  const base = configuration();
  const hash = createEvaluationConfigurationIdentity("dataset", base).configurationHash;
  const variants: RagEvaluationConfiguration[] = [
    { ...base, embedding: { ...base.embedding!, componentVersion: "embed-v2" } },
    { ...base, answer: { ...base.answer!, componentVersion: "failover-v2" } },
    { ...base, verifier: { ...base.verifier!, componentVersion: "verify-v2" } },
    { ...base, answerRelevanceJudge: { ...base.answerRelevanceJudge!, componentVersion: "judge-v2" } },
    { ...base, semanticCorrectnessJudge: { ...base.semanticCorrectnessJudge!, componentVersion: "correct-v2" } },
    { ...base, rerankerDetails: { ...base.rerankerDetails!, componentVersion: "reranker-v2" } },
    { ...base, fusion: { ...base.fusion!, version: "k60-v2" } },
    { ...base, answer: { ...base.answer!, chain: [...base.answer!.chain!].reverse() } },
  ];
  for (const variant of variants) assert.notEqual(createEvaluationConfigurationIdentity("dataset", variant).configurationHash, hash);
});

test("permission registry grounds allowed, denied, and scoped scenarios independently", () => {
  const unrestricted = getEvaluationPermissionScenario("documents_use_in_ai_unrestricted")!;
  assert.equal(permissionScenarioMatches(unrestricted, { documentsUseInAiGranted: true }, undefined), true);
  assert.equal(permissionScenarioMatches(unrestricted, { documentsUseInAiGranted: false }, undefined), false);
  const denied = getEvaluationPermissionScenario("documents_use_in_ai_denied")!;
  assert.equal(permissionScenarioMatches(denied, { documentsUseInAiGranted: true }, undefined), false);
  const scoped = getEvaluationPermissionScenario("documents_use_in_ai_hr_only")!;
  const scopes = { selfOnly: false, departmentIds: ["hr"], documentCategories: [], documentClassifications: [] };
  assert.equal(permissionScenarioMatches(scoped, { documentsUseInAiGranted: true, scopes, departmentSemanticKeys: ["hr"] }, scopes), true);
  assert.equal(permissionScenarioMatches(scoped, { documentsUseInAiGranted: true }, scopes), false);
  assert.equal(permissionScenarioMatches(scoped, { documentsUseInAiGranted: true, scopes, departmentSemanticKeys: ["finance"] }, scopes), false);
  assert.equal(permissionScenarioMatches(unrestricted, { documentsUseInAiGranted: true, scopes, departmentSemanticKeys: ["hr"] }, undefined), false);
  assert.equal(getEvaluationPermissionScenario("dataset_self_attestation"), null);
});

function semanticAbsence(state: "SUPPORTED" | "UNSUPPORTED" = "SUPPORTED", contradiction = false) {
  const text = "The policy does not state employees receive a company car";
  return {
    preparedClaims: [{ claimIndex: 0, answerClaimIndex: 0, text, originalText: text }],
    claimResults: [{ claimIndex: 0, answerClaimIndex: 0, text, state, supportingEvidenceIds: ["chunk"], deterministicContradiction: contradiction }],
    supportingEvidenceIds: ["chunk"], releasedAnswerText: text, reasonCode: "SEMANTIC_VERIFIED" as const,
  };
}

test("document absence fails closed for partial retrieval in English and Arabic", () => {
  const evaluator = new GroundednessEvaluator();
  assert.equal(evaluator.evaluate({ semanticVerification: semanticAbsence() }).unknownClaimCount, 1);
  const arabicText = "السياسة لا تنص على منح الموظفين سيارات";
  const arabic = semanticAbsence();
  arabic.preparedClaims[0]!.text = arabicText;
  arabic.claimResults[0]!.text = arabicText;
  assert.equal(evaluator.evaluate({ semanticVerification: arabic }).unknownClaimCount, 1);
});

test("only proposition-linked negative evidence or safe exhaustive coverage supports absence", () => {
  const evaluator = new GroundednessEvaluator();
  const linked = evaluator.evaluate({
    semanticVerification: semanticAbsence(),
    documentAbsence: [{ proposition: "employees receive a company car", exhaustiveDocumentCoverage: false, explicitNegativeEvidence: ["The policy does not mention employees receiving a company car"] }],
  });
  assert.equal(linked.fullyGrounded, true);
  const unrelated = evaluator.evaluate({
    semanticVerification: semanticAbsence(),
    documentAbsence: [{ proposition: "employees receive a company car", exhaustiveDocumentCoverage: false, explicitNegativeEvidence: ["The policy does not mention annual leave"] }],
  });
  assert.equal(unrelated.fullyGrounded, false);
  const exhaustive = evaluator.evaluate({
    semanticVerification: semanticAbsence(),
    documentAbsence: [{ proposition: "employees receive a company car", exhaustiveDocumentCoverage: true, explicitNegativeEvidence: [] }],
  });
  assert.equal(exhaustive.fullyGrounded, true);
  const contradicted = evaluator.evaluate({
    semanticVerification: semanticAbsence("SUPPORTED", true),
    documentAbsence: [{ proposition: "employees receive a company car", exhaustiveDocumentCoverage: true, explicitNegativeEvidence: [] }],
  });
  assert.equal(contradicted.fullyGrounded, false);
});

test("semantic observer artifact is deeply isolated and immutable", () => {
  const authoritative = {
    claims: ["claim"],
    preparedClaims: [{ claimIndex: 0, answerClaimIndex: 0, text: "claim", originalText: "claim" }],
    claimResults: [{ claimIndex: 0, answerClaimIndex: 0, text: "claim", state: "SUPPORTED", supportingEvidenceIds: ["chunk"], deterministicContradiction: false }],
    unsupportedClaims: [], unknownClaims: [], supportingEvidenceIds: ["chunk"], releasedAnswerText: "released",
    releasedClaimCount: 1, retryCount: 0, complete: true, reasonCode: "SEMANTIC_VERIFIED",
    coverage: { claimCount: 1, maxClaims: 20, maxClaimLength: 500, observedMaxClaimLength: 5, overflowType: null },
  } as CitationSemanticVerificationResult;
  const artifact = createCitationSemanticEvaluationArtifact(authoritative);
  assert.notEqual(artifact.claimResults, authoritative.claimResults);
  assert.throws(() => { (artifact.claimResults[0] as { state: string }).state = "UNSUPPORTED"; });
  assert.throws(() => { (artifact as { releasedAnswerText?: string }).releasedAnswerText = "changed"; });
  assert.equal(authoritative.claimResults[0]!.state, "SUPPORTED");
  assert.equal(authoritative.releasedAnswerText, "released");
  assert.doesNotThrow(() => notifyCitationSemanticEvaluationObserver(() => {
    throw new Error("observer failure");
  }, authoritative));
  assert.equal(authoritative.claimResults[0]!.state, "SUPPORTED");
});

test("default regression policy gates correctness availability and rate", () => {
  assert.equal(DEFAULT_RAG_REGRESSION_POLICY.availability.requireCorrectnessAvailabilityPreserved, true);
  assert.equal(DEFAULT_RAG_REGRESSION_POLICY.availability.minimumCorrectnessEvaluatedCoverage, 1);
  assert.equal(DEFAULT_RAG_REGRESSION_POLICY.allowedRegressions.correctAnswerRate, 0);
  assert.equal(DEFAULT_RAG_REGRESSION_POLICY.allowedRegressions.correctnessEvaluatedCoverage, 0);
});
