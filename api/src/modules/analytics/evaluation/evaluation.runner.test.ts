import assert from "node:assert/strict";
import test from "node:test";
import { FakeModelAdapter } from "../../../providers/llm/fakeAdapters.js";
import { IntentQueryService } from "../../intent-query/intentQuery.service.js";
import { Permission } from "../../permissions/permissions.catalog.js";
import type { PermissionEvaluator, ResolvedPermissions } from "../../permissions/permissions.types.js";
import type { RetrievalCandidate } from "../../retrieval/retrieval.types.js";
import type { EvidenceBundle } from "../../reranker/reranker.types.js";
import type { JudgeOutcome } from "../llmJudge.types.js";
import { AnswerRelevanceEvaluator } from "./answerRelevance.evaluator.js";
import { migrateEvaluationCaseV1 } from "./evaluation.datasetV2.js";
import { createRagEvaluationReport } from "./evaluation.report.js";
import { RagEvaluationRunner } from "./evaluation.runner.js";
import {
  RAG_EVALUATION_CASE_SCHEMA_VERSION,
  RagEvaluationDatasetV2Schema,
  type RagEvaluationCaseV2,
  type RagEvaluationDatasetV2,
} from "./evaluation.schemas.js";
import {
  IsolatedProductionRagWorkflow,
  type EvaluationFailureKind,
  type RagEvaluationExecutionContext,
  type RagEvaluationWorkflow,
  type RagWorkflowExecution,
} from "./evaluation.workflow.js";
import type { ChatWorkflowExecutionArtifacts } from "../../chat/chatWorkflowService.js";
import type { CitationSemanticVerificationResult } from "../../agents/citationSemanticVerification.service.js";
import type { HybridRetrievalArtifacts } from "../../retrieval/retrieval.service.js";

const TENANT_ID = "64b000000000000000000001";
const ACTOR_ID = "64b000000000000000000002";
const DOCUMENT_ID = "64b000000000000000000003";
const CHUNK_ID = "64b000000000000000000004";
const VERSION_ID = "64b000000000000000000005";

function evaluationCase(
  overrides: Partial<RagEvaluationCaseV2> = {},
): RagEvaluationCaseV2 {
  return {
    schemaVersion: RAG_EVALUATION_CASE_SCHEMA_VERSION,
    id: "grounded-release",
    description: "Grounded release evaluation",
    language: "en",
    question: "What is the remote work policy?",
    expectedRoute: "rag",
    expectedIntent: "knowledge_question",
    expectedOutcome: "release",
    retrieval: {
      expectedDocumentIds: [DOCUMENT_ID],
      expectedRelevantDocumentIds: [DOCUMENT_ID],
      expectedRelevantChunkIds: [CHUNK_ID],
      knownIrrelevantDocumentIds: [],
    },
    grounding: {
      expectedFacts: ["Compliance-approved final answer."],
      expectedClaims: [],
      forbiddenFacts: [],
    },
    citations: {
      expectedSourceDocumentIds: [DOCUMENT_ID],
      sourceRequired: true,
      sourceForbidden: false,
    },
    evaluationModes: ["retrieval", "end_to_end"],
    tags: ["smoke"],
    ...overrides,
  };
}

function dataset(cases: RagEvaluationCaseV2[]): RagEvaluationDatasetV2 {
  return RagEvaluationDatasetV2Schema.parse({
    schemaVersion: RAG_EVALUATION_CASE_SCHEMA_VERSION,
    datasetVersion: "phase-2-tests",
    description: "Phase 2 runner tests",
    cases,
  });
}

function semantic(): CitationSemanticVerificationResult {
  return {
    claims: ["The policy allows remote work."],
    preparedClaims: [{
      claimIndex: 0,
      answerClaimIndex: 0,
      text: "The policy allows remote work.",
      originalText: "The policy allows remote work.",
    }],
    claimResults: [{
      claimIndex: 0,
      answerClaimIndex: 0,
      text: "The policy allows remote work.",
      state: "SUPPORTED",
      supportingEvidenceIds: [CHUNK_ID],
      deterministicContradiction: false,
    }],
    unsupportedClaims: [],
    unknownClaims: [],
    supportingEvidenceIds: [CHUNK_ID],
    releasedAnswerText: "Compliance-approved final answer.",
    releasedClaimCount: 1,
    retryCount: 0,
    complete: true,
    reasonCode: "SEMANTIC_VERIFIED",
    coverage: {
      claimCount: 1,
      maxClaims: 20,
      maxClaimLength: 500,
      observedMaxClaimLength: 35,
      overflowType: null,
    },
    providerKey: "test-provider",
    modelName: "test-model",
    totalTokens: 20,
    estimatedCost: 0.01,
    latencyMs: 10,
  };
}

