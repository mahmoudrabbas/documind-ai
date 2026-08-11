import { z } from "zod";
import { BASE_ROLES } from "../../../common/auth/baseRoles.js";
import {
  IntentClass,
  QueryLanguage,
  QueryRoute,
} from "../../intent-query/intentQuery.types.js";
import { ChatComplianceDecision } from "../../agents/chatWorkflowContracts.js";

export const RAG_EVALUATION_CASE_SCHEMA_VERSION = "2.0.0" as const;
export const RAG_EVALUATION_RESULT_SCHEMA_VERSION = "1.1.0" as const;
export const RAG_EVALUATION_REPORT_VERSION = "1.1.0" as const;

const EvaluationId = z.string().trim().min(1).max(200);
const EvaluationText = z.string().trim().min(1).max(20_000);
const EvaluationIdList = z.array(EvaluationId).max(500).default([]);
const RuntimeComponentIdentitySchema = z.object({
  provider: EvaluationId,
  model: EvaluationId.optional(),
  modelRevision: EvaluationId.nullable().optional(),
  modelRevisionStatus: z.enum(["provided", "unavailable"]).optional(),
  promptVersion: EvaluationId.optional(),
  componentVersion: EvaluationId,
  chain: z.array(z.object({
    provider: EvaluationId,
    model: EvaluationId,
    modelRevision: EvaluationId.nullable().optional(),
    modelRevisionStatus: z.enum(["provided", "unavailable"]).optional(),
    componentVersion: EvaluationId,
  }).strict()).min(1).optional(),
}).strict().superRefine((value, context) => {
  if (!value.model && !value.chain) context.addIssue({ code: "custom", message: "Runtime identity requires model or ordered chain" });
  if (value.modelRevisionStatus === "provided" && !value.modelRevision) context.addIssue({ code: "custom", message: "Provided model revision is required" });
  if (value.modelRevisionStatus === "unavailable" && value.modelRevision) context.addIssue({ code: "custom", message: "Unavailable model revision cannot have a value" });
  if (value.model && value.modelRevision === undefined && value.modelRevisionStatus !== "unavailable") context.addIssue({ code: "custom", message: "Model revision must be provided or explicitly unavailable" });
  value.chain?.forEach((entry, index) => {
    if (entry.modelRevisionStatus === "provided" && !entry.modelRevision) context.addIssue({ code: "custom", path: ["chain", index], message: "Provided model revision is required" });
    if (entry.modelRevisionStatus === "unavailable" && entry.modelRevision) context.addIssue({ code: "custom", path: ["chain", index], message: "Unavailable model revision cannot have a value" });
    if (entry.modelRevision === undefined && entry.modelRevisionStatus !== "unavailable") context.addIssue({ code: "custom", path: ["chain", index], message: "Model revision must be provided or explicitly unavailable" });
  });
});

export const RagExpectedOutcomeSchema = z.enum([
  "release",
  "refuse",
  "clarify",
  "source_less_assistant",
  "source_less_social",
]);
export type RagExpectedOutcome = z.infer<typeof RagExpectedOutcomeSchema>;
export const RagActualOutcomeSchema = z.union([
  RagExpectedOutcomeSchema,
  z.literal("error"),
]);
export type RagActualOutcome = z.infer<typeof RagActualOutcomeSchema>;

export const RagPermissionScopesSchema = z
  .object({
    selfOnly: z.boolean().default(false),
    departmentIds: EvaluationIdList,
    documentCategories: EvaluationIdList,
    documentClassifications: EvaluationIdList,
  })
  .strict();

export const RagAuthorizationContextSchema = z
  .object({
    tenantScenario: EvaluationId,
    actor: z
      .object({
        actorId: EvaluationId.optional(),
        baseRole: z.enum(BASE_ROLES),
        customRoleId: EvaluationId.nullable().optional(),
        scopes: RagPermissionScopesSchema.optional(),
      })
      .strict(),
    permissionScenario: EvaluationId,
  })
  .strict();

