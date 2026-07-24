import type { MetricRecorder } from "../../common/observability/metricRecorder.js";
import type { EvidenceBundle } from "./reranker.types.js";

/**
 * Record reranker observability metrics.
 *
 * Metrics follow the same pattern as intent-query.metrics.ts:
 * - Counters for discrete events (invocations, fallbacks, conflicts)
 * - Histograms for continuous values (latency, reduction ratio, token count)
 * - Gauges for point-in-time state (sufficiency level)
 */
export function recordRerankerMetrics(
  recorder: MetricRecorder,
  params: {
    providerKey: string;
    inputCandidateCount: number;
    outputItemCount: number;
    bundle: EvidenceBundle;
    latencyMs: number;
    fallbackUsed: boolean;
    traceId: string;
  },
): void {
  const { providerKey, inputCandidateCount, outputItemCount, bundle, latencyMs, fallbackUsed, traceId } = params;

  const tags = {
    provider: providerKey,
    sufficiency: bundle.sufficiency.level,
    traceId,
  };

  // ── Counters ───────────────────────────────────────────────────────
  recorder.increment("reranker.invoked", tags);

  if (fallbackUsed) {
    recorder.increment("reranker.fallback_used", tags);
  }

  if (bundle.conflictGroups.length > 0) {
    recorder.increment("reranker.conflicts_detected", {
      ...tags,
      conflictCount: String(bundle.conflictGroups.length),
    });
  }

  if (bundle.sufficiency.level === "NO_EVIDENCE") {
    recorder.increment("reranker.no_evidence", tags);
  }

  // ── Histograms ─────────────────────────────────────────────────────
  recorder.histogram("reranker.latency_ms", latencyMs, tags);
  recorder.histogram("reranker.input_candidates", inputCandidateCount, tags);
  recorder.histogram("reranker.output_items", outputItemCount, tags);
  recorder.histogram("reranker.total_tokens", bundle.totalTokenCount, tags);

  // Reduction ratio: 1.0 = no reduction, 0.0 = all candidates removed
  const reductionRatio = inputCandidateCount > 0
    ? outputItemCount / inputCandidateCount
    : 0;
  recorder.histogram("reranker.reduction_ratio", reductionRatio, tags);

  // ── Gauges ─────────────────────────────────────────────────────────
  recorder.gauge("reranker.conflict_groups", bundle.conflictGroups.length, tags);
}