function artifacts(
  overrides: Partial<ChatWorkflowExecutionArtifacts> = {},
): ChatWorkflowExecutionArtifacts {
  return {
    intent: {
      route: "rag",
      intent: "knowledge_question",
      reasonCode: "KNOWLEDGE_QUERY",
    },
    compliance: {
      action: "release",
      reasonCode: "COMPLIANT_GROUNDED_RESPONSE",
    },
    retrievalCandidates: [{
      rank: 1,
      chunkId: CHUNK_ID,
      documentId: DOCUMENT_ID,
      score: 0.9,
      retrievalMethod: "hybrid",
    }],
    evidenceSelectedCandidates: [{
      rank: 1,
      chunkId: CHUNK_ID,
      documentId: DOCUMENT_ID,
      score: 0.9,
      retrievalMethod: "hybrid",
    }],
    evidenceSufficiency: "SUFFICIENT",
    approvedEvidenceIds: [CHUNK_ID],
    rejectedEvidenceIds: [],
    evidenceReasonCode: "EVIDENCE_SUFFICIENT",
    finalSourceChunkIds: [CHUNK_ID],
    finalSourceDocumentIds: [DOCUMENT_ID],
    finalSourceAuthorizationPassed: true,
    runtime: { totalTokensUsed: 100, estimatedCost: 0.02, latencyMs: 50 },
    ...overrides,
  };
}

function retrievalArtifacts(): HybridRetrievalArtifacts {
  return {
    rawVectorCandidates: [{ rank: 1, chunkId: CHUNK_ID, score: 0.8 }],
    rawKeywordCandidates: [{ rank: 1, chunkId: CHUNK_ID, score: 0.7 }],
    postAuthorizationVectorCandidates: [{ rank: 1, chunkId: CHUNK_ID, score: 0.8 }],
    postAuthorizationKeywordCandidates: [{ rank: 1, chunkId: CHUNK_ID, score: 0.7 }],
    fusedCandidateIds: [CHUNK_ID],
    hydratedCandidateIds: [CHUNK_ID],
  };
}

function execution(
  overrides: Partial<RagWorkflowExecution> = {},
): RagWorkflowExecution {
  return {
    status: "completed",
    artifacts: artifacts(),
    semanticVerification: semantic(),
    retrievalArtifacts: retrievalArtifacts(),
    finalAnswer: "Compliance-approved final answer.",
    judgeEvidence: [{
      chunkId: CHUNK_ID,
      documentId: DOCUMENT_ID,
      documentTitle: "Remote Work Policy",
      text: "SECRET_RAW_DOCUMENT_TEXT",
    }],
    authorizationByChunkId: new Map([[CHUNK_ID, true]]),
    provider: "test-provider",
    model: "test-model",
    errorCode: null,
    failureKind: null,
    ...overrides,
  };
}

class StubWorkflow implements RagEvaluationWorkflow {
  readonly calls: Array<{
    evaluationCase: RagEvaluationCaseV2;
    context: RagEvaluationExecutionContext;
  }> = [];

  constructor(
    private readonly resolve: (entry: RagEvaluationCaseV2) => RagWorkflowExecution,
  ) {}

  execute(
    evaluationCase: RagEvaluationCaseV2,
    context: RagEvaluationExecutionContext,
  ): Promise<RagWorkflowExecution> {
    this.calls.push({ evaluationCase, context });
    return Promise.resolve(this.resolve(evaluationCase));
  }

  isolationSnapshot() {
    return {
      conversations: 0,
      messages: 0,
      supervisorRuns: 0,
      supervisorSteps: 0,
      supervisorToolCalls: 0,
      supervisorApprovals: 0,
      durableAgentRuns: 0,
    };
  }
}