export const RagRetrievalExpectationsSchema = z
  .object({
    expectedDocumentIds: EvaluationIdList,
    expectedRelevantDocumentIds: EvaluationIdList,
    expectedRelevantChunkIds: EvaluationIdList,
    knownIrrelevantDocumentIds: EvaluationIdList,
  })
  .strict();

export const RagGroundingExpectationsSchema = z
  .object({
    expectedFacts: z.array(EvaluationText).max(100).default([]),
    expectedClaims: z.array(EvaluationText).max(100).default([]),
    forbiddenFacts: z.array(EvaluationText).max(100).default([]),
    documentAbsence: z.array(z.object({
      proposition: EvaluationText,
      exhaustiveDocumentCoverage: z.boolean().default(false),
      explicitNegativeEvidence: z.array(EvaluationText).max(50).default([]),
    }).strict()).max(50).optional(),
  })
  .strict();

export const RagCitationExpectationsSchema = z
  .object({
    expectedSourceDocumentIds: EvaluationIdList,
    sourceRequired: z.boolean(),
    sourceForbidden: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.sourceRequired && value.sourceForbidden) {
      context.addIssue({
        code: "custom",
        message: "A source cannot be both required and forbidden",
      });
    }
  });

export const RagEvaluationCaseV2Schema = z
  .object({
    schemaVersion: z.literal(RAG_EVALUATION_CASE_SCHEMA_VERSION),
    id: EvaluationId,
    description: z.string().trim().min(1).max(2_000),
    language: QueryLanguage,
    question: z.string().trim().min(1).max(2_000),
    expectedRoute: QueryRoute.optional(),
    expectedIntent: IntentClass.optional(),
    expectedOutcome: RagExpectedOutcomeSchema,
    authorization: RagAuthorizationContextSchema.optional(),
    retrieval: RagRetrievalExpectationsSchema,
    grounding: RagGroundingExpectationsSchema,
    citations: RagCitationExpectationsSchema,
    evaluationModes: z
      .array(z.enum(["retrieval", "end_to_end"]))
      .min(1)
      .max(2)
      .transform((values) => [...new Set(values)]),
    tags: z.array(EvaluationId).max(50).default([]),
    difficulty: z.enum(["easy", "medium", "hard"]).optional(),
    domain: EvaluationId.optional(),
    notes: z.string().trim().max(4_000).optional(),
  })
  .strict();
export type RagEvaluationCaseV2 = z.infer<typeof RagEvaluationCaseV2Schema>;

export const RagEvaluationDatasetV2Schema = z
  .object({
    schemaVersion: z.literal(RAG_EVALUATION_CASE_SCHEMA_VERSION),
    datasetVersion: EvaluationId,
    description: z.string().trim().min(1).max(4_000),
    cases: z.array(RagEvaluationCaseV2Schema).min(1),
  })
  .strict()
  .superRefine((dataset, context) => {
    const seen = new Set<string>();
    dataset.cases.forEach((evaluationCase, index) => {
      if (seen.has(evaluationCase.id)) {
        context.addIssue({
          code: "custom",
          path: ["cases", index, "id"],
          message: `Duplicate evaluation case id: ${evaluationCase.id}`,
        });
      }
      seen.add(evaluationCase.id);
    });
  });
export type RagEvaluationDatasetV2 = z.infer<typeof RagEvaluationDatasetV2Schema>;

export const RetrievalLevelMetricsSchema = z
  .object({
    evaluated: z.boolean(),
    k: z.number().int().nonnegative(),
    retrievedIds: EvaluationIdList,
    relevantIds: EvaluationIdList,
    hits: EvaluationIdList,
    falsePositives: EvaluationIdList,
    misses: EvaluationIdList,
    precision: z.number().min(0).max(1).nullable(),
    recall: z.number().min(0).max(1).nullable(),
    reciprocalRank: z.number().min(0).max(1).nullable(),
    hit: z.boolean().nullable(),
  })
  .strict();
