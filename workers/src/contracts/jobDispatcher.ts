/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from "zod";
import type { JobEnvelope, JobStatus, QueueMetrics } from "./jobEnvelope.js";

/**
 * The stable, vendor-agnostic dispatch port.
 *
 * Product modules depend ONLY on this interface (and `JobEnvelope`) — never on
 * BullMQ or any queue adapter directly. This satisfies the parallel-safety
 * contract: feature teams can build typed jobs against `JobDispatcher` before
 * the real worker consumer is merged.
 */
export interface EnqueueOptions {
  /** Override numeric priority (higher = sooner). */
  priority?: number;
  /** ISO-8601 delayed-until timestamp. */
  scheduledFor?: string;
  /** Optional caller label (never a secret). */
  displayName?: string;
}

export interface EnqueueResult {
  /** Queue-native job id (never contains secrets or payloads). */
  jobId: string;
  /** Echo of the idempotency key used for dedup. */
  idempotencyKey: string;
  /** True when the job was a duplicate and was suppressed. */
  deduplicated: boolean;
}

export interface JobDispatcher {
  /**
   * Enqueue a versioned, traceable, idempotent job.
   *
   * Idempotency is enforced by `idempotencyKey`: a duplicate dispatch with the
   * same key (and jobType) must not create a second executing job.
   */
  enqueue(
    input: Omit<JobEnvelope, "schemaVersion" | "createdAt" | "payload"> & {
      schemaVersion?: JobEnvelope["schemaVersion"];
      payload?: unknown;
      options?: EnqueueOptions;
    },
  ): Promise<EnqueueResult>;

  /**
   * Inspect the current status of a job. Restricted to Super Admin contexts
   * by the API layer; the dispatcher itself only performs reads.
   */
  getJobStatus(jobId: string): Promise<JobStatus | null>;

  /** Aggregate metrics for the queue (Super Admin diagnostic view). */
  getMetrics(): Promise<QueueMetrics>;
}

/**
 * Base context passed to every handler at execution time.
 * Handlers MUST revalidate tenantId/resource identifiers from this context
 * and never trust the envelope payload's authorization claims.
 */
export interface JobHandlerContext {
  envelope: JobEnvelope;
  traceId: string;
  /** True when this is a retry attempt (attemptsMade > 0). */
  isRetry: boolean;
  attemptsMade: number;
  maxAttempts: number;
  /** Abort signal fired on graceful shutdown / job cancellation. */
  signal: AbortSignal;
  /** Record a structured progress event (same traceId is attached). */
  progress(message: string, data?: Record<string, unknown>): void;
}

export interface JobHandlerResult {
  /** Optional small, non-secret summary stored on completion. */
  summary?: Record<string, unknown>;
}

/**
 * A typed job handler registration. The `payloadSchema` provides runtime
 * validation before execution; invalid payloads fail permanently (no retry).
 */
export interface JobHandlerDefinition<TPayload = unknown> {
  jobType: string;
  /** Human-readable description (no secrets). */
  description: string;
  /** Zod schema validating the envelope payload at execution time. */
  payloadSchema: z.ZodType<TPayload>;
  /** Handler implementation. May be async; must respect `signal`. */
  handle: (
    payload: TPayload,
    ctx: JobHandlerContext,
  ) => Promise<JobHandlerResult | void>;
  /**
   * Number of attempts before dead-lettering. Defaults to the queue default
   * when omitted.
   */
  maxAttempts?: number;
}

export interface JobHandlerRegistry {
  register(definition: JobHandlerDefinition<any>): void;
  get(jobType: string): JobHandlerDefinition<any> | undefined;
  has(jobType: string): boolean;
  list(): ReadonlyArray<JobHandlerDefinition<any>>;
}
