import { ZodError } from "zod";
import {
  createEvaluationConfigurationIdentity,
  type RagConfigurationIdentity,
} from "./evaluation.configuration.js";
import {
  RAG_COMPARISON_REPORT_VERSION,
  RAG_METRIC_SEMANTICS_VERSION,
  RagComparisonReportSchema,
  RagMetricComparisonSchema,
  RagPerCaseComparisonSchema,
  type RagComparisonFinding,
  type RagComparisonReport,
  type RagMetricComparison,
  type RagPerCaseComparison,
} from "./evaluation.comparison.schemas.js";
import {
  createRagExperimentMetadata,
  type RagExperimentMetadata,
} from "./evaluation.experiment.js";
import {
  DEFAULT_RAG_REGRESSION_POLICY,
  RagRegressionPolicySchema,
  type RagRegressionPolicy,
} from "./evaluation.regressionPolicy.js";
import {
  RAG_EVALUATION_REPORT_VERSION,
  RagEvaluationReportSchema,
  type RagEvaluationReport,
  type RagEvaluationResult,
  type RetrievalLevelMetrics,
} from "./evaluation.schemas.js";
import { aggregateRagEvaluationResults } from "./evaluation.aggregate.js";
import { canonicalJson } from "./evaluation.configuration.js";

export type RagComparisonErrorCode =
  | "MALFORMED_BASELINE_REPORT"
  | "MALFORMED_CANDIDATE_REPORT"
  | "INCOMPATIBLE_REPORT_VERSION"
  | "INCOMPATIBLE_DATASET_VERSION"
  | "INCOMPATIBLE_CASE_SET"
  | "INCOMPATIBLE_METRIC_SEMANTICS"
  | "INCOMPATIBLE_METRIC_TOP_K"
  | "MALFORMED_REGRESSION_POLICY"
  | "INCONSISTENT_REPORT_AGGREGATES";

export class RagComparisonError extends Error {
  constructor(
    readonly code: RagComparisonErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "RagComparisonError";
  }
}

export interface CompareRagEvaluationReportsOptions {
  policy?: RagRegressionPolicy;
  generatedAt?: Date;
  baselineExperiment?: RagExperimentMetadata;
  candidateExperiment?: RagExperimentMetadata;
}

interface ReportEnvelope {
  report: RagEvaluationReport;
  identity: RagConfigurationIdentity;
  experiment: RagExperimentMetadata;
}

function parseReport(
  value: unknown,
  role: "baseline" | "candidate",
): RagEvaluationReport {
  const rawVersion =
    value !== null && typeof value === "object"
      ? (value as Record<string, unknown>).reportVersion
      : undefined;
  if (typeof rawVersion !== "string") {
    throw new RagComparisonError(
      role === "baseline"
        ? "MALFORMED_BASELINE_REPORT"
        : "MALFORMED_CANDIDATE_REPORT",
      `${role} evaluation report is missing reportVersion`,
    );
  }
  if (rawVersion !== RAG_EVALUATION_REPORT_VERSION) {
    throw new RagComparisonError(
      "INCOMPATIBLE_REPORT_VERSION",
      `${role} reportVersion is not supported`,
      { expected: RAG_EVALUATION_REPORT_VERSION, actual: rawVersion },
    );
  }
  try {
    const report = RagEvaluationReportSchema.parse(value);
    if (report.results.length === 0) {
      throw new RagComparisonError(
        "INCOMPATIBLE_CASE_SET",
        `${role} evaluation report contains no cases`,
      );
    }
    const recomputed = aggregateRagEvaluationResults(report.results);
    if (canonicalJson(recomputed) !== canonicalJson(report.aggregateMetrics)) {
      throw new RagComparisonError(
        "INCONSISTENT_REPORT_AGGREGATES",
        `${role} stored aggregates do not match its case results`,
      );
    }
    return report;
  } catch (error) {
    if (error instanceof RagComparisonError) throw error;
    throw new RagComparisonError(
      role === "baseline"
        ? "MALFORMED_BASELINE_REPORT"
        : "MALFORMED_CANDIDATE_REPORT",
      `${role} evaluation report is malformed`,
      error instanceof ZodError ? error.issues : undefined,
    );
  }
}

