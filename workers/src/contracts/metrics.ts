import { logger } from "../logger.js";
import type { QueueMetrics } from "./jobEnvelope.js";

/**
 * Rolling-window tracker for processing durations. Kept in-memory per worker
 * process; the adapter reports the running average via getMetrics().
 */
export class ProcessingDurationTracker {
  private readonly samples: number[] = [];
  private readonly maxSamples: number;

  constructor(maxSamples = 100) {
    this.maxSamples = maxSamples;
  }

  record(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.samples.push(ms);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  average(): number {
    if (this.samples.length === 0) return 0;
    const sum = this.samples.reduce((acc, v) => acc + v, 0);
    return Math.round(sum / this.samples.length);
  }
}

/**
 * Publishes queue metrics in a consistent, adapter-agnostic way.
 * Metrics are emitted as structured logs with the same metric names the
 * Super Admin status endpoint consumes.
 */
export function publishQueueMetrics(metrics: QueueMetrics): void {
  logger.info(
    {
      metric: "queue.metrics",
      queue: metrics.queue,
      waiting: metrics.waiting,
      active: metrics.active,
      delayed: metrics.delayed,
      completed: metrics.completed,
      failed: metrics.failed,
      retrying: metrics.retrying,
      avgProcessingMs: metrics.avgProcessingMs,
    },
    "queue metrics snapshot",
  );
}

export function publishJobEvent(params: {
  traceId: string;
  jobType: string;
  tenantId: string;
  actorId: string;
  event:
    | "enqueue"
    | "start"
    | "progress"
    | "success"
    | "failure"
    | "retry"
    | "dead-letter";
  attemptsMade?: number;
  data?: Record<string, unknown>;
}): void {
  logger.info(
    {
      metric: `job.${params.event}`,
      traceId: params.traceId,
      jobType: params.jobType,
      tenantId: params.tenantId,
      actorId: params.actorId,
      attemptsMade: params.attemptsMade,
      ...params.data,
    },
    `job ${params.event}`,
  );
}
