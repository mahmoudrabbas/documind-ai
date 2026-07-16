import { Queue, Worker, type Job, type Processor } from "bullmq";
import type { Redis } from "ioredis";
import { logger } from "../logger.js";
import type {
  JobDispatcher,
  JobEnvelope,
  JobStatus,
  QueueMetrics,
  JobHandlerDefinition,
  RetryPolicy,
} from "@documind/contracts";
import {
  buildDedupKey,
  generateTraceId,
  DEFAULT_RETRY_POLICY,
  RetryableJobError,
  PermanentJobError,
} from "@documind/contracts";
import { ProcessingDurationTracker, publishJobEvent } from "./metrics.js";
import { executeHandler, type ExecutionOutcome } from "./handlerRegistry.js";

export interface BullMQAdapterOptions {
  queueName: string;
  connection: Redis;
  policy?: RetryPolicy;
  removeOnComplete?: number | boolean;
  removeOnFail?: number | boolean;
  concurrency?: number;
}

export class BullMQQueue implements JobDispatcher {
  readonly queue: Queue;
  private worker: Worker | null = null;
  private readonly policy: RetryPolicy;
  private readonly handlers = new Map<string, JobHandlerDefinition>();
  private readonly processing = new ProcessingDurationTracker();
  private readonly queueName: string;
  private readonly connection: Redis;
  private readonly removeOnComplete: number | boolean;
  private readonly removeOnFail: number | boolean;
  private readonly concurrency: number;
  private consumerRunning = false;

