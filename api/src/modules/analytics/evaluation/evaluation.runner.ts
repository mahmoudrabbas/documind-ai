import { createHash, randomBytes } from "node:crypto";
import {
  LLM_PROVIDER_UNAVAILABLE,
  LLM_RATE_LIMITED,
  LLM_TIMEOUT,
} from "../../../common/errors/errorCodes.js";
import { AnswerRelevanceEvaluator } from "./answerRelevance.evaluator.js";
import { ContextRelevanceEvaluator } from "./contextRelevance.evaluator.js";
import { GroundednessEvaluator } from "./groundedness.evaluator.js";
import { AnswerCorrectnessEvaluator } from "./correctness.evaluator.js";
import {
  AnswerRelevanceEvaluationResultSchema,
  GroundednessEvaluationResultSchema,
  RAG_EVALUATION_RESULT_SCHEMA_VERSION,
  RagEvaluationResultSchema,
  type RagActualOutcome,
  type RagEvaluationCaseV2,
  type RagEvaluationDatasetV2,
  type RagEvaluationResult,
} from "./evaluation.schemas.js";
import type {
  RagEvaluationExecutionContext,
  RagEvaluationWorkflow,
  RagWorkflowExecution,
} from "./evaluation.workflow.js";
import {
  getEvaluationPermissionScenario,
  canonicalScopes,
  permissionScenarioMatches,
} from "./evaluation.permissionScenarios.js";

export interface RagEvaluationRunnerOptions {
  workflow: RagEvaluationWorkflow;
  answerRelevanceEvaluator: AnswerRelevanceEvaluator;
  correctnessEvaluator?: AnswerCorrectnessEvaluator;
  resolveExecutionContext: (
    evaluationCase: RagEvaluationCaseV2,
  ) => Promise<Omit<
    RagEvaluationExecutionContext,
    "language" | "question" | "evaluationId" | "traceId"
  >>;
  caseIds?: readonly string[];
  tags?: readonly string[];
  topK?: number;
}

export const DEFAULT_RETRIEVAL_METRIC_CUTOFF_K = 10;

export class RagEvaluationConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RagEvaluationConfigurationError";
  }
}

export interface RagEvaluationRunOutput {
  results: RagEvaluationResult[];
  selectedCaseIds: string[];
}

function stableEvaluationId(datasetVersion: string, caseId: string): string {
  return `rag-eval-${createHash("sha256")
    .update(`${datasetVersion}:${caseId}`)
    .digest("hex")
    .slice(0, 20)}`;
}

