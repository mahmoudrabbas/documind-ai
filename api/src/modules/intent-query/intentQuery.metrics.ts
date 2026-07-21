import type { MetricRecorder } from "../../common/observability/metricRecorder.js";
import type { QueryPlan } from "./intentQuery.types.js";

/**
 * Helper to record query plan analysis metrics into the current MetricRecorder.
 */
export function recordIntentQueryMetrics(
  recorder: MetricRecorder,
  plan: QueryPlan,
  traceId: string
): void {
  const tags = {
    intent: plan.detectedIntent,
    language: plan.language,
    clarificationNeeded: String(plan.clarificationNeeded),
    fallbackUsed: String(plan.processingMetadata.fallbackUsed),
    traceId,
  };

  // Counters
  recorder.increment("intent_query.analyzed", tags);
  if (plan.clarificationNeeded) {
    recorder.increment("intent_query.clarification_rate", tags);
  }
  if (plan.processingMetadata.fallbackUsed) {
    recorder.increment("intent_query.fallback_used", tags);
  }

  // Histograms / Gauges
  recorder.histogram("intent_query.confidence", plan.intentConfidence, { intent: plan.detectedIntent });
  recorder.histogram("intent_query.latency_ms", plan.processingMetadata.latencyMs, tags);
  recorder.histogram("intent_query.tokens_used", plan.processingMetadata.tokensUsed, tags);
  recorder.histogram("intent_query.estimated_cost", plan.processingMetadata.estimatedCost, tags);
  recorder.histogram("intent_query.semantic_queries_count", plan.semanticQueries.length, tags);
  recorder.histogram("intent_query.keyword_queries_count", plan.keywordQueries.length, tags);
}
