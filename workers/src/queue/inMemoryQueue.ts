import { randomUUID } from "node:crypto";
import type {
  JobDispatcher,
  JobEnvelope,
  JobStatus,
  QueueMetrics,
  JobHandlerDefinition,
  RetryPolicy,
} from "@documind/contracts";
import { buildDedupKey, DEFAULT_RETRY_POLICY } from "@documind/contracts";
import { ProcessingDurationTracker, publishJobEvent } from "./metrics.js";
import { executeHandler, type ExecutionOutcome } from "./handlerRegistry.js";

interface StoredJob {
  jobId: string;
  envelope: JobEnvelope;
  deduplicated: boolean;
  attemptsMade: number;
  maxAttempts: number;
  state: JobStatus["state"];
  createdAt: string | null;
  processedAt: string | null;
  finishedAt: string | null;
  failedReason: string | null;
}

export class InMemoryQueue implements JobDispatcher {
  private readonly jobs = new Map<string, StoredJob>();
  private readonly dedup = new Set<string>();
  private readonly handlers = new Map<string, JobHandlerDefinition>();
  private readonly processing = new ProcessingDurationTracker();
  private consumerTimer: NodeJS.Timeout | null = null;
  private readonly abortController = new AbortController();
  private running = false;
  private readonly queueName: string;

  constructor(
    private readonly policy: RetryPolicy = DEFAULT_RETRY_POLICY,
    queueName = "inmemory",
  ) {
    this.queueName = queueName;
  }

  registerHandler(definition: JobHandlerDefinition): void {
    this.handlers.set(definition.jobType, definition);
  }

  async enqueue(input: Parameters<JobDispatcher["enqueue"]>[0]): Promise<{
    jobId: string;
    idempotencyKey: string;
    deduplicated: boolean;
  }> {
    const key = buildDedupKey(input.jobType, input.idempotencyKey);
    const deduplicated = this.dedup.has(key);

    const envelope: JobEnvelope = {
      jobType: input.jobType,
      schemaVersion: input.schemaVersion ?? "1.0.0",
      tenantId: input.tenantId,
      actorId: input.actorId,
      traceId: input.traceId,
      idempotencyKey: input.idempotencyKey,
      payload: input.payload ?? {},
      createdAt: new Date().toISOString(),
      priority: input.options?.priority ?? input.priority,
      scheduledFor: input.options?.scheduledFor ?? input.scheduledFor,
      displayName: input.options?.displayName ?? input.displayName,
    };

    if (deduplicated) {
      publishJobEvent({
        traceId: envelope.traceId,
        jobType: envelope.jobType,
        tenantId: envelope.tenantId,
        actorId: envelope.actorId,
        event: "enqueue",
        data: { deduplicated: true },
      });
      const existing = [...this.jobs.values()].find(
        (j) => j.envelope.idempotencyKey === envelope.idempotencyKey,
      );
      return {
        jobId: existing?.jobId ?? `dup:${randomUUID()}`,
        idempotencyKey: envelope.idempotencyKey,
        deduplicated: true,
      };
    }

    this.dedup.add(key);
    const jobId = `job:${randomUUID()}`;
    this.jobs.set(jobId, {
      jobId,
      envelope,
      deduplicated: false,
      attemptsMade: 0,
      maxAttempts: this.policy.maxAttempts,
      state: envelope.scheduledFor ? "delayed" : "waiting",
      createdAt: envelope.createdAt,
      processedAt: null,
      finishedAt: null,
      failedReason: null,
    });

    publishJobEvent({
      traceId: envelope.traceId,
      jobType: envelope.jobType,
      tenantId: envelope.tenantId,
      actorId: envelope.actorId,
      event: "enqueue",
      data: { deduplicated: false, jobId },
    });

    return { jobId, idempotencyKey: envelope.idempotencyKey, deduplicated: false };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const tick = () => {
      if (this.abortController.signal.aborted) return;
      void this.drain().finally(() => {
        if (!this.abortController.signal.aborted) {
          this.consumerTimer = setTimeout(tick, 50);
        }
      });
    };
    this.consumerTimer = setTimeout(tick, 0);
  }