export type RetrievalLevelMetrics = z.infer<typeof RetrievalLevelMetricsSchema>;

export const AuthorizationViolationSchema = z
  .object({
    rank: z.number().int().positive(),
    documentId: EvaluationId,
    chunkId: EvaluationId.optional(),
    reasonCode: EvaluationId,
  })
  .strict();
export type AuthorizationViolation = z.infer<typeof AuthorizationViolationSchema>;

export const ContextRelevanceResultSchema = z
  .object({
    document: RetrievalLevelMetricsSchema,
    chunk: RetrievalLevelMetricsSchema,
    authorizationInvariantPassed: z.boolean(),
    authorizationViolations: z.array(AuthorizationViolationSchema),
  })
  .strict();
export type ContextRelevanceResult = z.infer<typeof ContextRelevanceResultSchema>;

export const GroundednessEvaluationResultSchema = z
  .object({
    evaluated: z.boolean(),
    factualClaimCount: z.number().int().nonnegative(),
    supportedClaimCount: z.number().int().nonnegative(),
    unsupportedClaimCount: z.number().int().nonnegative(),
    unknownClaimCount: z.number().int().nonnegative(),
    claimSupportRate: z.number().min(0).max(1).nullable(),
    fullyGrounded: z.boolean(),
    supportingEvidenceIds: EvaluationIdList,
    finalVerifiedAnswer: z.string().max(20_000).optional(),
    faithfulnessScore: z.number().min(0).max(1).nullable(),
    semanticReasonCode: EvaluationId.optional(),
    verifierComplete: z.boolean().optional(),
    verifierRetryCount: z.number().int().nonnegative().optional(),
    documentAbsenceClaimCount: z.number().int().nonnegative().default(0),
    safelySupportedDocumentAbsenceClaimCount: z.number().int().nonnegative().default(0),
  })
  .strict();
export type GroundednessEvaluationResult = z.infer<
  typeof GroundednessEvaluationResultSchema
>;

export const AnswerRelevanceClassificationSchema = z.enum([
  "relevant_grounded_answer",
  "grounded_but_irrelevant_answer",
  "relevant_ungrounded_answer",
  "irrelevant_answer",
  "correct_refusal",
  "incorrect_refusal",
  "correct_clarification",
  "irrelevant_clarification",
  "correct_source_less_response",
  "incorrect_source_less_response",
  "evaluation_unavailable",
]);

export const AnswerRelevanceEvaluationResultSchema = z
  .object({
    evaluated: z.boolean(),
    score: z.number().min(0).max(1).nullable(),
    relevant: z.boolean().nullable(),
    threshold: z.number().min(0).max(1),
    classification: AnswerRelevanceClassificationSchema,
    expectedOutcome: RagExpectedOutcomeSchema,
    actualOutcome: RagActualOutcomeSchema,
    outcomeCorrect: z.boolean(),
    judgeStatus: z.enum(["completed", "degraded", "failed", "not_run"]),
    judgeProvider: EvaluationId.optional(),
    judgeModel: EvaluationId.optional(),
    errorCode: EvaluationId.nullable().optional(),
  })
  .strict();
export type AnswerRelevanceEvaluationResult = z.infer<
  typeof AnswerRelevanceEvaluationResultSchema
>;