function primaryRetrievalMetric(
  result: RagEvaluationResult,
): RetrievalLevelMetrics | null {
  if (result.contextRelevance.chunk.evaluated) return result.contextRelevance.chunk;
  if (result.contextRelevance.document.evaluated) return result.contextRelevance.document;
  return null;
}

function reportMetricTopK(report: RagEvaluationReport): number | null {
  const values = new Set(
    report.results.flatMap((result) => {
      const metric = primaryRetrievalMetric(result);
      return metric ? [metric.k] : [];
    }),
  );
  if (values.size > 1) {
    throw new RagComparisonError(
      "INCOMPATIBLE_METRIC_TOP_K",
      "A report contains inconsistent retrieval metric cutoffs",
      { values: [...values].sort((left, right) => left - right) },
    );
  }
  return [...values][0] ?? null;
}

function semanticsVersion(report: RagEvaluationReport): string {
  return report.configuration.metricSemanticsVersion ?? RAG_METRIC_SEMANTICS_VERSION;
}

function sortedCaseIds(report: RagEvaluationReport): string[] {
  return report.results
    .map((result) => result.evaluationCaseId)
    .sort((left, right) => left.localeCompare(right));
}

function comparisonConfiguration(
  report: RagEvaluationReport,
): RagEvaluationReport["configuration"] {
  const { metadata: _runtimeMetadata, ...qualityConfiguration } =
    report.configuration;
  return qualityConfiguration;
}

function validateCompatibility(
  baseline: RagEvaluationReport,
  candidate: RagEvaluationReport,
): {
  caseIds: string[];
  metricTopK: number | null;
  metricSemanticsVersion: string;
} {
  if (baseline.reportVersion !== candidate.reportVersion) {
    throw new RagComparisonError(
      "INCOMPATIBLE_REPORT_VERSION",
      "Baseline and candidate report versions differ",
    );
  }
  if (baseline.datasetVersion !== candidate.datasetVersion) {
    throw new RagComparisonError(
      "INCOMPATIBLE_DATASET_VERSION",
      "Baseline and candidate dataset versions differ",
      { baseline: baseline.datasetVersion, candidate: candidate.datasetVersion },
    );
  }
  const baselineCases = sortedCaseIds(baseline);
  const candidateCases = sortedCaseIds(candidate);
  if (
    new Set(baselineCases).size !== baselineCases.length ||
    new Set(candidateCases).size !== candidateCases.length
  ) {
    throw new RagComparisonError(
      "INCOMPATIBLE_CASE_SET",
      "Evaluation reports must not contain duplicate case IDs",
    );
  }
  if (JSON.stringify(baselineCases) !== JSON.stringify(candidateCases)) {
    throw new RagComparisonError(
      "INCOMPATIBLE_CASE_SET",
      "Baseline and candidate evaluation case sets differ",
      { baseline: baselineCases, candidate: candidateCases },
    );
  }
  const baselineSemantics = semanticsVersion(baseline);
  const candidateSemantics = semanticsVersion(candidate);
  if (baselineSemantics !== candidateSemantics) {
    throw new RagComparisonError(
      "INCOMPATIBLE_METRIC_SEMANTICS",
      "Baseline and candidate metric semantics differ",
      { baseline: baselineSemantics, candidate: candidateSemantics },
    );
  }
  const baselineTopK = reportMetricTopK(baseline);
  const candidateTopK = reportMetricTopK(candidate);
  if (baselineTopK !== candidateTopK) {
    throw new RagComparisonError(
      "INCOMPATIBLE_METRIC_TOP_K",
      "Baseline and candidate retrieval metric cutoffs differ",
      { baseline: baselineTopK, candidate: candidateTopK },
    );
  }
  return {
    caseIds: baselineCases,
    metricTopK: baselineTopK,
    metricSemanticsVersion: baselineSemantics,
  };
}