function completedJudge(relevancy = 0.95): JudgeOutcome {
  return {
    status: "completed",
    scores: { faithfulness: 0.95, relevancy, coherence: 0.9, overall: 0.94 },
    provider: "judge-provider",
    model: "judge-model",
    errorCode: null,
  };
}

function runner(
  workflow: RagEvaluationWorkflow,
  judge: (answer: string) => JudgeOutcome = () => completedJudge(),
  filters: { caseIds?: string[]; tags?: string[] } = {},
): RagEvaluationRunner {
  return new RagEvaluationRunner({
    workflow,
    answerRelevanceEvaluator: new AnswerRelevanceEvaluator({
      evaluate: async (input) => judge(input.answer),
    }),
    ...filters,
    resolveExecutionContext: async () => ({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      actorEmail: "evaluation@example.test",
      baseRole: "EMPLOYEE",
    }),
  });
}

test("1. grounded release case through controlled production workflow contract", async () => {
  const result = (await runner(new StubWorkflow(() => execution())).run(
    dataset([evaluationCase()]),
  )).results[0]!;
  assert.equal(result.actualRoute, "rag");
  assert.equal(result.actualAction, "release");
  assert.equal(result.casePassed, true);
});

test("2. final answer is the Compliance-approved answer", async () => {
  const result = (await runner(new StubWorkflow(() => execution())).run(
    dataset([evaluationCase()]),
  )).results[0]!;
  assert.equal(result.finalAnswer, "Compliance-approved final answer.");
  assert.notEqual(result.finalAnswer, result.workflowArtifacts && "Writer draft that must not be judged.");
});

test("3. ContextRelevanceEvaluator receives actual ranked retrieval", async () => {
  const result = (await runner(new StubWorkflow(() => execution())).run(
    dataset([evaluationCase()]),
  )).results[0]!;
  assert.deepEqual(result.contextRelevance.chunk.retrievedIds, [CHUNK_ID]);
  assert.equal(result.contextRelevance.chunk.reciprocalRank, 1);
});

test("4. GroundednessEvaluator receives actual workflow semantic result", async () => {
  const result = (await runner(new StubWorkflow(() => execution())).run(
    dataset([evaluationCase()]),
  )).results[0]!;
  assert.equal(result.groundedness.supportedClaimCount, 1);
  assert.equal(result.groundedness.verifierRetryCount, 0);
});

test("5. AnswerRelevanceEvaluator receives final answer, not writer draft", async () => {
  let judged = "";
  await runner(new StubWorkflow(() => execution()), (answer) => {
    judged = answer;
    return completedJudge();
  }).run(dataset([evaluationCase()]));
  assert.equal(judged, "Compliance-approved final answer.");
});

test("6. refusal case", async () => {
  const entry = evaluationCase({
    id: "refusal",
    expectedOutcome: "refuse",
    citations: { expectedSourceDocumentIds: [], sourceRequired: false, sourceForbidden: true },
    retrieval: {
      expectedDocumentIds: [], expectedRelevantDocumentIds: [],
      expectedRelevantChunkIds: [], knownIrrelevantDocumentIds: [],
    },
  });
  const refusalArtifacts = artifacts({
    compliance: { action: "refuse", reasonCode: "INSUFFICIENT_EVIDENCE" },
    retrievalCandidates: [], evidenceSelectedCandidates: [], approvedEvidenceIds: [], finalSourceChunkIds: [],
    finalSourceDocumentIds: [], evidenceSufficiency: "NO_EVIDENCE",
  });
  const result = (await runner(new StubWorkflow(() => execution({
    artifacts: refusalArtifacts, semanticVerification: null,
    finalAnswer: "Insufficient evidence.", judgeEvidence: [], authorizationByChunkId: new Map(),
  }))).run(dataset([entry]))).results[0]!;
  assert.equal(result.answerRelevance.classification, "correct_refusal");
  assert.equal(result.outcomeCorrect, true);
});

