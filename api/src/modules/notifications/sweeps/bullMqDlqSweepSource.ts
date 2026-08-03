/**
 * T20 DLQ sweep source — reads permanently-failed 'notification.dispatch'
 * jobs from the BullMQ queue's failed set (the worker queue the API producer
 * enqueues into). Mirrors the dispatch job's DLQ-write shape
 * (notificationDispatchJob.ts:226-228): the sweep copies jobs that failed
 * without a DLQ entry (e.g. the job dead-lettered while the worker's
 * best-effort DLQ write itself failed). Idempotent via the sink's exists()
 * guard. No worker runtime is imported — only bullmq + the shared contracts.
 */
import { createHash } from "node:crypto";
import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import type { JobEnvelope } from "workers/contracts";
import { getRedisClient } from "../../../db/redis.js";
import { JOBS_QUEUE_NAME } from "../../jobs/jobDispatcher.js";
import type { DlqSource, FailedDispatchJob } from "./notificationSweeps.port.js";

export const NOTIFICATION_DISPATCH_JOB_TYPE = "notification.dispatch";

export class BullMQDlqSweepSource implements DlqSource {
  private readonly queue: Queue;

  constructor(queue?: Queue) {
    this.queue =
      queue ??
      new Queue(JOBS_QUEUE_NAME, {
        connection: getRedisClient() as unknown as Redis,
      });
  }

  async getFailedDispatchJobs(limit: number): Promise<FailedDispatchJob[]> {
    const jobs = await this.queue.getFailed(0, limit);
    const out: FailedDispatchJob[] = [];
    for (const job of jobs) {
      const envelope = job.data as JobEnvelope | undefined;
      if (!envelope || envelope.jobType !== NOTIFICATION_DISPATCH_JOB_TYPE) continue;
      const payload = (envelope.payload ?? {}) as { notificationIds?: unknown };
      const notificationIds = Array.isArray(payload.notificationIds)
        ? payload.notificationIds.map(String)
        : [];
      if (notificationIds.length === 0) continue;
      out.push({
        jobId: String(job.id ?? ""),
        tenantId: envelope.tenantId,
        notificationIds,
        reason: typeof job.failedReason === "string" ? job.failedReason : null,
        payloadHash: hashPayload(envelope.payload),
        failedAt: job.finishedOn ? new Date(job.finishedOn) : null,
      });
    }
    return out;
  }
}

/** Deterministic sha256 fingerprint — byte-identical to the dispatch job's
 *  `hashPayload` so sweep-written and worker-written DLQ entries agree. */
function hashPayload(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value ?? {})).digest("hex");
}