function compareMetric(input: {
  metric: string;
  category: "quality" | "security" | "operational";
  preference: "higher" | "lower";
  baseline: number | null;
  candidate: number | null;
}): RagMetricComparison {
  if (input.baseline === null || input.candidate === null) {
    return RagMetricComparisonSchema.parse({
      ...input,
      delta: null,
      percentageDelta: null,
      status: "unavailable",
    });
  }
  const rawDelta = input.candidate - input.baseline;
  const rounded = (value: number): number =>
    Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;
  const delta = rounded(rawDelta);
  const percentageDelta =
    input.baseline === 0 ? null : rounded((rawDelta / input.baseline) * 100);
  const effectiveDelta = Math.abs(delta) < 1e-12 ? 0 : delta;
  const improved =
    input.preference === "higher" ? effectiveDelta > 0 : effectiveDelta < 0;
  const regressed =
    input.preference === "higher" ? effectiveDelta < 0 : effectiveDelta > 0;
  return RagMetricComparisonSchema.parse({
    ...input,
    delta: effectiveDelta,
    percentageDelta,
    status: improved ? "improved" : regressed ? "regressed" : "unchanged",
  });
}

function aggregateComparisons(
  baseline: RagEvaluationReport,
  candidate: RagEvaluationReport,
): RagMetricComparison[] {
  const left = baseline.aggregateMetrics;
  const right = candidate.aggregateMetrics;
  return [
    compareMetric({ metric: "casePassRate", category: "quality", preference: "higher", baseline: left.casePassRate, candidate: right.casePassRate }),
    compareMetric({ metric: "retrievalHitRate", category: "quality", preference: "higher", baseline: left.retrievalHitRate, candidate: right.retrievalHitRate }),
    compareMetric({ metric: "meanPrecisionAtK", category: "quality", preference: "higher", baseline: left.meanPrecisionAtK, candidate: right.meanPrecisionAtK }),
    compareMetric({ metric: "meanRecallAtK", category: "quality", preference: "higher", baseline: left.meanRecallAtK, candidate: right.meanRecallAtK }),
    compareMetric({ metric: "mrr", category: "quality", preference: "higher", baseline: left.mrr, candidate: right.mrr }),
    compareMetric({ metric: "groundedAnswerRate", category: "quality", preference: "higher", baseline: left.groundedAnswerRate, candidate: right.groundedAnswerRate }),
    compareMetric({ metric: "meanClaimSupportRate", category: "quality", preference: "higher", baseline: left.meanClaimSupportRate, candidate: right.meanClaimSupportRate }),
    compareMetric({ metric: "meanAnswerRelevance", category: "quality", preference: "higher", baseline: left.meanAnswerRelevance, candidate: right.meanAnswerRelevance }),
    compareMetric({ metric: "correctAnswerRate", category: "quality", preference: "higher", baseline: left.correctAnswerRate, candidate: right.correctAnswerRate }),
    compareMetric({ metric: "releaseRefusalCorrectness", category: "quality", preference: "higher", baseline: left.releaseRefusalCorrectness, candidate: right.releaseRefusalCorrectness }),
    compareMetric({ metric: "authorizationViolationCount", category: "security", preference: "lower", baseline: left.authorizationViolationCount, candidate: right.authorizationViolationCount }),
    compareMetric({ metric: "meanLatencyMs", category: "operational", preference: "lower", baseline: left.latency.meanMs, candidate: right.latency.meanMs }),
    compareMetric({ metric: "p50LatencyMs", category: "operational", preference: "lower", baseline: left.latency.p50Ms, candidate: right.latency.p50Ms }),
    compareMetric({ metric: "p95LatencyMs", category: "operational", preference: "lower", baseline: left.latency.p95Ms, candidate: right.latency.p95Ms }),
    compareMetric({ metric: "meanTokens", category: "operational", preference: "lower", baseline: left.meanTokens, candidate: right.meanTokens }),
    compareMetric({ metric: "totalTokens", category: "operational", preference: "lower", baseline: left.totalTokens, candidate: right.totalTokens }),
    compareMetric({ metric: "meanEstimatedCost", category: "operational", preference: "lower", baseline: left.meanEstimatedCost, candidate: right.meanEstimatedCost }),
    compareMetric({ metric: "totalEstimatedCost", category: "operational", preference: "lower", baseline: left.totalEstimatedCost, candidate: right.totalEstimatedCost }),
  ];
}