export const AnswerCorrectnessResultSchema = z.object({
  evaluated: z.boolean(),
  required: z.boolean(),
  status: z.enum(["correct", "incomplete", "forbidden_content", "contradicted", "unavailable"]),
  expectedFactCoverage: z.number().min(0).max(1).nullable(),
  expectedClaimCoverage: z.number().min(0).max(1).nullable(),
  matchedExpectedFacts: z.array(EvaluationText),
  matchedExpectedClaims: z.array(EvaluationText),
  missingExpectedFacts: z.array(EvaluationText),
  missingExpectedClaims: z.array(EvaluationText),
  forbiddenFactsPresent: z.array(EvaluationText),
  expectedJudgments: z.array(z.object({
    proposition: EvaluationText,
    status: z.enum(["matched", "contradicted", "missing", "unknown"]),
    confidence: z.number().min(0).max(1).optional(),
    reasonCode: EvaluationId,
  }).strict()).default([]),
  forbiddenJudgments: z.array(z.object({
    proposition: EvaluationText,
    status: z.enum(["present", "absent", "unknown"]),
    confidence: z.number().min(0).max(1).optional(),
    reasonCode: EvaluationId,
  }).strict()).default([]),
}).strict();
export type AnswerCorrectnessResult = z.infer<typeof AnswerCorrectnessResultSchema>;

export const RagOperationalMetricsSchema = z
  .object({
    provider: EvaluationId.optional(),
    model: EvaluationId.optional(),
    latencyMs: z.number().nonnegative().optional(),
    tokens: z.number().int().nonnegative().optional(),
    estimatedCost: z.number().nonnegative().optional(),
  })
  .strict();

const RankedArtifactSchema = z
  .object({
    rank: z.number().int().positive(),
    chunkId: EvaluationId,
    documentId: EvaluationId.optional(),
    score: z.number().optional(),
    retrievalMethod: EvaluationId.optional(),
  })
  .strict();

const SanitizedPreAuthorizationCandidateSchema = z.object({
  rank: z.number().int().positive(),
  fingerprint: EvaluationId,
  score: z.number().optional(),
}).strict();

const PreAuthorizationDiagnosticsSchema = z.object({
  vectorCandidateCount: z.number().int().nonnegative(),
  keywordCandidateCount: z.number().int().nonnegative(),
  vectorCandidates: z.array(SanitizedPreAuthorizationCandidateSchema),
  keywordCandidates: z.array(SanitizedPreAuthorizationCandidateSchema),
}).strict();

export const RagWorkflowArtifactsSchema = z
  .object({
    preAuthorizationDiagnostics: PreAuthorizationDiagnosticsSchema,
    fusedCandidateIds: EvaluationIdList,
    postAuthorizationCandidateIds: EvaluationIdList,
    retrievalRankedCandidates: z.array(RankedArtifactSchema).default([]),
    evidenceSelectedCandidates: z.array(RankedArtifactSchema).default([]),
    evidenceSufficiency: z
      .enum(["SUFFICIENT", "WEAK", "NO_EVIDENCE", "CONFLICTING"])
      .nullable(),
    approvedEvidenceIds: EvaluationIdList,
    rejectedEvidenceIds: EvaluationIdList,
    finalSourceAuthorizationPassed: z.boolean(),
  })
  .strict();

export const RagExecutionStatusSchema = z
  .object({
    status: z.enum(["completed", "failed"]),
    failureKind: z
      .enum([
        "rate_limited",
        "provider_unavailable",
        "timeout",
        "authorization_invariant",
        "workflow_failed",
      ])
      .nullable(),
    errorCode: EvaluationId.nullable(),
  })
  .strict();

