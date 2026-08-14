import mongoose from "mongoose";
import NotificationOutboxModel, {
  type NotificationOutboxDocument,
} from "../../../db/models/notificationOutbox.model.js";
import { getAuditWriter } from "../../../common/observability/index.js";
import type {
  AuditAction,
  AuditResourceType,
} from "../../../common/observability/auditEvents.js";
import { getApiJobDispatcher } from "../../jobs/jobDispatcher.js";
import { createNotificationDraft, type NotificationDraft } from "../factory/factory.js";
import type { OutboxTriggerPort, TriggerEnvelope } from "../ports/outboxTrigger.port.js";
import {
  NOTIFICATION_DISPATCH_JOB,
  type EnqueueDispatchInput,
  type NotificationEnqueuePort,
} from "../ports/notificationEnqueue.port.js";

const MAX_ATTEMPTS = 5;
const MAX_BATCH = 50;
const CLAIM_MS = 60_000;

/** The notification:updated emit (T15) is a separate socket job — the outbox
 *  dispatcher only decides whether a created batch must be enqueued. */
type DispatchOutcome = "dispatched" | "retry_pending" | "dead_letter";

export interface NotificationCreateResult {
  results: Array<{
    userId: string;
    notificationId: string | null;
    action: "created" | "updated" | "ignored";
  }>;
  createdIds: string[];
  updatedIds: string[];
  ignoredCount: number;
}

export interface NotificationCreatePort {
  /** Persist a drafted notification per recipient. Exact per-recipient result
   *  shape mandated by review round 4 M3. T6 wires the service here. The
   *  tenantId comes from the outbox entry (the draft carries no tenantId — all
   *  metadata schemas are z.strictObject). */
  create(tenantId: string, draft: NotificationDraft, recipientUserIds: string[]): Promise<NotificationCreateResult>;
  /** Apply the "enqueue" lifecycle transition (CREATED → QUEUED) to the
   *  created docs once the 'notification.dispatch' job is enqueued — the
   *  dispatch worker only delivers QUEUED|DISPATCHED docs. Optional so fakes
   *  and pre-T6 callers keep working. */
  markEnqueued?(tenantId: string, notificationIds: string[]): Promise<void>;
}

export interface DispatchTotals {
  claimed: number;
  dispatched: number;
  retryPending: number;
  deadLetter: number;
}

type ClaimedOutboxEntry = Pick<
  NotificationOutboxDocument,
  "tenantId" | "eventId" | "kind" | "notificationType" | "dedupKey" | "actorId" | "payload" | "attempts"
>;

/**
 * Notification outbox dispatcher (T10).
 *
 * The ONLY implementer of OutboxTriggerPort — producers call the port, never
 * this class. Clones the claim/backoff/DLQ structure of
 * documentPolicyPropagation.dispatcher.ts: claims via findOneAndUpdate with an
 * $or expired-claim condition, backoff() = min(60_000, 1000*2**(attempt-1)),
 * dead_letters on the 5th failure (RETRY_EXHAUSTED). Two handlers selected by
 * `kind`:
 *   - trigger → factory (T4) → injected create port → branch on the per-recipient
 *     results (created → enqueue ONE 'notification.dispatch'; updated/ignored →
 *     no enqueue).
 *   - dispatch → mark dispatched (Phase-1 informational; T11 does delivery).
 */
export class NotificationOutboxDispatcher implements OutboxTriggerPort {
  constructor(
    private readonly create: NotificationCreatePort,
    private readonly queue: NotificationEnqueuePort,
  ) {}

  async publishTrigger(event: TriggerEnvelope): Promise<void> {
    try {
      await NotificationOutboxModel.create({
        tenantId: new mongoose.Types.ObjectId(event.tenantId),
        eventId: event.eventId,
        kind: "trigger",
        notificationType: event.type,
        dedupKey: event.dedupKey ?? null,
        actorId: event.actorId,
        payload: { ...event.payload, type: event.type, recipientUserIds: event.recipientUserIds },
        attempts: 0,
        state: "pending",
        nextAttemptAt: new Date(),
      });
    } catch (error) {
      // A job retry re-writing the same occurrence E11000s the unique
      // {tenantId, eventId} index → already-written, idempotent, no double-enqueue.
      if (isDuplicateKeyError(error)) return;
      throw error;
    }
  }

