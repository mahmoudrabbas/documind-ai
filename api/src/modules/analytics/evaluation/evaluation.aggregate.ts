import {
  RagAggregateMetricsSchema,
  type RagAggregateMetrics,
  type RagEvaluationResult,
  type RetrievalLevelMetrics,
} from "./evaluation.schemas.js";

function mean(values: readonly number[]): number | null {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null;
}

function primaryRetrievalMetric(result: RagEvaluationResult): RetrievalLevelMetrics | null {
  if (result.contextRelevance.chunk.evaluated) return result.contextRelevance.chunk;
  if (result.contextRelevance.document.evaluated) return result.contextRelevance.document;
  return null;
}

/** Pure, deterministic aggregation suitable for reproducible configuration reports. */
export function aggregateRagEvaluationResults(
  results: readonly RagEvaluationResult[],
): RagAggregateMetrics {
  const retrieval = results.flatMap((result) => {
    const metric = primaryRetrievalMetric(result);
    return metric ? [metric] : [];
  });
  const grounded = results.filter(
    (result) =>
      result.groundedness.evaluated &&
      result.groundedness.factualClaimCount > 0,
  );
  const claimSupportRates = grounded.flatMap((result) =>
    result.groundedness.claimSupportRate === null
      ? []
      : [result.groundedness.claimSupportRate],
  );
  const relevanceScores = results.flatMap((result) =>
    result.answerRelevance.evaluated && result.answerRelevance.score !== null
      ? [result.answerRelevance.score]
      : [],
  );
  const correctnessLabeled = results.filter((result) => result.correctness.required);
  const correctness = correctnessLabeled.filter((result) => result.correctness.evaluated);
  const releaseRefusal = results.filter(
    (result) =>
      result.expectedOutcome === "release" || result.expectedOutcome === "refuse",
  );
  const latencies = results.flatMap((result) =>
    result.operational.latencyMs === undefined ? [] : [result.operational.latencyMs],
  );
  const tokens = results.flatMap((result) =>
    result.operational.tokens === undefined ? [] : [result.operational.tokens],
  );
  const costs = results.flatMap((result) =>
    result.operational.estimatedCost === undefined
      ? []
      : [result.operational.estimatedCost],
  );
  const authorizationViolationCount = results.reduce(
    (sum, result) => sum + result.authorizationViolations.length,
    0,
  );

  return RagAggregateMetricsSchema.parse({
    caseCount: results.length,
    passedCaseCount: results.filter((result) => result.casePassed).length,
    casePassRate:
      results.length > 0
        ? results.filter((result) => result.casePassed).length / results.length
        : 0,
    retrievalEvaluatedCaseCount: retrieval.length,
    retrievalHitRate: mean(retrieval.map((metric) => (metric.hit ? 1 : 0))),
    meanPrecisionAtK: mean(
      retrieval.flatMap((metric) =>
        metric.precision === null ? [] : [metric.precision],
      ),
    ),
    meanRecallAtK: mean(
      retrieval.flatMap((metric) => (metric.recall === null ? [] : [metric.recall])),
    ),
    mrr: mean(
      retrieval.flatMap((metric) =>
        metric.reciprocalRank === null ? [] : [metric.reciprocalRank],
      ),
    ),
    groundedEvaluatedCaseCount: grounded.length,
    groundedAnswerRate: mean(
      grounded.map((result) => (result.groundedness.fullyGrounded ? 1 : 0)),
    ),
    meanClaimSupportRate: mean(claimSupportRates),
    answerRelevanceEvaluatedCaseCount: relevanceScores.length,
    answerRelevanceUnavailableCaseCount:
      results.length - results.filter((result) => result.answerRelevance.evaluated).length,
    meanAnswerRelevance: mean(relevanceScores),
    correctnessEvaluatedCaseCount: correctness.length,
    correctnessUnavailableCaseCount: correctnessLabeled.length - correctness.length,
    correctAnswerRate: mean(
      correctness.map((result) => result.correctness.status === "correct" ? 1 : 0),
    ),
    retrievalUnavailableCaseCount: results.length - retrieval.length,
    groundedUnavailableCaseCount:
      results.length - results.filter((result) => result.groundedness.evaluated).length,
    executionAvailableCaseCount:
      results.filter((result) => result.execution.status === "completed").length,
    executionUnavailableCaseCount:
      results.filter((result) => result.execution.status === "failed").length,
    releaseRefusalEvaluatedCaseCount: releaseRefusal.length,
    releaseRefusalCorrectness: mean(
      releaseRefusal.map((result) => (result.outcomeCorrect ? 1 : 0)),
    ),
    authorizationViolationCount,
    authorizationInvariantPassed: authorizationViolationCount === 0,
    latency: {
      count: latencies.length,
      minMs: latencies.length > 0 ? Math.min(...latencies) : null,
      maxMs: latencies.length > 0 ? Math.max(...latencies) : null,
      meanMs: mean(latencies),
      p50Ms: percentile(latencies, 0.5),
      p95Ms: percentile(latencies, 0.95),
    },
    tokenSampleCount: tokens.length,
    totalTokens: tokens.reduce((sum, value) => sum + value, 0),
    meanTokens: mean(tokens),
    costSampleCount: costs.length,
    totalEstimatedCost: costs.reduce((sum, value) => sum + value, 0),
    meanEstimatedCost: mean(costs),
  });
}