function selectCases(
  dataset: RagEvaluationDatasetV2,
  options: Pick<RagEvaluationRunnerOptions, "caseIds" | "tags">,
): RagEvaluationCaseV2[] {
  const caseIds = options.caseIds ? new Set(options.caseIds) : null;
  const tags = options.tags ? new Set(options.tags) : null;
  return dataset.cases
    .filter((entry) => !caseIds || caseIds.has(entry.id))
    .filter((entry) => !tags || entry.tags.some((tag) => tags.has(tag)))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function actualOutcome(execution: RagWorkflowExecution): RagActualOutcome {
  if (execution.status === "failed") return "error";
  const route = execution.artifacts?.intent?.route;
  if (route === "assistant") return "source_less_assistant";
  if (route === "social") return "source_less_social";
  const action = execution.artifacts?.compliance?.action;
  if (action === "clarify") return "clarify";
  if (action === "refuse") return "refuse";
  return "release";
}

function unavailableGroundedness() {
  return GroundednessEvaluationResultSchema.parse({
    evaluated: false,
    factualClaimCount: 0,
    supportedClaimCount: 0,
    unsupportedClaimCount: 0,
    unknownClaimCount: 0,
    claimSupportRate: null,
    fullyGrounded: false,
    supportingEvidenceIds: [],
    faithfulnessScore: null,
  });
}

function unavailableAnswerRelevance(
  evaluationCase: RagEvaluationCaseV2,
  actual: RagActualOutcome,
  errorCode: string | null,
) {
  return AnswerRelevanceEvaluationResultSchema.parse({
    evaluated: false,
    score: null,
    relevant: null,
    threshold: 0.7,
    classification: "evaluation_unavailable",
    expectedOutcome: evaluationCase.expectedOutcome,
    actualOutcome: actual,
    outcomeCorrect: false,
    judgeStatus: "not_run",
    errorCode,
  });
}

function sourceExpectationsPassed(
  evaluationCase: RagEvaluationCaseV2,
  sourceDocumentIds: readonly string[],
): boolean {
  if (evaluationCase.citations.sourceForbidden && sourceDocumentIds.length > 0) {
    return false;
  }
  if (evaluationCase.citations.sourceRequired && sourceDocumentIds.length === 0) {
    return false;
  }
  const actual = new Set(sourceDocumentIds);
  return evaluationCase.citations.expectedSourceDocumentIds.every((id) => actual.has(id));
}

function normalizeErrorCode(execution: RagWorkflowExecution): string {
  if (execution.errorCode) return execution.errorCode;
  if (execution.failureKind === "rate_limited") return LLM_RATE_LIMITED;
  if (execution.failureKind === "provider_unavailable") return LLM_PROVIDER_UNAVAILABLE;
  if (execution.failureKind === "timeout") return LLM_TIMEOUT;
  return "EVALUATION_WORKFLOW_FAILED";
}

function assertAuthorizationScenarioSupported(
  evaluationCase: RagEvaluationCaseV2,
  context: RagEvaluationExecutionContext,
): void {
  const authorization = evaluationCase.authorization;
  if (!authorization) return;
  const tenantMatches = authorization.tenantScenario === context.tenantId ||
    (authorization.tenantScenario === "same_tenant" && context.tenantId.length > 0);
  if (!tenantMatches) {
    throw new RagEvaluationConfigurationError(
      `Case ${evaluationCase.id} tenant scenario was not executed`,
    );
  }
  const expected = evaluationCase.authorization?.actor;
  if (!expected) return;
  if (expected.actorId !== undefined && expected.actorId !== context.actorId) {
    throw new RagEvaluationConfigurationError(`Case ${evaluationCase.id} actorId mismatch`);
  }
  if (expected.baseRole !== context.baseRole) {
    throw new RagEvaluationConfigurationError(`Case ${evaluationCase.id} base role mismatch`);
  }
  if (
    expected.customRoleId !== undefined &&
    expected.customRoleId !== (context.customRoleId ?? null)
  ) {
    throw new RagEvaluationConfigurationError(`Case ${evaluationCase.id} custom role mismatch`);
  }
  if (expected.scopes !== undefined) {
    if (JSON.stringify(canonicalScopes(expected.scopes)) !== JSON.stringify(context.permissionScopes && canonicalScopes(context.permissionScopes))) {
      throw new RagEvaluationConfigurationError(`Case ${evaluationCase.id} permission scopes mismatch`);
    }
  }
  const scenario = getEvaluationPermissionScenario(authorization.permissionScenario);
  if (!scenario) {
    throw new RagEvaluationConfigurationError(
      `Case ${evaluationCase.id} permission scenario is unsupported by this runner`,
    );
  }
  if (context.documentsUseInAiGranted === undefined || !permissionScenarioMatches(
    scenario,
    {
      documentsUseInAiGranted: context.documentsUseInAiGranted,
      scopes: context.permissionScopes,
      departmentSemanticKeys: context.permissionDepartmentSemanticKeys,
      baseRole: context.baseRole,
      customRoleId: context.customRoleId,
    },
    expected.scopes,
  )) {
    throw new RagEvaluationConfigurationError(
      `Case ${evaluationCase.id} permission scenario does not match effective permissions`,
    );
  }
}

export class RagEvaluationRunner {
  private readonly contextEvaluator = new ContextRelevanceEvaluator();
  private readonly groundednessEvaluator = new GroundednessEvaluator();
  private readonly correctnessEvaluator: AnswerCorrectnessEvaluator;
  private readonly diagnosticSalt = randomBytes(32);

  constructor(private readonly options: RagEvaluationRunnerOptions) {
    this.correctnessEvaluator = options.correctnessEvaluator ?? new AnswerCorrectnessEvaluator();
  }

  async run(dataset: RagEvaluationDatasetV2): Promise<RagEvaluationRunOutput> {
    const selected = selectCases(dataset, this.options);
    if (selected.length === 0) {
      throw new RagEvaluationConfigurationError("Evaluation filters selected zero runnable cases");
    }
    const results: RagEvaluationResult[] = [];
    for (const evaluationCase of selected) {
      results.push(await this.runCase(dataset.datasetVersion, evaluationCase));
    }
    return { results, selectedCaseIds: selected.map((entry) => entry.id) };
  }

  private async runCase(
    datasetVersion: string,
    evaluationCase: RagEvaluationCaseV2,
  ): Promise<RagEvaluationResult> {
    if (evaluationCase.authorization && !getEvaluationPermissionScenario(evaluationCase.authorization.permissionScenario)) {
      throw new RagEvaluationConfigurationError(
        `Case ${evaluationCase.id} permission scenario is unsupported by this runner`,
      );
    }
    const resolved = await this.options.resolveExecutionContext(evaluationCase);
    const evaluationId = stableEvaluationId(datasetVersion, evaluationCase.id);
    const context: RagEvaluationExecutionContext = {
      ...resolved,
      language: evaluationCase.language,
      question: evaluationCase.question,
      evaluationId,
      traceId: evaluationId,
    };
    assertAuthorizationScenarioSupported(evaluationCase, context);
    let execution: RagWorkflowExecution;
    try {
      execution = await this.options.workflow.execute(evaluationCase, context);
    } catch {
      execution = {
        status: "failed",
        artifacts: null,
        semanticVerification: null,
        retrievalArtifacts: null,
        finalAnswer: "",
        judgeEvidence: [],
        authorizationByChunkId: new Map(),
        provider: "unknown",
        model: "unknown",
        errorCode: "EVALUATION_WORKFLOW_FAILED",
        failureKind: "workflow_failed",
      };
    }

    const ranked = execution.artifacts?.retrievalCandidates ?? [];
    let contextRelevance = this.contextEvaluator.evaluate({
      retrieved: ranked.map((candidate) => ({
        documentId: candidate.documentId,
        chunkId: candidate.chunkId,
        authorized: execution.authorizationByChunkId.get(candidate.chunkId) === true,
        authorizationReasonCode: "EVALUATION_AUTHORIZATION_RECHECK_FAILED",
      })),
      relevantDocumentIds:
        evaluationCase.retrieval.expectedRelevantDocumentIds.length > 0
          ? evaluationCase.retrieval.expectedRelevantDocumentIds
          : undefined,
      relevantChunkIds:
        evaluationCase.retrieval.expectedRelevantChunkIds.length > 0
          ? evaluationCase.retrieval.expectedRelevantChunkIds
          : undefined,
      k: this.options.topK ?? DEFAULT_RETRIEVAL_METRIC_CUTOFF_K,
    });
    const finalSourceAuthorizationPassed =
      execution.artifacts?.finalSourceAuthorizationPassed ?? true;
    if (!finalSourceAuthorizationPassed) {
      const finalSourceId = execution.artifacts?.finalSourceChunkIds[0];
      const finalCandidate = ranked.find((candidate) => candidate.chunkId === finalSourceId) ??
        ranked[0];
      if (finalCandidate) {
        contextRelevance = {
          ...contextRelevance,
          authorizationInvariantPassed: false,
          authorizationViolations: [
            ...contextRelevance.authorizationViolations,
            {
              rank: finalCandidate.rank,
              documentId: finalCandidate.documentId,
              chunkId: finalCandidate.chunkId,
              reasonCode: "FINAL_SOURCE_AUTHORIZATION_FAILED",
            },
          ],
        };
      }
    }
    const securityPassed =
      contextRelevance.authorizationInvariantPassed && finalSourceAuthorizationPassed;
    const sanitizedAuthorizationViolations = contextRelevance.authorizationViolations.map(
      (violation) => ({
        ...violation,
        documentId: this.sanitizeIdentifier(violation.documentId),
        ...(violation.chunkId
          ? { chunkId: this.sanitizeIdentifier(violation.chunkId) }
          : {}),
      }),
    );
    const reportContextRelevance = {
      ...contextRelevance,
      authorizationViolations: sanitizedAuthorizationViolations,
    };
    const groundedness = execution.semanticVerification
      ? this.groundednessEvaluator.evaluate({
          semanticVerification: execution.semanticVerification,
          evidenceTexts: execution.judgeEvidence.map((evidence) => evidence.text),
          exhaustiveDocumentCoverage: execution.exhaustiveDocumentCoverage,
          documentAbsence: evaluationCase.grounding.documentAbsence,
        })
      : unavailableGroundedness();
    const correctness = await this.correctnessEvaluator.evaluateAsync(
      evaluationCase,
      execution.status === "completed" ? execution.finalAnswer : null,
    );
    const actual = actualOutcome(execution);
    const endToEnd = evaluationCase.evaluationModes.includes("end_to_end");
    const answerRelevance =
      execution.status === "completed" && endToEnd
        ? await this.options.answerRelevanceEvaluator.evaluate({
            question: evaluationCase.question,
            finalAnswer: execution.finalAnswer,
            evidence: execution.judgeEvidence,
            expectedOutcome: evaluationCase.expectedOutcome,
            actualOutcome: actual,
            fullyGrounded: groundedness.fullyGrounded,
          })
        : unavailableAnswerRelevance(
            evaluationCase,
            actual,
            execution.status === "failed" ? normalizeErrorCode(execution) : null,
          );
    const outcomeCorrect = actual !== "error" && actual === evaluationCase.expectedOutcome;
    const routeCorrect =
      evaluationCase.expectedRoute === undefined ||
      execution.artifacts?.intent?.route === evaluationCase.expectedRoute;
    const intentCorrect =
      evaluationCase.expectedIntent === undefined ||
      execution.artifacts?.intent?.intent === evaluationCase.expectedIntent;
    const retrievalPassed =
      (!contextRelevance.document.evaluated || contextRelevance.document.hit === true) &&
      (!contextRelevance.chunk.evaluated || contextRelevance.chunk.hit === true);
    const sourceDocumentIds = execution.artifacts?.finalSourceDocumentIds ?? [];
    const authorizedFinalSourceChunkIds = (execution.artifacts?.finalSourceChunkIds ?? [])
      .filter((id) => execution.authorizationByChunkId.get(id) === true);
    const authorizedFinalSourceDocumentIds = [...new Set(
      authorizedFinalSourceChunkIds.flatMap((chunkId) => {
        const candidate = ranked.find((entry) => entry.chunkId === chunkId);
        return candidate ? [candidate.documentId] : [];
      }),
    )];
    const endToEndQualityPassed =
      !endToEnd ||
      (answerRelevance.evaluated &&
        (answerRelevance.relevant === true || actual === "refuse") &&
        (actual !== "release" ||
          execution.artifacts?.intent?.route !== "rag" ||
          groundedness.fullyGrounded));
    const correctnessPassed = !endToEnd || !correctness.required ||
      (correctness.evaluated && correctness.status === "correct");

    return RagEvaluationResultSchema.parse({
      schemaVersion: RAG_EVALUATION_RESULT_SCHEMA_VERSION,
      evaluationCaseId: evaluationCase.id,
      datasetVersion,
      actualRoute: execution.artifacts?.intent?.route ?? null,
      actualIntent: execution.artifacts?.intent?.intent ?? null,
      actualAction: execution.artifacts?.compliance?.action ??
        (actual === "source_less_assistant" || actual === "source_less_social"
          ? "release"
          : null),
      reasonCode:
        execution.artifacts?.compliance?.reasonCode ??
        execution.artifacts?.intent?.reasonCode ??
        execution.errorCode ??
        "EVALUATION_COMPLETED",
      retrievedDocumentIds: [...new Set(ranked
        .filter((candidate) => execution.authorizationByChunkId.get(candidate.chunkId) === true)
        .map((candidate) => candidate.documentId))],
      retrievedChunkIds: ranked
        .filter((candidate) => execution.authorizationByChunkId.get(candidate.chunkId) === true)
        .map((candidate) => candidate.chunkId),
      contextRelevance: reportContextRelevance,
      groundedness,
      correctness,
      finalAnswer: execution.finalAnswer,
      answerRelevance,
      finalSourceDocumentIds: authorizedFinalSourceDocumentIds,
      finalSourceChunkIds: authorizedFinalSourceChunkIds,
      authorizationInvariantPassed: securityPassed,
      authorizationViolations: sanitizedAuthorizationViolations,
      operational: {
        provider: execution.provider,
        model: execution.model,
        ...(execution.artifacts
          ? {
              latencyMs: execution.artifacts.runtime.latencyMs,
              tokens: execution.artifacts.runtime.totalTokensUsed,
              estimatedCost: execution.artifacts.runtime.estimatedCost,
            }
          : {}),
      },
      workflowArtifacts: {
        preAuthorizationDiagnostics: this.sanitizePreAuthorizationDiagnostics(execution),
        fusedCandidateIds: (execution.retrievalArtifacts?.fusedCandidateIds ?? [])
          .filter((id) => execution.authorizationByChunkId.get(id) === true),
        postAuthorizationCandidateIds:
          (execution.retrievalArtifacts?.hydratedCandidateIds ??
          execution.artifacts?.retrievalCandidates.map(
            (candidate) => candidate.chunkId,
          ) ??
          []).filter((id) => execution.authorizationByChunkId.get(id) === true),
        retrievalRankedCandidates: ranked
          .filter((candidate) => execution.authorizationByChunkId.get(candidate.chunkId) === true)
          .map((candidate) => ({ ...candidate })),
        evidenceSelectedCandidates:
          execution.artifacts?.evidenceSelectedCandidates
            .filter((candidate) => execution.authorizationByChunkId.get(candidate.chunkId) === true)
            .map((candidate) => ({ ...candidate })) ?? [],
        evidenceSufficiency: execution.artifacts?.evidenceSufficiency ?? null,
        approvedEvidenceIds: (execution.artifacts?.approvedEvidenceIds ?? [])
          .filter((id) => execution.authorizationByChunkId.get(id) === true),
        rejectedEvidenceIds: (execution.artifacts?.rejectedEvidenceIds ?? [])
          .filter((id) => execution.authorizationByChunkId.get(id) === true),
        finalSourceAuthorizationPassed,
      },
      execution: {
        status: execution.status,
        failureKind: execution.failureKind,
        errorCode:
          execution.status === "failed"
            ? normalizeErrorCode(execution)
            : execution.errorCode,
      },
      expectedOutcome: evaluationCase.expectedOutcome,
      actualOutcome: actual,
      outcomeCorrect,
      casePassed:
        execution.status === "completed" &&
        securityPassed &&
        correctnessPassed &&
        retrievalPassed &&
        (!endToEnd ||
          (outcomeCorrect &&
            routeCorrect &&
            intentCorrect &&
            sourceExpectationsPassed(evaluationCase, sourceDocumentIds) &&
            endToEndQualityPassed)),
    });
  }

  private sanitizePreAuthorizationDiagnostics(execution: RagWorkflowExecution) {
    const sanitize = (candidates: readonly { rank: number; chunkId: string; score: number }[]) =>
      candidates.map((candidate) => ({
        rank: candidate.rank,
        fingerprint: this.sanitizeIdentifier(candidate.chunkId),
        score: candidate.score,
      }));
    const vector = execution.retrievalArtifacts?.rawVectorCandidates ?? [];
    const keyword = execution.retrievalArtifacts?.rawKeywordCandidates ?? [];
    return {
      vectorCandidateCount: vector.length,
      keywordCandidateCount: keyword.length,
      vectorCandidates: sanitize(vector),
      keywordCandidates: sanitize(keyword),
    };
  }

  private sanitizeIdentifier(identifier: string): string {
    return createHash("sha256")
      .update(this.diagnosticSalt)
      .update(identifier)
      .digest("hex")
      .slice(0, 24);
  }
}