  async dispatchEvent(tenantId: string, eventId: string): Promise<DispatchOutcome | "skipped"> {
    const now = new Date();
    const entry = await NotificationOutboxModel.findOneAndUpdate(
      {
        tenantId,
        eventId,
        $or: [
          { state: { $in: ["pending", "retry_pending"] }, nextAttemptAt: { $lte: now } },
          { state: "dispatching", claimExpiresAt: { $lte: now } },
        ],
      },
      {
        $set: {
          state: "dispatching",
          claimExpiresAt: new Date(now.getTime() + CLAIM_MS),
          failureCode: null,
        },
      },
      { returnDocument: "after" },
    )
      .lean()
      .exec();
    if (!entry) return "skipped";
    return this.process(entry);
  }

  async dispatchPending(tenantId: string, limit = MAX_BATCH): Promise<DispatchTotals> {
    const bounded = Math.max(1, Math.min(MAX_BATCH, Math.trunc(limit)));
    const now = new Date();
    const candidates = await NotificationOutboxModel.find({
      tenantId,
      $or: [
        { state: { $in: ["pending", "retry_pending"] }, nextAttemptAt: { $lte: now } },
        { state: "dispatching", claimExpiresAt: { $lte: now } },
      ],
    })
      .sort({ nextAttemptAt: 1, _id: 1 })
      .limit(bounded)
      .select("tenantId eventId")
      .lean()
      .exec();

    const totals: DispatchTotals = { claimed: 0, dispatched: 0, retryPending: 0, deadLetter: 0 };
    for (const candidate of candidates) {
      const outcome = await this.dispatchEvent(candidate.tenantId.toString(), candidate.eventId);
      if (outcome === "skipped") continue;
      totals.claimed += 1;
      if (outcome === "dispatched") totals.dispatched += 1;
      if (outcome === "retry_pending") totals.retryPending += 1;
      if (outcome === "dead_letter") totals.deadLetter += 1;
    }
    return totals;
  }

  private async process(entry: ClaimedOutboxEntry): Promise<DispatchOutcome> {
    if (entry.kind === "trigger") return this.handleTrigger(entry);
    return this.handleDispatch(entry);
  }

  private async handleTrigger(entry: ClaimedOutboxEntry): Promise<DispatchOutcome> {
    try {
      const payload = isRecord(entry.payload) ? entry.payload : {};
      const draft = createNotificationDraft(payload);
      const recipientUserIds = extractRecipientUserIds(payload);
      const result = await this.create.create(entry.tenantId.toString(), draft, recipientUserIds);

      // 'created' → advance the batch CREATED → QUEUED FIRST, then enqueue ONE
      // 'notification.dispatch' job for it. Order matters: the worker consumes
      // the job near-instantly, and if the docs were still CREATED when it
      // claimed them it would skip them (job contract: delivers QUEUED|DISPATCHED
      // only) — that race permanently lost the toast.
      if (result.createdIds.length > 0) {
        await this.create.markEnqueued?.(entry.tenantId.toString(), result.createdIds);
        await this.queue.enqueueDispatch({
          notificationIds: result.createdIds,
          tenantId: entry.tenantId.toString(),
          traceId: entry.eventId,
          idempotencyKey: entry.eventId,
          actorId: entry.actorId,
        });
      }
      // 'updated' (in-window dedup — notification:updated is T15's job) and
      // 'ignored' → intentionally no enqueue.

      await markDispatched(entry);
      await this.writeDispatchAudit(entry, result);
      return "dispatched";
    } catch {
      return this.fail(entry);
    }
  }

  private async handleDispatch(entry: ClaimedOutboxEntry): Promise<DispatchOutcome> {
    try {
      // Phase-1 informational — the producing side already enqueued the
      // notificationIds; do NOT double-enqueue. T11 delivers.
      await markDispatched(entry);
      await this.writeDispatchAudit(entry, undefined);
      return "dispatched";
    } catch {
      return this.fail(entry);
    }
  }