function caseMetricComparisons(
  baseline: RagEvaluationResult,
  candidate: RagEvaluationResult,
): RagMetricComparison[] {
  const leftRetrieval = primaryRetrievalMetric(baseline);
  const rightRetrieval = primaryRetrievalMetric(candidate);
  return [
    compareMetric({ metric: "casePassed", category: "quality", preference: "higher", baseline: baseline.casePassed ? 1 : 0, candidate: candidate.casePassed ? 1 : 0 }),
    compareMetric({ metric: "outcomeCorrect", category: "quality", preference: "higher", baseline: baseline.outcomeCorrect ? 1 : 0, candidate: candidate.outcomeCorrect ? 1 : 0 }),
    compareMetric({ metric: "precisionAtK", category: "quality", preference: "higher", baseline: leftRetrieval?.precision ?? null, candidate: rightRetrieval?.precision ?? null }),
    compareMetric({ metric: "recallAtK", category: "quality", preference: "higher", baseline: leftRetrieval?.recall ?? null, candidate: rightRetrieval?.recall ?? null }),
    compareMetric({ metric: "reciprocalRank", category: "quality", preference: "higher", baseline: leftRetrieval?.reciprocalRank ?? null, candidate: rightRetrieval?.reciprocalRank ?? null }),
    compareMetric({ metric: "fullyGrounded", category: "quality", preference: "higher", baseline: baseline.groundedness.evaluated ? (baseline.groundedness.fullyGrounded ? 1 : 0) : null, candidate: candidate.groundedness.evaluated ? (candidate.groundedness.fullyGrounded ? 1 : 0) : null }),
    compareMetric({ metric: "claimSupportRate", category: "quality", preference: "higher", baseline: baseline.groundedness.claimSupportRate, candidate: candidate.groundedness.claimSupportRate }),
    compareMetric({ metric: "answerRelevance", category: "quality", preference: "higher", baseline: baseline.answerRelevance.score, candidate: candidate.answerRelevance.score }),
    compareMetric({ metric: "correctness", category: "quality", preference: "higher", baseline: baseline.correctness.evaluated ? (baseline.correctness.status === "correct" ? 1 : 0) : null, candidate: candidate.correctness.evaluated ? (candidate.correctness.status === "correct" ? 1 : 0) : null }),
    compareMetric({ metric: "authorizationViolations", category: "security", preference: "lower", baseline: baseline.authorizationViolations.length, candidate: candidate.authorizationViolations.length }),
    compareMetric({ metric: "latencyMs", category: "operational", preference: "lower", baseline: baseline.operational.latencyMs ?? null, candidate: candidate.operational.latencyMs ?? null }),
    compareMetric({ metric: "tokens", category: "operational", preference: "lower", baseline: baseline.operational.tokens ?? null, candidate: candidate.operational.tokens ?? null }),
    compareMetric({ metric: "estimatedCost", category: "operational", preference: "lower", baseline: baseline.operational.estimatedCost ?? null, candidate: candidate.operational.estimatedCost ?? null }),
  ];
}

function compareCases(
  baseline: RagEvaluationReport,
  candidate: RagEvaluationReport,
): RagPerCaseComparison[] {
  const baselineById = new Map(
    baseline.results.map((result) => [result.evaluationCaseId, result]),
  );
  return [...candidate.results]
    .sort((left, right) => left.evaluationCaseId.localeCompare(right.evaluationCaseId))
    .map((right) => {
      const left = baselineById.get(right.evaluationCaseId)!;
      const metrics = caseMetricComparisons(left, right);
      const available = metrics.filter((metric) => metric.status !== "unavailable");
      const executionUnavailable =
        left.execution.status === "failed" || right.execution.status === "failed";
      const reasons = executionUnavailable
        ? ["executionUnavailable"]
        : metrics
        .filter((metric) => metric.status === "regressed")
        .map((metric) => metric.metric)
        .sort((a, b) => a.localeCompare(b));
      const status =
        executionUnavailable || available.length === 0
          ? "unavailable"
          : available.some((metric) => metric.status === "regressed")
            ? "regressed"
            : available.some((metric) => metric.status === "improved")
              ? "improved"
              : "unchanged";
      return RagPerCaseComparisonSchema.parse({
        evaluationCaseId: right.evaluationCaseId,
        status,
        baselinePassed: left.casePassed,
        candidatePassed: right.casePassed,
        baselineOutcomeCorrect: left.outcomeCorrect,
        candidateOutcomeCorrect: right.outcomeCorrect,
        metricComparisons: metrics,
        reasons,
      });
    });
}

