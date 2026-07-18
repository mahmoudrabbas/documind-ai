import { Counter, Histogram, Registry } from "prom-client";

/**
 * Singleton registry for worker-side Prometheus metrics.
 * Separate from the API process registry since the worker runs as its own process.
 */
const registry = new Registry();

// ─── Counters ──────────────────────────────────────────────────────────────

export const importBatchesCreated = new Counter({
  name: "import_batches_created_total",
  help: "Total number of import batches created",
  labelNames: ["tenant_id"] as const,
  registers: [registry],
});

export const importBatchesConfirmed = new Counter({
  name: "import_batches_confirmed_total",
  help: "Total number of import batches confirmed (enqueued for processing)",
  labelNames: [] as readonly string[],
  registers: [registry],
});

export const importBatchesCompleted = new Counter({
  name: "import_batches_completed_total",
  help: "Total number of import batches reaching a terminal state",
  labelNames: ["state"] as const,
  registers: [registry],
});

// ─── Histogram ─────────────────────────────────────────────────────────────

export const importBatchProcessingDuration = new Histogram({
  name: "import_batch_processing_duration_seconds",
  help: "Duration of import batch processing from QUEUED to terminal state (seconds)",
  labelNames: ["state", "tenant_id"] as const,
  buckets: [1, 5, 15, 30, 60, 120, 300, 600, 1800, 3600],
  registers: [registry],
});

// ─── Row counter ───────────────────────────────────────────────────────────

export const importRowsProcessed = new Counter({
  name: "import_rows_processed_total",
  help: "Total number of import rows processed",
  labelNames: ["state"] as const,
  registers: [registry],
});

/**
 * Returns all worker metrics in Prometheus text format.
 * Can be used to expose a /metrics endpoint if the worker ever serves HTTP.
 */
export async function getWorkerMetrics(): Promise<string> {
  return registry.metrics();
}