  stop(): void {
    this.running = false;
    this.abortController.abort();
    if (this.consumerTimer) clearTimeout(this.consumerTimer);
    this.consumerTimer = null;
  }

  isConsumerRunning(): boolean {
    return this.running && !this.abortController.signal.aborted;
  }

  private async drain(): Promise<void> {
    for (const job of this.jobs.values()) {
      if (this.abortController.signal.aborted) return;
      if (job.state !== "waiting" && job.state !== "delayed") continue;
      if (job.envelope.scheduledFor) {
        const due = Date.parse(job.envelope.scheduledFor);
        if (Number.isFinite(due) && due > Date.now()) continue;
      }
      await this.processOne(job);
    }
  }

  private async processOne(job: StoredJob): Promise<void> {
    const handler = this.handlers.get(job.envelope.jobType);
    if (!handler) {
      job.state = "failed";
      job.finishedAt = new Date().toISOString();
      job.failedReason = `no handler registered for ${job.envelope.jobType}`;
      return;
    }

    job.state = "active";
    job.processedAt = new Date().toISOString();
    const start = Date.now();

    const ctx = {
      envelope: job.envelope,
      traceId: job.envelope.traceId,
      isRetry: job.attemptsMade > 0,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.maxAttempts,
      signal: this.abortController.signal,
      progress: (message: string, data?: Record<string, unknown>) =>
        publishJobEvent({
          traceId: job.envelope.traceId,
          jobType: job.envelope.jobType,
          tenantId: job.envelope.tenantId,
          actorId: job.envelope.actorId,
          event: "progress",
          attemptsMade: job.attemptsMade,
          data: { message, ...data },
        }),
    };

    const outcome: ExecutionOutcome = await executeHandler(handler, ctx, this.policy);
    const durationMs = Date.now() - start;
    this.processing.record(durationMs);

    job.attemptsMade += 1;

    if (outcome.ok) {
      job.state = "completed";
      job.finishedAt = new Date().toISOString();
    } else if (outcome.deadLettered) {
      job.state = "failed";
      job.finishedAt = new Date().toISOString();
      job.failedReason = outcome.failedReason ?? "dead-lettered";
    } else if (outcome.shouldRetry) {
      job.state = "waiting";
      job.failedReason = outcome.failedReason ?? null;
    }
  }

  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    return this.toStatus(job);
  }

  async getMetrics(): Promise<QueueMetrics> {
    let waiting = 0;
    let active = 0;
    let delayed = 0;
    let completed = 0;
    let failed = 0;
    let retrying = 0;

    for (const job of this.jobs.values()) {
      switch (job.state) {
        case "waiting":
          waiting += 1;
          break;
        case "active":
          active += 1;
          break;
        case "delayed":
          delayed += 1;
          break;
        case "completed":
          completed += 1;
          break;
        case "failed":
          failed += 1;
          break;
      }
      if (job.state === "active" && job.attemptsMade > 0) retrying += 1;
    }

    return {
      queue: this.queueName,
      waiting,
      active,
      delayed,
      completed,
      failed,
      retrying,
      avgProcessingMs: this.processing.average(),
    };
  }

  private toStatus(job: StoredJob): JobStatus {
    return {
      jobId: job.jobId,
      jobType: job.envelope.jobType,
      tenantId: job.envelope.tenantId,
      actorId: job.envelope.actorId,
      traceId: job.envelope.traceId,
      idempotencyKey: job.envelope.idempotencyKey,
      state: job.state,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.maxAttempts,
      createdAt: job.createdAt,
      processedAt: job.processedAt,
      finishedAt: job.finishedAt,
      failedReason: job.failedReason,
      displayName: job.envelope.displayName ?? null,
    };
  }
}