test("7. clarification case", async () => {
  const entry = evaluationCase({
    id: "clarify", expectedRoute: "clarification", expectedOutcome: "clarify",
    citations: { expectedSourceDocumentIds: [], sourceRequired: false, sourceForbidden: true },
    retrieval: { expectedDocumentIds: [], expectedRelevantDocumentIds: [], expectedRelevantChunkIds: [], knownIrrelevantDocumentIds: [] },
  });
  const clarifyArtifacts = artifacts({
    intent: { ...artifacts().intent!, route: "clarification" },
    compliance: { action: "clarify", reasonCode: "CLARIFICATION_REQUIRED" },
    retrievalCandidates: [], evidenceSelectedCandidates: [], approvedEvidenceIds: [], finalSourceChunkIds: [], finalSourceDocumentIds: [],
  });
  const result = (await runner(new StubWorkflow(() => execution({
    artifacts: clarifyArtifacts, semanticVerification: null, finalAnswer: "Which policy?",
    judgeEvidence: [], authorizationByChunkId: new Map(),
  }))).run(dataset([entry]))).results[0]!;
  assert.equal(result.answerRelevance.classification, "correct_clarification");
});

test("8. authorization removes forbidden evidence before ranked evaluation context", async () => {
  const forbidden = "64b000000000000000000099";
  const result = (await runner(new StubWorkflow(() => execution({
    retrievalArtifacts: {
      ...retrievalArtifacts(),
      rawVectorCandidates: [
        { rank: 1, chunkId: forbidden, score: 0.99 },
        { rank: 2, chunkId: CHUNK_ID, score: 0.8 },
      ],
    },
  }))).run(dataset([evaluationCase()]))).results[0]!;
  assert.deepEqual(result.retrievedChunkIds, [CHUNK_ID]);
  assert.equal(JSON.stringify(result.workflowArtifacts).includes(forbidden), false);
});

test("9. unauthorized result causes invariant failure if one leaks", async () => {
  const result = (await runner(new StubWorkflow(() => execution({
    authorizationByChunkId: new Map([[CHUNK_ID, false]]),
  }))).run(dataset([evaluationCase()]))).results[0]!;
  assert.equal(result.authorizationInvariantPassed, false);
  assert.equal(result.authorizationViolations.length, 1);
  assert.equal(result.casePassed, false);
});

test("10. final source authorization is enforced", async () => {
  const result = (await runner(new StubWorkflow(() => execution({
    status: "failed",
    artifacts: artifacts({ finalSourceAuthorizationPassed: false }),
    finalAnswer: "",
    errorCode: "CHAT_WORKFLOW_AUTHORITY_INVALID",
    failureKind: "authorization_invariant",
  }))).run(dataset([evaluationCase()]))).results[0]!;
  assert.equal(result.workflowArtifacts?.finalSourceAuthorizationPassed, false);
  assert.equal(result.authorizationInvariantPassed, false);
});

test("11. evaluation workflow exposes no production conversation persistence", () => {
  const snapshot = new StubWorkflow(() => execution()).isolationSnapshot!();
  assert.equal(snapshot.conversations, 0);
});

test("12. evaluation workflow exposes no production message persistence", () => {
  const snapshot = new StubWorkflow(() => execution()).isolationSnapshot!();
  assert.equal(snapshot.messages, 0);
});

test("13. evaluation workflow exposes no durable production AgentRun persistence", () => {
  const snapshot = new StubWorkflow(() => execution()).isolationSnapshot!();
  assert.equal(snapshot.durableAgentRuns, 0);
});

test("14. evaluation report generated", async () => {
  const results = (await runner(new StubWorkflow(() => execution())).run(dataset([evaluationCase()]))).results;
  const report = createRagEvaluationReport({
    datasetVersion: "phase-2-tests",
    configuration: { name: "phase-2", metadata: { workflow: "chat-rag-v1" } },
    results,
  });
  assert.equal(report.results.length, 1);
  assert.equal(report.configuration.metadata?.workflow, "chat-rag-v1");
});

test("15. V1 migrated case runs with unavailable grounding marked unevaluated", async () => {
  const migrated = migrateEvaluationCaseV1({
    id: "v1", question: "Question?", evidenceText: "Evidence",
    evidenceChunks: [{ chunkId: CHUNK_ID, documentId: DOCUMENT_ID, documentTitle: "Policy", text: "Evidence" }],
    expectedTopics: ["policy"], expectedDocuments: ["Policy"], groundTruthAnswer: "Answer",
  });
  const result = (await runner(new StubWorkflow(() => execution({ semanticVerification: null }))).run(dataset([migrated]))).results[0]!;
  assert.equal(result.groundedness.evaluated, false);
});