export const RagEvaluationResultSchema = z
  .object({
    schemaVersion: z.literal(RAG_EVALUATION_RESULT_SCHEMA_VERSION),
    evaluationCaseId: EvaluationId,
    datasetVersion: EvaluationId,
    actualRoute: QueryRoute.nullable(),
    actualIntent: IntentClass.nullable(),
    actualAction: ChatComplianceDecision.nullable(),
    reasonCode: EvaluationId,
    retrievedDocumentIds: EvaluationIdList,
    retrievedChunkIds: EvaluationIdList,
    contextRelevance: ContextRelevanceResultSchema,
    groundedness: GroundednessEvaluationResultSchema,
    correctness: AnswerCorrectnessResultSchema,
    finalAnswer: z.string().max(20_000),
    answerRelevance: AnswerRelevanceEvaluationResultSchema,
    finalSourceDocumentIds: EvaluationIdList,
    finalSourceChunkIds: EvaluationIdList,
    authorizationInvariantPassed: z.boolean(),
    authorizationViolations: z.array(AuthorizationViolationSchema),
    operational: RagOperationalMetricsSchema,
    workflowArtifacts: RagWorkflowArtifactsSchema.optional(),
    execution: RagExecutionStatusSchema,
    expectedOutcome: RagExpectedOutcomeSchema,
    actualOutcome: RagActualOutcomeSchema,
    outcomeCorrect: z.boolean(),
    casePassed: z.boolean(),
  })
  .strict()
  .superRefine((result, context) => {
    const expectedAuthorizationState =
      result.contextRelevance.authorizationInvariantPassed &&
      (result.workflowArtifacts?.finalSourceAuthorizationPassed ?? true);
    if (result.authorizationInvariantPassed !== expectedAuthorizationState) {
      context.addIssue({
        code: "custom",
        path: ["authorizationInvariantPassed"],
        message: "Security summary must match retrieval and final-source authorization",
      });
    }
    if (
      JSON.stringify(result.authorizationViolations) !==
      JSON.stringify(result.contextRelevance.authorizationViolations)
    ) {
      context.addIssue({
        code: "custom",
        path: ["authorizationViolations"],
        message: "Security violations must preserve the context evaluator findings",
      });
    }
    if (!result.authorizationInvariantPassed && result.casePassed) {
      context.addIssue({
        code: "custom",
        path: ["casePassed"],
        message: "A case with an authorization violation cannot pass",
      });
    }
    if (
      result.outcomeCorrect !==
      (result.actualOutcome !== "error" &&
        result.actualOutcome === result.expectedOutcome)
    ) {
      context.addIssue({
        code: "custom",
        path: ["outcomeCorrect"],
        message: "outcomeCorrect must match expected and actual outcomes",
      });
    }
    if (result.execution.status === "failed" && result.casePassed) {
      context.addIssue({
        code: "custom",
        path: ["casePassed"],
        message: "A failed execution cannot pass",
      });
    }
  });
export type RagEvaluationResult = z.infer<typeof RagEvaluationResultSchema>;

export const RagLatencyStatisticsSchema = z
  .object({
    count: z.number().int().nonnegative(),
    minMs: z.number().nonnegative().nullable(),
    maxMs: z.number().nonnegative().nullable(),
    meanMs: z.number().nonnegative().nullable(),
    p50Ms: z.number().nonnegative().nullable(),
    p95Ms: z.number().nonnegative().nullable(),
  })
  .strict();

export const RagAggregateMetricsSchema = z
  .object({
    caseCount: z.number().int().nonnegative(),
    passedCaseCount: z.number().int().nonnegative(),
    casePassRate: z.number().min(0).max(1),
    retrievalEvaluatedCaseCount: z.number().int().nonnegative(),
    retrievalHitRate: z.number().min(0).max(1).nullable(),
    meanPrecisionAtK: z.number().min(0).max(1).nullable(),
    meanRecallAtK: z.number().min(0).max(1).nullable(),
    mrr: z.number().min(0).max(1).nullable(),
    groundedEvaluatedCaseCount: z.number().int().nonnegative(),
    groundedAnswerRate: z.number().min(0).max(1).nullable(),
    meanClaimSupportRate: z.number().min(0).max(1).nullable(),
    answerRelevanceEvaluatedCaseCount: z.number().int().nonnegative(),
    answerRelevanceUnavailableCaseCount: z.number().int().nonnegative(),
    meanAnswerRelevance: z.number().min(0).max(1).nullable(),
    correctnessEvaluatedCaseCount: z.number().int().nonnegative(),
    correctnessUnavailableCaseCount: z.number().int().nonnegative(),
    correctAnswerRate: z.number().min(0).max(1).nullable(),
    retrievalUnavailableCaseCount: z.number().int().nonnegative(),
    groundedUnavailableCaseCount: z.number().int().nonnegative(),
    executionAvailableCaseCount: z.number().int().nonnegative(),
    executionUnavailableCaseCount: z.number().int().nonnegative(),
    releaseRefusalEvaluatedCaseCount: z.number().int().nonnegative(),
    releaseRefusalCorrectness: z.number().min(0).max(1).nullable(),
    authorizationViolationCount: z.number().int().nonnegative(),
    authorizationInvariantPassed: z.boolean(),
    latency: RagLatencyStatisticsSchema,
    tokenSampleCount: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    meanTokens: z.number().nonnegative().nullable(),
    costSampleCount: z.number().int().nonnegative(),
    totalEstimatedCost: z.number().nonnegative(),
    meanEstimatedCost: z.number().nonnegative().nullable(),
  })
  .strict();
