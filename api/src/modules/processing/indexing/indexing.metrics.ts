import type { MetricRecorder } from "../../../common/observability/metricRecorder.js";

export function recordGenerationStarted(
  recorder: MetricRecorder,
  tags: { triggeredBy: string; tenantId: string },
): void {
  recorder.increment("indexing.generation_started", {
    triggeredBy: tags.triggeredBy,
    tenantId: tags.tenantId,
  });
}

export function recordGenerationActivated(
  recorder: MetricRecorder,
  tags: { tenantId: string },
): void {
  recorder.increment("indexing.generation_activated", {
    tenantId: tags.tenantId,
  });
}

export function recordGenerationFailed(
  recorder: MetricRecorder,
  tags: { stage: string; code: string; tenantId: string },
): void {
  recorder.increment("indexing.generation_failed", {
    stage: tags.stage,
    code: tags.code,
    tenantId: tags.tenantId,
  });
}

export function recordGenerationRolledBack(
  recorder: MetricRecorder,
  tags: { tenantId: string },
): void {
  recorder.increment("indexing.generation_rolled_back", {
    tenantId: tags.tenantId,
  });
}

export function recordVerificationResult(
  recorder: MetricRecorder,
  tags: { verified: string; tenantId: string },
): void {
  recorder.increment("indexing.verification_result", {
    verified: tags.verified,
    tenantId: tags.tenantId,
  });
}

export function recordChunkingMetrics(
  recorder: MetricRecorder,
  tags: { tenantId: string; strategy?: string },
  chunkCount: number,
  pageCount: number,
  durationMs: number,
): void {
  recorder.increment("indexing.chunks_created", { tenantId: tags.tenantId, strategy: tags.strategy ?? "unknown" });
  recorder.histogram("indexing.chunk_count", chunkCount, { tenantId: tags.tenantId });
  recorder.histogram("indexing.chunk_page_count", pageCount, { tenantId: tags.tenantId });
  recorder.histogram("indexing.chunk_duration_ms", durationMs, { tenantId: tags.tenantId });
}

export function recordEmbeddingMetrics(
  recorder: MetricRecorder,
  tags: { tenantId: string; model: string },
  embeddedCount: number,
  failedCount: number,
  totalTokens: number,
  totalCostUsd: number,
  durationMs: number,
): void {
  recorder.increment("indexing.embeddings_generated", {
    tenantId: tags.tenantId,
    model: tags.model,
  });
  if (failedCount > 0) {
    recorder.increment("indexing.embedding_batch_failures", {
      tenantId: tags.tenantId,
      model: tags.model,
    });
  }
  recorder.histogram("indexing.embedding_count", embeddedCount, { tenantId: tags.tenantId });
  recorder.histogram("indexing.embedding_tokens", totalTokens, { tenantId: tags.tenantId, model: tags.model });
  recorder.histogram("indexing.embedding_cost_usd", totalCostUsd, { tenantId: tags.tenantId, model: tags.model });
  recorder.histogram("indexing.embedding_duration_ms", durationMs, { tenantId: tags.tenantId });
}

export function recordIndexMetrics(
  recorder: MetricRecorder,
  tags: { tenantId: string; vectorStatus: string; keywordStatus: string },
  durationMs: number,
): void {
  recorder.increment("indexing.index_completed", {
    tenantId: tags.tenantId,
    vectorStatus: tags.vectorStatus,
    keywordStatus: tags.keywordStatus,
  });
  recorder.histogram("indexing.index_duration_ms", durationMs, { tenantId: tags.tenantId });
}

export function recordRetryAttempt(
  recorder: MetricRecorder,
  tags: { jobType: string; tenantId: string; attempt: number },
): void {
  recorder.increment("indexing.retry_attempt", {
    jobType: tags.jobType,
    tenantId: tags.tenantId,
    attempt: String(tags.attempt),
  });
}