test("16. Arabic case passes language through execution context", async () => {
  const workflow = new StubWorkflow(() => execution());
  await runner(workflow).run(dataset([evaluationCase({ id: "ar", language: "ar", question: "ما هي السياسة؟" })]));
  assert.equal(workflow.calls[0]?.context.language, "ar");
});

test("17. mixed-language case passes language through execution context", async () => {
  const workflow = new StubWorkflow(() => execution());
  await runner(workflow).run(dataset([evaluationCase({ id: "mixed", language: "mixed", question: "ما هي leave policy؟" })]));
  assert.equal(workflow.calls[0]?.context.language, "mixed");
});

test("18. unsupported permission scenario is rejected instead of silently executed", async () => {
  const workflow = new StubWorkflow(() => execution());
  const entry = evaluationCase({
    id: "permission",
    authorization: {
      tenantScenario: "tenant-a",
      actor: { baseRole: "EMPLOYEE" },
      permissionScenario: "self-only",
    },
  });
  await assert.rejects(
    () => runner(workflow).run(dataset([entry])),
    /permission scenario is unsupported/,
  );
  assert.equal(workflow.calls.length, 0);
});

test("19. case filter", async () => {
  const output = await runner(
    new StubWorkflow(() => execution()),
    undefined,
    { caseIds: ["b"] },
  ).run(dataset([evaluationCase({ id: "a" }), evaluationCase({ id: "b" })]));
  assert.deepEqual(output.selectedCaseIds, ["b"]);
});

test("20. deterministic aggregate ordering", async () => {
  const output = await runner(new StubWorkflow(() => execution())).run(
    dataset([evaluationCase({ id: "z" }), evaluationCase({ id: "a" })]),
  );
  assert.deepEqual(output.selectedCaseIds, ["a", "z"]);
  assert.deepEqual(output.results.map((result) => result.evaluationCaseId), ["a", "z"]);
});

test("21. provider failure produces controlled case failure without corrupting report", async () => {
  const failed = execution({ status: "failed", artifacts: null, semanticVerification: null,
    finalAnswer: "", judgeEvidence: [], authorizationByChunkId: new Map(),
    errorCode: "LLM_PROVIDER_UNAVAILABLE", failureKind: "provider_unavailable" });
  const results = (await runner(new StubWorkflow(() => failed)).run(dataset([evaluationCase()]))).results;
  const report = createRagEvaluationReport({ datasetVersion: "phase-2-tests", configuration: {}, results });
  assert.equal(report.results[0]?.execution.status, "failed");
  assert.equal(report.results[0]?.casePassed, false);
});

test("22. rate limit, unavailable, and timeout are represented distinctly", async () => {
  const kinds: EvaluationFailureKind[] = ["rate_limited", "provider_unavailable", "timeout"];
  for (const kind of kinds) {
    const result = (await runner(new StubWorkflow(() => execution({
      status: "failed", artifacts: null, semanticVerification: null, finalAnswer: "",
      judgeEvidence: [], authorizationByChunkId: new Map(), errorCode: null, failureKind: kind,
    }))).run(dataset([evaluationCase({ id: kind })]))).results[0]!;
    assert.equal(result.execution.failureKind, kind);
    assert.notEqual(result.execution.errorCode, undefined);
  }
});

test("23. report schema validation", async () => {
  const results = (await runner(new StubWorkflow(() => execution())).run(dataset([evaluationCase()]))).results;
  assert.doesNotThrow(() => createRagEvaluationReport({
    datasetVersion: "phase-2-tests", generatedAt: new Date("2026-08-11T00:00:00Z"),
    configuration: { retrieval: { metricCutoffK: 5, workflowTopK: { directQuestion: 5, summarization: 12 } } }, results,
  }));
});

test("24. report excludes raw document content and secrets", async () => {
  const results = (await runner(new StubWorkflow(() => execution())).run(dataset([evaluationCase()]))).results;
  const serialized = JSON.stringify(createRagEvaluationReport({
    datasetVersion: "phase-2-tests", configuration: {}, results,
  }));
  assert.equal(serialized.includes("SECRET_RAW_DOCUMENT_TEXT"), false);
});