  constructor(opts: BullMQAdapterOptions) {
    this.queueName = opts.queueName;
    this.connection = opts.connection;
    this.policy = opts.policy ?? DEFAULT_RETRY_POLICY;
    this.removeOnComplete = opts.removeOnComplete ?? 5000;
    this.removeOnFail = opts.removeOnFail ?? false;
    this.concurrency = opts.concurrency ?? 1;
    this.queue = new Queue(this.queueName, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: this.policy.maxAttempts,
        backoff: { type: "custom" },
        removeOnComplete: this.removeOnComplete,
        removeOnFail: this.removeOnFail,
        sizeLimit: 256 * 1024,
      },
    });
  }

  registerHandler(definition: JobHandlerDefinition): void {
    this.handlers.set(definition.jobType, definition);
  }

  async enqueue(
    input: Parameters<JobDispatcher["enqueue"]>[0],
  ): Promise<{ jobId: string; idempotencyKey: string; deduplicated: boolean }> {
    const jobId = buildDedupKey(input.jobType, input.idempotencyKey);

    const envelope: JobEnvelope = {
      jobType: input.jobType,
      schemaVersion: input.schemaVersion ?? "1.0.0",
      tenantId: input.tenantId,
      actorId: input.actorId,
      traceId: input.traceId || generateTraceId(),
      idempotencyKey: input.idempotencyKey,
      payload: input.payload ?? {},
      createdAt: new Date().toISOString(),
      priority: input.options?.priority ?? input.priority,
      scheduledFor: input.options?.scheduledFor ?? input.scheduledFor,
      displayName: input.options?.displayName ?? input.displayName,
    };

    const existing = await this.queue.getJob(jobId);
    if (existing) {
      publishJobEvent({
        traceId: envelope.traceId,
        jobType: envelope.jobType,
        tenantId: envelope.tenantId,
        actorId: envelope.actorId,
        event: "enqueue",
        data: { deduplicated: true, jobId },
      });
      return { jobId, idempotencyKey: envelope.idempotencyKey, deduplicated: true };
    }

    const job = await this.queue.add(input.jobType, envelope, {
      jobId,
      priority: envelope.priority,
      delay: envelope.scheduledFor
        ? Math.max(0, Date.parse(envelope.scheduledFor) - Date.now())
        : undefined,
    });

    publishJobEvent({
      traceId: envelope.traceId,
      jobType: envelope.jobType,
      tenantId: envelope.tenantId,
      actorId: envelope.actorId,
      event: "enqueue",
      data: { deduplicated: false, jobId: job.id },
    });

    return {
      jobId: job.id ?? jobId,
      idempotencyKey: envelope.idempotencyKey,
      deduplicated: false,
    };
  }

  start(signal?: AbortSignal): void {
    if (this.worker) return;

    const processor: Processor<JobEnvelope> = async (job: Job) => {
      const handler = this.handlers.get(job.data.jobType);
      if (!handler) {
        throw new PermanentJobError(
          `no handler registered for ${job.data.jobType}`,
        );
      }

      const start = Date.now();
      const ctx = {
        envelope: job.data,
        traceId: job.data.traceId,
        isRetry: (job.attemptsMade ?? 0) > 0,
        attemptsMade: job.attemptsMade ?? 0,
        maxAttempts: this.policy.maxAttempts,
        signal: signal ?? new AbortController().signal,
        progress: (message: string, data?: Record<string, unknown>) =>
          publishJobEvent({
            traceId: job.data.traceId,
            jobType: job.data.jobType,
            tenantId: job.data.tenantId,
            actorId: job.data.actorId,
            event: "progress",
            attemptsMade: job.attemptsMade ?? 0,
            data: { message, ...data },
          }),
      };

      const outcome: ExecutionOutcome = await executeHandler(
        handler,
        ctx,
        this.policy,
      );

      this.processing.record(Date.now() - start);

      if (outcome.ok) {
        return;
      }

      if (outcome.deadLettered) {
        try {
          await job.discard();
        } catch {
          // discard is best-effort
        }
        throw new PermanentJobError(outcome.failedReason ?? "dead-lettered");
      }

      throw new RetryableJobError(outcome.failedReason ?? "retryable failure");
    };

    this.worker = new Worker(this.queueName, processor, {
      connection: this.connection,
      concurrency: this.concurrency,
      settings: {
        backoffStrategy: (attemptsMade: number) =>
          computeBackoff(attemptsMade, this.policy),
      },
    });

    this.worker.on("completed", (job) => {
      publishJobEvent({
        traceId: (job.data as JobEnvelope).traceId,
        jobType: (job.data as JobEnvelope).jobType,
        tenantId: (job.data as JobEnvelope).tenantId,
        actorId: (job.data as JobEnvelope).actorId,
        event: "success",
        attemptsMade: job.attemptsMade,
      });
    });

    this.worker.on("failed", (job, err) => {
      if (!job) return;
      const data = job.data as JobEnvelope;
      const attemptsMade = job.attemptsMade ?? 0;
      const willRetry = attemptsMade < this.policy.maxAttempts;
      publishJobEvent({
        traceId: data.traceId,
        jobType: data.jobType,
        tenantId: data.tenantId,
        actorId: data.actorId,
        event: willRetry ? "retry" : "dead-letter",
        attemptsMade,
        data: { reason: err?.message },
      });
    });

    this.consumerRunning = true;
    logger.info(
      { queue: this.queueName, concurrency: this.concurrency },
      "bullmq worker started",
    );
  }

  async stop(): Promise<void> {
    this.consumerRunning = false;
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    logger.info({ queue: this.queueName }, "bullmq worker stopped");
  }

  isConsumerRunning(): boolean {
    return this.consumerRunning && this.worker !== null;
  }

  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;

    const state = (await job.getState()) as JobStatus["state"];
    const attemptsMade = job.attemptsMade ?? 0;
    const failedReason =
      (job.failedReason as string | undefined)?.slice(0, 512) ?? null;

    return {
      jobId,
      jobType: (job.data as JobEnvelope).jobType,
      tenantId: (job.data as JobEnvelope).tenantId,
      actorId: (job.data as JobEnvelope).actorId,
      traceId: (job.data as JobEnvelope).traceId,
      idempotencyKey: (job.data as JobEnvelope).idempotencyKey,
      state,
      attemptsMade,
      maxAttempts: attemptsMade + (job.opts?.attempts ?? this.policy.maxAttempts),
      createdAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
      processedAt: job.processedOn
        ? new Date(job.processedOn).toISOString()
        : null,
      finishedAt: job.finishedOn
        ? new Date(job.finishedOn).toISOString()
        : null,
      failedReason,
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

    let retrying = 0;
    try {
      const active = await this.queue.getJobs("active", 0, 50);
      for (const j of active) {
        if ((j.attemptsMade ?? 0) > 0) retrying += 1;
      }
    } catch {
      retrying = 0;
    }

    return {
      queue: this.queueName,
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      retrying,
      avgProcessingMs: this.processing.average(),
    };
  }

  async replayJob(jobId: string): Promise<boolean> {
    const job = await this.queue.getJob(jobId);
    if (!job) return false;
    const state = await job.getState();
    if (state !== "failed") return false;
    await job.retry();
    return true;
  }

  async close(): Promise<void> {
    await this.stop();
    await this.queue.close();
    try {
      if (this.connection.status !== "end") {
        this.connection.disconnect();
      }
    } catch {
      // best-effort teardown
    }
  }
}

function computeBackoff(attemptsMade: number, policy: RetryPolicy): number {
  const exponent = Math.max(0, attemptsMade);
  const delay = policy.baseDelayMs * policy.backoffFactor ** exponent;
  return Math.min(Math.round(delay), policy.maxDelayMs);
}
