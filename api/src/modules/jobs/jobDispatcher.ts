import { Queue } from "bullmq";
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
} from "@documind/contracts";

export const JOBS_QUEUE_NAME = "documind-jobs";

export class ApiJobDispatcher {
  private queue: Queue;

  constructor(queue?: Queue) {
    if (queue) {
      this.queue = queue;
      return;
    }
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
  }

  async enqueue(input: unknown): Promise<{
    ok: boolean;
    jobId?: string;
    idempotencyKey?: string;
    deduplicated?: boolean;
    error?: string;
  }> {
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

  async replayJob(jobId: string): Promise<boolean> {
    const job = await this.queue.getJob(jobId);
    if (!job) return false;
    if ((await job.getState()) !== "failed") return false;
    await job.retry();
    return true;
  }
}

let singleton: ApiJobDispatcher | null = null;

export function getApiJobDispatcher(): ApiJobDispatcher {
  if (!singleton) singleton = new ApiJobDispatcher();
  return singleton;
}

export { jobEnvelopeSchema };