test("retrieval-only case does not require end-to-end outcome or answer metrics", async () => {
  const entry = evaluationCase({
    id: "retrieval-only",
    evaluationModes: ["retrieval"],
  });
  const result = (await runner(new StubWorkflow(() => execution({
    artifacts: artifacts({
      compliance: {
        action: "refuse",
        reasonCode: "INSUFFICIENT_EVIDENCE",
      },
    }),
    semanticVerification: null,
    finalAnswer: "Insufficient evidence.",
  }))).run(dataset([entry]))).results[0]!;
  assert.equal(result.outcomeCorrect, false);
  assert.equal(result.answerRelevance.evaluated, false);
  assert.equal(result.casePassed, true);
});

test("tag filter uses stable case ordering", async () => {
  const output = await runner(
    new StubWorkflow(() => execution()),
    undefined,
    { tags: ["selected"] },
  ).run(dataset([
    evaluationCase({ id: "z", tags: ["selected"] }),
    evaluationCase({ id: "a", tags: ["selected"] }),
    evaluationCase({ id: "skip", tags: ["other"] }),
  ]));
  assert.deepEqual(output.selectedCaseIds, ["a", "z"]);
});

function semanticRequest(params: Parameters<FakeModelAdapter["complete"]>[0]): {
  claims: unknown[];
  authorizedEvidence: Array<{ chunkId: string }>;
} | null {
  const content = params.messages.at(-1)?.content ?? "";
  const start = content.indexOf("SEMANTIC_VERIFICATION_DATA_START\n");
  const end = content.lastIndexOf("\nSEMANTIC_VERIFICATION_DATA_END");
  if (start < 0 || end < 0) return null;
  return JSON.parse(content.slice(start + "SEMANTIC_VERIFICATION_DATA_START\n".length, end));
}

class SemanticWorkflowModel extends FakeModelAdapter {
  override async complete(params: Parameters<FakeModelAdapter["complete"]>[0]) {
    const base = await super.complete(params);
    const request = semanticRequest(params);
    if (!request) return base;
    const supportingEvidenceIds = request.authorizedEvidence.map((item) => item.chunkId);
    return {
      ...base,
      choices: base.choices.map((choice, index) => index === 0 ? {
        ...choice,
        message: { ...choice.message, content: JSON.stringify({
          judgments: request.claims.map((_claim, claimIndex) => ({
            claimIndex, verdict: "supported", supportingEvidenceIds,
          })),
        }) },
      } : choice),
    };
  }
}

function sufficientBundle(candidate: RetrievalCandidate): EvidenceBundle {
  return {
    items: [{
      rank: 1, candidate,
      scoreBreakdown: { fusionScore: 0.9, rerankScore: 0.9, semanticScore: 0.9, exactTermScore: 1, sourceAuthorityScore: 1, versionPreferenceScore: 1, totalScore: 0.9 },
      citationAnchor: { chunkId: CHUNK_ID, documentId: DOCUMENT_ID, documentVersionId: VERSION_ID },
      textExcerpt: candidate.text,
    }],
    totalTokenCount: 20, maxTokenCount: 1000, inputCandidateCount: 1,
    conflictGroups: [], sufficiency: { level: "SUFFICIENT", reasons: [] },
    scoreExplanation: "deterministic test", accessPolicyVersion: "1", createdAt: new Date(0).toISOString(),
  };
}