function finding(input: RagComparisonFinding): RagComparisonFinding {
  return input;
}

function percentageIncrease(baseline: number, candidate: number): number {
  if (baseline === 0) return candidate === 0 ? 0 : Number.POSITIVE_INFINITY;
  return ((candidate - baseline) / baseline) * 100;
}

function sortedFindings(values: RagComparisonFinding[]): RagComparisonFinding[] {
  return values.sort((left, right) =>
    `${left.code}:${left.caseId ?? ""}`.localeCompare(
      `${right.code}:${right.caseId ?? ""}`,
    ),
  );
}

function applyPolicy(input: {
  baseline: RagEvaluationReport;
  candidate: RagEvaluationReport;
  policy: RagRegressionPolicy;
  aggregate: RagMetricComparison[];
  perCase: RagPerCaseComparison[];
}): {
  hardFailures: RagComparisonFinding[];
  qualityFailures: RagComparisonFinding[];
  operationalWarnings: RagComparisonFinding[];
  operationalFindings: RagComparisonFinding[];
} {
  const hardFailures: RagComparisonFinding[] = [];
  const qualityFailures: RagComparisonFinding[] = [];
  const operationalWarnings: RagComparisonFinding[] = [];
  const operationalFindings: RagComparisonFinding[] = [];
  const { baseline, candidate, policy } = input;

  if (
    policy.hardSecurity.authorizationViolationsMustBeZero &&
    candidate.aggregateMetrics.authorizationViolationCount > 0
  ) {
    hardFailures.push(finding({
      code: "AUTHORIZATION_VIOLATION",
      message: "Candidate contains authorization violations",
      metric: "authorizationViolationCount",
      candidate: candidate.aggregateMetrics.authorizationViolationCount,
      limit: 0,
    }));
  }
  for (const result of candidate.results) {
    if (
      policy.hardSecurity.authorizationInvariantMustPass &&
      !result.authorizationInvariantPassed
    ) {
      hardFailures.push(finding({
        code: "AUTHORIZATION_INVARIANT_FAILED",
        message: "Candidate case failed an authorization invariant",
        caseId: result.evaluationCaseId,
      }));
    }
    if (
      policy.hardSecurity.finalSourceAuthorizationMustPass &&
      result.workflowArtifacts?.finalSourceAuthorizationPassed === false
    ) {
      hardFailures.push(finding({
        code: "UNAUTHORIZED_FINAL_SOURCE",
        message: "Candidate case failed final source reauthorization",
        caseId: result.evaluationCaseId,
      }));
    }
    if (
      policy.hardCorrectness.forbidUnsupportedContentRelease &&
      result.actualOutcome === "release" &&
      (result.groundedness.unsupportedClaimCount > 0 ||
        result.groundedness.unknownClaimCount > 0)
    ) {
      hardFailures.push(finding({
        code: "UNSUPPORTED_CONTENT_RELEASE",
        message: "Candidate released content with unsupported or unknown claims",
        caseId: result.evaluationCaseId,
      }));
    }
  }

  const baselineById = new Map(
    baseline.results.map((result) => [result.evaluationCaseId, result]),
  );
  for (const result of candidate.results) {
    const previous = baselineById.get(result.evaluationCaseId)!;
    const previousRetrieval = primaryRetrievalMetric(previous);
    const currentRetrieval = primaryRetrievalMetric(result);
    if (policy.availability.requireCandidateCaseExecution && result.execution.status !== "completed") {
      hardFailures.push(finding({ code: "CANDIDATE_EXECUTION_UNAVAILABLE", message: "Candidate case did not execute successfully", caseId: result.evaluationCaseId }));
    }
    if (policy.availability.requireGroundednessWhenBaselineAvailable && previous.groundedness.evaluated && !result.groundedness.evaluated) {
      hardFailures.push(finding({ code: "GROUNDEDNESS_MEASUREMENT_UNAVAILABLE", message: "Candidate groundedness measurement disappeared", caseId: result.evaluationCaseId }));
    }
    if (policy.availability.requireAnswerRelevanceWhenBaselineAvailable && previous.answerRelevance.evaluated && !result.answerRelevance.evaluated) {
      hardFailures.push(finding({ code: "ANSWER_RELEVANCE_MEASUREMENT_UNAVAILABLE", message: "Candidate answer-relevance measurement disappeared", caseId: result.evaluationCaseId }));
    }
    if (policy.availability.requireRetrievalWhenBaselineAvailable && previousRetrieval !== null && currentRetrieval === null) {
      hardFailures.push(finding({ code: "RETRIEVAL_MEASUREMENT_UNAVAILABLE", message: "Candidate retrieval measurement disappeared", caseId: result.evaluationCaseId }));
    }
    if (
      policy.availability.requireCorrectnessAvailabilityPreserved &&
      previous.correctness.required && previous.correctness.evaluated &&
      !result.correctness.evaluated
    ) {
      hardFailures.push(finding({ code: "CORRECTNESS_MEASUREMENT_UNAVAILABLE", message: "Candidate correctness measurement disappeared", caseId: result.evaluationCaseId }));
    }
    if (
      policy.hardCorrectness.forbidCasePassRegression &&
      previous.casePassed &&
      !result.casePassed
    ) {
      hardFailures.push(finding({ code: "CASE_PASS_REGRESSION", message: "Previously passing case now fails", caseId: result.evaluationCaseId }));
    }
    if (
      policy.hardCorrectness.forbidOutcomeCorrectnessRegression &&
      previous.outcomeCorrect &&
      !result.outcomeCorrect
    ) {
      hardFailures.push(finding({ code: "OUTCOME_CORRECTNESS_REGRESSION", message: "Previously correct outcome is now incorrect", caseId: result.evaluationCaseId }));
    }
    if (
      policy.hardCorrectness.forbidGroundednessRegression &&
      previous.groundedness.evaluated &&
      previous.groundedness.fullyGrounded &&
      result.groundedness.evaluated &&
      !result.groundedness.fullyGrounded
    ) {
      hardFailures.push(finding({ code: "GROUNDEDNESS_REGRESSION", message: "Previously grounded case is no longer fully grounded", caseId: result.evaluationCaseId }));
    }
  }

  const executionCoverage = candidate.aggregateMetrics.caseCount === 0
    ? 0
    : candidate.aggregateMetrics.executionAvailableCaseCount / candidate.aggregateMetrics.caseCount;
  if (executionCoverage < policy.availability.minimumEvaluationCoverage) {
    qualityFailures.push(finding({
      code: "EVALUATION_COVERAGE_BELOW_MINIMUM",
      message: "Candidate execution coverage is below policy minimum",
      metric: "executionCoverage",
      candidate: executionCoverage,
      limit: policy.availability.minimumEvaluationCoverage,
    }));
  }

  const baselineLabeled = baseline.results.filter((result) => result.correctness.required).length;
  const candidateLabeled = candidate.results.filter((result) => result.correctness.required).length;
  const baselineCorrectnessCoverage = baselineLabeled === 0 ? null :
    baseline.aggregateMetrics.correctnessEvaluatedCaseCount / baselineLabeled;
  const candidateCorrectnessCoverage = candidateLabeled === 0 ? null :
    candidate.aggregateMetrics.correctnessEvaluatedCaseCount / candidateLabeled;
  if (
    candidateCorrectnessCoverage !== null &&
    candidateCorrectnessCoverage < policy.availability.minimumCorrectnessEvaluatedCoverage
  ) {
    qualityFailures.push(finding({
      code: "CORRECTNESS_COVERAGE_BELOW_MINIMUM",
      message: "Candidate correctness evaluated coverage is below policy minimum",
      metric: "correctnessEvaluatedCoverage",
      candidate: candidateCorrectnessCoverage,
      limit: policy.availability.minimumCorrectnessEvaluatedCoverage,
    }));
  }
  if (
    baselineCorrectnessCoverage !== null && candidateCorrectnessCoverage !== null &&
    baselineCorrectnessCoverage - candidateCorrectnessCoverage >
      policy.allowedRegressions.correctnessEvaluatedCoverage + 1e-12
  ) {
    qualityFailures.push(finding({
      code: "CORRECTNESS_COVERAGE_REGRESSION_EXCEEDED",
      message: "Correctness evaluated coverage regression exceeds policy",
      metric: "correctnessEvaluatedCoverage",
      baseline: baselineCorrectnessCoverage,
      candidate: candidateCorrectnessCoverage,
      limit: policy.allowedRegressions.correctnessEvaluatedCoverage,
    }));
  }

  const floors: Array<[string, number | undefined, number | null]> = [
    ["casePassRate", policy.qualityFloors.casePassRate, candidate.aggregateMetrics.casePassRate],
    ["meanRecallAtK", policy.qualityFloors.retrievalRecall, candidate.aggregateMetrics.meanRecallAtK],
    ["groundedAnswerRate", policy.qualityFloors.groundedAnswerRate, candidate.aggregateMetrics.groundedAnswerRate],
    ["meanClaimSupportRate", policy.qualityFloors.claimSupportRate, candidate.aggregateMetrics.meanClaimSupportRate],
    ["meanAnswerRelevance", policy.qualityFloors.answerRelevance, candidate.aggregateMetrics.meanAnswerRelevance],
    ["correctAnswerRate", policy.qualityFloors.correctAnswerRate, candidate.aggregateMetrics.correctAnswerRate],
  ];
  for (const [metric, floor, actual] of floors) {
    if (floor !== undefined && (actual === null || actual < floor)) {
      qualityFailures.push(finding({ code: "QUALITY_FLOOR_FAILED", message: `${metric} is below its required floor`, metric, candidate: actual, limit: floor }));
    }
  }

  const allowances: Record<string, number> = {
    casePassRate: policy.allowedRegressions.casePassRate,
    meanPrecisionAtK: policy.allowedRegressions.precisionAtK,
    meanRecallAtK: policy.allowedRegressions.recallAtK,
    mrr: policy.allowedRegressions.mrr,
    groundedAnswerRate: policy.allowedRegressions.groundedAnswerRate,
    meanClaimSupportRate: policy.allowedRegressions.claimSupportRate,
    meanAnswerRelevance: policy.allowedRegressions.answerRelevance,
    releaseRefusalCorrectness: policy.allowedRegressions.releaseRefusalCorrectness,
    correctAnswerRate: policy.allowedRegressions.correctAnswerRate,
  };
  for (const metric of input.aggregate.filter((entry) => entry.category === "quality")) {
    const allowance = allowances[metric.metric];
    if (
      allowance !== undefined &&
      metric.baseline !== null &&
      metric.candidate !== null &&
      metric.baseline - metric.candidate > allowance + 1e-12
    ) {
      qualityFailures.push(finding({ code: "QUALITY_REGRESSION_EXCEEDED", message: `${metric.metric} regression exceeds policy`, metric: metric.metric, baseline: metric.baseline, candidate: metric.candidate, limit: allowance }));
    }
  }

  const operationalChecks: Array<[string, number | undefined, number | null, number | null]> = [
    ["meanLatencyMs", policy.operational.maximumLatencyIncreasePercent, baseline.aggregateMetrics.latency.meanMs, candidate.aggregateMetrics.latency.meanMs],
    ["meanTokens", policy.operational.maximumTokenIncreasePercent, baseline.aggregateMetrics.meanTokens, candidate.aggregateMetrics.meanTokens],
    ["meanEstimatedCost", policy.operational.maximumCostIncreasePercent, baseline.aggregateMetrics.meanEstimatedCost, candidate.aggregateMetrics.meanEstimatedCost],
  ];
  for (const [metric, maximum, previous, current] of operationalChecks) {
    if (maximum === undefined || previous === null || current === null) continue;
    const increase = percentageIncrease(previous, current);
    if (increase > maximum) {
      const issue = finding({ code: "OPERATIONAL_INCREASE_EXCEEDED", message: `${metric} increase exceeds policy`, metric, baseline: previous, candidate: current, limit: maximum });
      operationalFindings.push(issue);
      if (policy.operational.enforcement === "warn") operationalWarnings.push(issue);
      else qualityFailures.push(issue);
    }
  }

  return {
    hardFailures: sortedFindings(hardFailures),
    qualityFailures: sortedFindings(qualityFailures),
    operationalWarnings: sortedFindings(operationalWarnings),
    operationalFindings: sortedFindings(operationalFindings),
  };
}