  private async fail(entry: ClaimedOutboxEntry): Promise<DispatchOutcome> {
    const attempts = entry.attempts + 1;
    const terminal = attempts >= MAX_ATTEMPTS;
    await NotificationOutboxModel.updateOne(
      { tenantId: entry.tenantId, eventId: entry.eventId, state: "dispatching" },
      {
        $set: {
          state: terminal ? "dead_letter" : "retry_pending",
          failureCode: terminal ? "RETRY_EXHAUSTED" : "DISPATCH_FAILED",
          failedAt: terminal ? new Date() : null,
          claimExpiresAt: null,
          nextAttemptAt: new Date(Date.now() + backoff(attempts)),
        },
        $inc: { attempts: 1 },
      },
    ).exec();
    return terminal ? "dead_letter" : "retry_pending";
  }

  private async writeDispatchAudit(
    entry: ClaimedOutboxEntry,
    result: NotificationCreateResult | undefined,
  ): Promise<void> {
    const metadata: Record<string, unknown> = {
      eventId: entry.eventId,
      kind: entry.kind,
      notificationType: entry.notificationType,
      actorId: entry.actorId,
    };
    if (entry.dedupKey) metadata.dedupKey = entry.dedupKey;
    if (result) {
      metadata.createdCount = result.createdIds.length;
      metadata.updatedCount = result.updatedIds.length;
      metadata.ignoredCount = result.ignoredCount;
    }
    await getAuditWriter().write({
      // NOTIFICATION_DISPATCHED is a notification-domain action not yet in the
      // AuditAction union — extended by the notifications todo that owns the
      // audit catalog. The literal is asserted in tests via AuditLogModel.
      action: "NOTIFICATION_DISPATCHED" as AuditAction,
      resourceType: "Notification" as AuditResourceType,
      resourceId: entry.eventId,
      tenantId: entry.tenantId.toString(),
      actorKind: "SYSTEM",
      metadata,
    });
  }
}

/** Real queue port — wraps the API producer (BullMQ Queue, guardrail 17). */
function getRealEnqueuePort(): NotificationEnqueuePort {
  return {
    async enqueueDispatch(input: EnqueueDispatchInput): Promise<void> {
      const dispatcher = getApiJobDispatcher();
      const result = await dispatcher.enqueue({
        jobType: NOTIFICATION_DISPATCH_JOB,
        tenantId: input.tenantId,
        actorId: input.actorId,
        traceId: input.traceId ?? input.tenantId,
        idempotencyKey: input.idempotencyKey ?? input.traceId ?? input.tenantId,
        payload: {
          notificationIds: input.notificationIds,
          tenantId: input.tenantId,
          traceId: input.traceId ?? null,
          actorId: input.actorId,
        },
      });
      if (!result.ok) {
        throw new Error(`queue_rejected: ${result.error ?? "unknown"}`);
      }
    },
  };
}

let singleton: NotificationOutboxDispatcher | null = null;
let registeredCreatePort: NotificationCreatePort | null = null;

/** Wave-3 wiring point (T6): registers the real service.create implementation
 *  the singleton dispatcher uses. Producers never call this directly. */
export function setNotificationCreatePort(port: NotificationCreatePort): void {
  registeredCreatePort = port;
}

export function getNotificationOutboxDispatcher(): NotificationOutboxDispatcher {
  if (!singleton) {
    if (!registeredCreatePort) {
      throw new Error(
        "Notification create port not registered — setNotificationCreatePort(port) must be called first (T6 wires the service).",
      );
    }
    singleton = new NotificationOutboxDispatcher(registeredCreatePort, getRealEnqueuePort());
  }
  return singleton;
}

async function markDispatched(entry: ClaimedOutboxEntry): Promise<void> {
  await NotificationOutboxModel.updateOne(
    { tenantId: entry.tenantId, eventId: entry.eventId, state: "dispatching" },
    { $set: { state: "dispatched", claimExpiresAt: null, failureCode: null } },
  ).exec();
}

function backoff(attempt: number): number {
  return Math.min(60_000, 1000 * 2 ** Math.max(0, attempt - 1));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDuplicateKeyError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown; name?: unknown };
  return candidate.code === 11000 && candidate.name === "MongoServerError";
}

function extractRecipientUserIds(payload: Record<string, unknown>): string[] {
  const raw = payload.recipientUserIds;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string" && id.length > 0);
}