export type RagAggregateMetrics = z.infer<typeof RagAggregateMetricsSchema>;

export const RagEvaluationConfigurationSchema = z
  .object({
    name: EvaluationId.optional(),
    retrieval: z
      .object({
        metricCutoffK: z.number().int().positive(),
        workflowTopK: z.object({
          directQuestion: z.number().int().positive(),
          summarization: z.number().int().positive(),
        }).strict(),
        weights: z.record(z.string(), z.number()).optional(),
      })
      .strict()
      .optional(),
    fusion: z
      .object({
        strategy: EvaluationId,
        version: EvaluationId,
      })
      .strict()
      .optional(),
    reranker: EvaluationId.optional(),
    rerankerDetails: z
      .object({
        provider: EvaluationId,
        name: EvaluationId,
        componentVersion: EvaluationId,
      })
      .strict()
      .optional(),
    embeddingModel: EvaluationId.optional(),
    embedding: RuntimeComponentIdentitySchema.optional(),
    answerModel: EvaluationId.optional(),
    answer: RuntimeComponentIdentitySchema.optional(),
    verifierModel: EvaluationId.optional(),
    verifier: RuntimeComponentIdentitySchema.optional(),
    answerRelevanceJudge: RuntimeComponentIdentitySchema.optional(),
    semanticCorrectnessJudge: RuntimeComponentIdentitySchema.optional(),
    citationsEnabled: z.boolean().nullable().optional(),
    maxTokens: z.number().int().positive().nullable().optional(),
    promptVersions: z.record(z.string(), EvaluationId).optional(),
    thresholds: z.record(z.string(), z.number()).optional(),
    evidenceThresholds: z.record(z.string(), z.number()).optional(),
    workflowVersions: z.record(z.string(), EvaluationId).optional(),
    unavailableQualityFields: EvaluationIdList.optional(),
    metricSemanticsVersion: EvaluationId.optional(),
    runtimeIdentityRequired: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type RagEvaluationConfiguration = z.infer<
  typeof RagEvaluationConfigurationSchema
>;

export const RagEvaluationReportSchema = z
  .object({
    reportVersion: z.literal(RAG_EVALUATION_REPORT_VERSION),
    datasetVersion: EvaluationId,
    generatedAt: z.iso.datetime({ offset: true }),
    configuration: RagEvaluationConfigurationSchema,
    aggregateMetrics: RagAggregateMetricsSchema,
    results: z.array(RagEvaluationResultSchema),
  })
  .strict()
  .superRefine((report, context) => {
    if (report.results.some((result) => result.datasetVersion !== report.datasetVersion)) {
      context.addIssue({
        code: "custom",
        path: ["results"],
        message: "Every result must use the report datasetVersion",
      });
    }
    if (report.results.length !== report.aggregateMetrics.caseCount) {
      context.addIssue({
        code: "custom",
        path: ["aggregateMetrics", "caseCount"],
        message: "Aggregate caseCount must equal the number of results",
      });
    }
  });
export type RagEvaluationReport = z.infer<typeof RagEvaluationReportSchema>;