function envelope(
  report: RagEvaluationReport,
  role: "baseline" | "candidate",
  supplied: RagExperimentMetadata | undefined,
  baselineExperimentId?: string,
): ReportEnvelope {
  const identity = createEvaluationConfigurationIdentity(
    report.datasetVersion,
    report.configuration,
  );
  const experiment = supplied ?? createRagExperimentMetadata({
    name: report.configuration.name ?? `${role}-${identity.configurationId}`,
    configurationIdentity: identity,
    datasetVersion: report.datasetVersion,
    createdAt: report.generatedAt,
    ...(baselineExperimentId ? { baselineExperimentId } : {}),
    tags: [role],
  });
  return { report, identity, experiment };
}

export function compareRagEvaluationReports(
  rawBaseline: unknown,
  rawCandidate: unknown,
  options: CompareRagEvaluationReportsOptions = {},
): RagComparisonReport {
  const baselineReport = parseReport(rawBaseline, "baseline");
  const candidateReport = parseReport(rawCandidate, "candidate");
  const compatibility = validateCompatibility(baselineReport, candidateReport);
  let policy: RagRegressionPolicy;
  try {
    policy = RagRegressionPolicySchema.parse(
      options.policy ?? DEFAULT_RAG_REGRESSION_POLICY,
    );
  } catch (error) {
    throw new RagComparisonError(
      "MALFORMED_REGRESSION_POLICY",
      "Regression policy is malformed",
      error instanceof ZodError ? error.issues : undefined,
    );
  }
  const baseline = envelope(
    baselineReport,
    "baseline",
    options.baselineExperiment,
  );
  const candidate = envelope(
    candidateReport,
    "candidate",
    options.candidateExperiment,
    baseline.experiment.experimentId,
  );
  const aggregate = aggregateComparisons(baselineReport, candidateReport);
  const perCase = compareCases(baselineReport, candidateReport);
  const findings = applyPolicy({
    baseline: baselineReport,
    candidate: candidateReport,
    policy,
    aggregate,
    perCase,
  });
  const perCaseRegressions = perCase
    .filter((entry) => entry.status === "regressed")
    .map((entry) => entry.evaluationCaseId);
  const gate = {
    passed:
      findings.hardFailures.length === 0 && findings.qualityFailures.length === 0,
    hardFailures: findings.hardFailures,
    qualityFailures: findings.qualityFailures,
    operationalWarnings: findings.operationalWarnings,
    metricComparisons: aggregate,
    perCaseRegressions,
  };
  return RagComparisonReportSchema.parse({
    comparisonReportVersion: RAG_COMPARISON_REPORT_VERSION,
    generatedAt: (options.generatedAt ?? new Date()).toISOString(),
    baseline: {
      experiment: baseline.experiment,
      configurationIdentity: baseline.identity,
      configuration: comparisonConfiguration(baseline.report),
    },
    candidate: {
      experiment: candidate.experiment,
      configurationIdentity: candidate.identity,
      configuration: comparisonConfiguration(candidate.report),
    },
    compatibility: {
      reportVersion: baselineReport.reportVersion,
      datasetVersion: baselineReport.datasetVersion,
      metricSemanticsVersion: compatibility.metricSemanticsVersion,
      metricTopK: compatibility.metricTopK,
      evaluationCaseIds: compatibility.caseIds,
    },
    regressionPolicy: policy,
    aggregateDeltas: aggregate,
    securityFindings: findings.hardFailures.filter((entry) =>
      entry.code.includes("AUTHORIZATION") || entry.code.includes("SOURCE"),
    ),
    qualityFindings: [
      ...findings.hardFailures.filter(
        (entry) =>
          !entry.code.includes("AUTHORIZATION") &&
          !entry.code.includes("SOURCE"),
      ),
      ...findings.qualityFailures,
    ],
    operationalFindings: findings.operationalFindings,
    perCaseComparisons: perCase,
    gate,
  });
}