test("isolated adapter executes the actual production agent/tool composition in memory", async () => {
  const model = new SemanticWorkflowModel();
  const candidate: RetrievalCandidate = {
    chunkId: CHUNK_ID, documentId: DOCUMENT_ID, documentVersionId: VERSION_ID,
    tenantId: TENANT_ID, text: "The remote work policy allows remote work.",
    score: 0.9, retrievalMethod: "hybrid",
  };
  const permissions: ResolvedPermissions = {
    permissions: new Set([Permission.CHAT_CREATE, Permission.DOCUMENTS_USE_IN_AI]),
    grants: new Map(), baseRole: "EMPLOYEE", customRoleId: null,
    roleVersion: null, customRoleState: "none",
  };
  const permissionEvaluator: PermissionEvaluator = {
    resolve: async () => permissions,
    evaluate: async () => ({ allowed: true, permission: Permission.CHAT_CREATE, source: "base-role", scope: null, denialCode: null, reason: null, roleId: null, roleVersion: null }),
    evict: () => undefined, evictAllForTenant: () => undefined,
  };
  const authorization = {
    resolveActor: async () => ({ tenantId: TENANT_ID, actorId: ACTOR_ID, baseRole: "EMPLOYEE" as const, customRoleId: null, departmentIds: [] }),
    authorizeDocumentAction: async () => undefined,
  };
  const workflow = new IsolatedProductionRagWorkflow({
    production: {
      model,
      intentQueryService: {
        analyzeQuery: async () => ({
          schemaVersion: "1.1.0" as const,
          normalizedQuestion: "What is the remote work policy?",
          originalQuestion: "What is the remote work policy?",
          language: "en" as const,
          detectedIntent: "knowledge_question" as const,
          intentConfidence: 0.99,
          route: "rag" as const,
          assistantKind: null,
          socialSubtype: "acknowledgement" as const,
          entities: [], temporalConstraints: [], referencedDocumentIds: [],
          referencedDocumentTitles: [], departments: [], categories: [], exactTerms: [],
          semanticQueries: [{ text: "remote work policy", language: "en" as const, weight: 1 }],
          keywordQueries: [], clarificationNeeded: false, clarification: null,
          isFollowUp: false, conversationContextUsed: false,
          promptVersion: "test", modelVersion: "test",
          processingMetadata: { tokensUsed: 1, latencyMs: 1, estimatedCost: 0, fallbackUsed: false },
        }),
      } as unknown as IntentQueryService,
      authorizedRetrieval: {
        retrieval: {
          hybridSearch: async () => ({ candidates: [candidate], totalCandidates: 1,
            filterSummary: { tenantFilter: true, roleFilter: "EMPLOYEE", permissionScopes: [], explicitFilters: [], versionFilter: false },
            diagnostics: { totalLatencyMs: 1, vectorCandidateCount: 1, keywordCandidateCount: 1, traceId: "test" } }),
          vectorSearch: async () => { throw new Error("not used"); },
          keywordSearch: async () => { throw new Error("not used"); },
        },
        reranker: { buildEvidenceBundle: async () => sufficientBundle(candidate) },
        authorization: authorization as never,
        resolveDocumentHints: async () => ({
          referencedDocumentIds: [],
          referencedDocumentTitles: [],
          ambiguousTitleMatches: false,
          unresolvedTitleHints: [],
        }),
        loadChunksByIds: async () => [{ ...candidate, status: "ACTIVE" }],
        loadEligibleDocumentIds: async () => [DOCUMENT_ID],
      },
    },
    authorize: async (context) => ({ ...context, actorKind: "USER" as const }),
    permissionEvaluator,
    loadPersistedActor: async () => ({ tenantId: TENANT_ID, actorId: ACTOR_ID, baseRole: "EMPLOYEE", customRoleId: null, status: "active" }),
    loadSettings: async () => ({ citationsEnabled: true, maxTokens: 1024 }),
    loadDocumentTitles: async () => new Map([[DOCUMENT_ID, "Remote Work Policy"]]),
    runMetadata: { modelProvider: "fake", modelName: "fake-chat" },
    onEvaluationArtifacts: () => { throw new Error("observer failure"); },
  });
  const result = (await runner(workflow).run(dataset([evaluationCase({
    grounding: { expectedFacts: [], expectedClaims: [], forbiddenFacts: [] },
  })]))).results[0]!;
  assert.equal(
    result.execution.status,
    "completed",
    JSON.stringify({
      execution: result.execution,
      reasonCode: result.reasonCode,
      runs: [...(workflow as unknown as {
        persistence: { runs: Map<string, unknown> };
      }).persistence.runs.values()],
    }),
  );
  assert.equal(result.actualAction, "release");
  assert.equal(result.groundedness.fullyGrounded, true);
  const isolation = workflow.isolationSnapshot();
  assert.equal(isolation.durableAgentRuns, 0);
  assert.equal(isolation.conversations, 1);
  assert.equal(isolation.messages, 2);
  assert.ok(isolation.supervisorRuns > 0);
});
