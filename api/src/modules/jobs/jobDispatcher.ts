import { Queue, FlowProducer } from "bullmq";
import { type Redis } from "ioredis";
import { logger } from "../../common/logger/logger.js";
import { getRedisClient } from "../../db/redis.js";
import {
  jobEnvelopeSchema,
  validateJobEnvelope,
  buildDedupKey,
  type JobEnvelope,
  type JobStatus,
  type QueueMetrics,
} from "workers/contracts";

export const JOBS_QUEUE_NAME = "documind-jobs";

export interface FlowJobInput {
  jobType: string;
  tenantId: string;
  actorId: string;
  traceId: string;
  idempotencyKey: string;
  payload?: unknown;
  displayName?: string;
  children?: FlowJobInput[];
}

/**
 * API-side producer implementing the JobDispatcher port.
 *
 * The API never imports the worker's runtime — it depends only on the shared
 * contract (`workers/contracts`) for envelope types/validation and emits the
 * same envelope shape the worker consumes. This keeps the workspaces free of
 * circular runtime dependencies.
 */
export class ApiJobDispatcher {
  private queue: Queue;
  private flowProducer: FlowProducer;

  constructor(queue?: Queue) {
    if (queue) {
      this.queue = queue;
      this.flowProducer = null as unknown as FlowProducer;
    } else {
      const redis: Redis = getRedisClient() as unknown as Redis;
      this.queue = new Queue(JOBS_QUEUE_NAME, {
        connection: redis,
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: "exponential", delay: 1000 },
          removeOnComplete: 5000,
          removeOnFail: false,
        },
      });
      this.flowProducer = new FlowProducer({ connection: redis });
    }
  }

  /**
   * Validates the caller-supplied envelope, derives the dedup jobId, and
   * enqueues. Duplicate idempotency keys are suppressed at the Redis layer.
   */
  async enqueue(input: unknown, dependsOn?: string[]): Promise<{
    ok: boolean;
    jobId?: string;
    idempotencyKey?: string;
    deduplicated?: boolean;
    error?: string;
  }> {
    // Normalize producer-boundary defaults before contract validation.
    const normalized = {
      schemaVersion: "1.0.0",
      createdAt: new Date().toISOString(),
      ...(input as Record<string, unknown>),
    };

    const validation = validateJobEnvelope(normalized);
    if (!validation.ok || !validation.value) {
      return { ok: false, error: validation.error };
    }

    const env = validation.value;
    const jobId = buildDedupKey(env.jobType, env.idempotencyKey);

    const existing = await this.queue.getJob(jobId);
    if (existing) {
      logger.info(
        { jobType: env.jobType, jobId, traceId: env.traceId },
        "duplicate job suppressed (idempotency key)",
      );
      return {
        ok: true,
        jobId,
        idempotencyKey: env.idempotencyKey,
        deduplicated: true,
      };
    }

    const job = await this.queue.add(env.jobType, env, {
      jobId,
      priority: env.priority,
      delay: env.scheduledFor
        ? Math.max(0, Date.parse(env.scheduledFor) - Date.now())
        : undefined,
      ...(dependsOn && dependsOn.length > 0 ? { dependsOn } : {}),
    });

    logger.info(
      { jobType: env.jobType, jobId: job.id, traceId: env.traceId },
      "job enqueued",
    );

    return {
      ok: true,
      jobId: job.id ?? jobId,
      idempotencyKey: env.idempotencyKey,
      deduplicated: false,
    };
  }

  /**
   * Enqueue a tree of jobs with proper dependency ordering using FlowProducer.
   * Children must complete before their parent starts processing.
   * Returns the root job ID (the final job in the chain).
   */
  async enqueueFlow(
    root: FlowJobInput,
  ): Promise<{
    ok: boolean;
    jobId?: string;
    error?: string;
  }> {
    try {
      const flowNode = this.buildFlowNode(root);
      const result = await this.flowProducer.add(flowNode);
      const jobId = result.job.id ?? "";

      logger.info(
        { jobType: root.jobType, jobId },
        "flow chain enqueued",
      );

      return { ok: true, jobId };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error({ err: error.message, jobType: root.jobType }, "flow enqueue failed");
      return { ok: false, error: error.message };
    }
  }

  private buildFlowNode(input: FlowJobInput): Parameters<FlowProducer["add"]>[0] {
    const envelope: JobEnvelope = {
      jobType: input.jobType,
      schemaVersion: "1.0.0",
      createdAt: new Date().toISOString(),
      tenantId: input.tenantId,
      actorId: input.actorId,
      traceId: input.traceId,
      idempotencyKey: input.idempotencyKey,
      payload: input.payload ?? {},
      displayName: input.displayName,
    };

    return {
      name: input.jobType,
      data: envelope,
      queueName: JOBS_QUEUE_NAME,
      opts: {
        jobId: buildDedupKey(input.jobType, input.idempotencyKey),
      },
      children: input.children?.map((child) => this.buildFlowNode(child)) ?? [],
    };
  }

  /** Read-only status lookup (Super Admin context only, enforced by route). */
  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;
    const state = (await job.getState()) as JobStatus["state"];
    return {
      jobId,
      jobType: (job.data as JobEnvelope).jobType,
      tenantId: (job.data as JobEnvelope).tenantId,
      actorId: (job.data as JobEnvelope).actorId,
      traceId: (job.data as JobEnvelope).traceId,
      idempotencyKey: (job.data as JobEnvelope).idempotencyKey,
      state,
      attemptsMade: job.attemptsMade ?? 0,
      maxAttempts: job.opts?.attempts ?? 5,
      createdAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
      processedAt: job.processedOn
        ? new Date(job.processedOn).toISOString()
        : null,
      finishedAt: job.finishedOn
        ? new Date(job.finishedOn).toISOString()
        : null,
      failedReason:
        (job.failedReason as string | undefined)?.slice(0, 512) ?? null,
      displayName: ((job.data as JobEnvelope).displayName as string) ?? null,
    };
  }

  async getMetrics(): Promise<QueueMetrics> {
    const counts = await this.queue.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "completed",
      "failed",
    );
    return {
      queue: JOBS_QUEUE_NAME,
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      retrying: 0,
      avgProcessingMs: 0,
    };
  }

  /** Replay a dead-lettered job (Super Admin only). */
  async replayJob(jobId: string): Promise<boolean> {
    const job = await this.queue.getJob(jobId);
    if (!job) return false;
    if ((await job.getState()) !== "failed") return false;
    await job.retry();
    return true;
  }

  async close(): Promise<void> {
    await this.queue.close();
    await this.flowProducer.close();
  }
}

let singleton: ApiJobDispatcher | null = null;

export function getApiJobDispatcher(): ApiJobDispatcher {
  if (!singleton) singleton = new ApiJobDispatcher();
  return singleton;
}

export async function closeApiJobDispatcher(): Promise<void> {
  if (singleton) {
    await singleton.close();
    singleton = null;
  }
}

export { jobEnvelopeSchema };
