import mongoose, { Schema } from "mongoose";
import type { NotificationType } from "./notification.model.js";

/**
 * Notification outbox model (T10).
 *
 * A transactional trigger-inbox written by PRODUCERS (worker trigger entries
 * via raw driver — T9/T18/T25 — or API-side producers through the
 * OutboxTriggerPort) and consumed by the Phase-1 API in-process scheduler
 * (notificationOutbox.scheduler.ts) that runs factory → create → enqueue.
 *
 * Two kinds:
 *   - `trigger`: a raw domain event awaiting fan-out. eventId is the stable
 *     per-occurrence id (`${jobIdempotencyKey}:${stage}` for worker entries,
 *     uuid for API-produced ones), so a job retry re-writing the entry
 *     E11000s and is treated as already-written (insert idempotency).
 *   - `dispatch`: notificationIds ready for BullMQ. Phase-1 informational —
 *     the dispatcher marks it dispatched without double-enqueueing; the
 *     queue consumer worker (T11) performs real delivery.
 *
 * `dedupKey` here is INFORMATIONAL ONLY (the bucketed notification dedupKey);
 * it is intentionally NOT unique — dedup is enforced on the notification
 * collection, not in the outbox.
 */
export const NOTIFICATION_OUTBOX_KIND_VALUES = ["trigger", "dispatch"] as const;
export type NotificationOutboxKind = (typeof NOTIFICATION_OUTBOX_KIND_VALUES)[number];

export const NOTIFICATION_OUTBOX_STATE_VALUES = [
  "pending",
  "retry_pending",
  "dispatching",
  "dispatched",
  "dead_letter",
] as const;
export type NotificationOutboxState = (typeof NOTIFICATION_OUTBOX_STATE_VALUES)[number];

export interface NotificationOutboxDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  eventId: string;
  kind: NotificationOutboxKind;
  notificationType: NotificationType;
  /** Bucketed notification dedupKey — informational, NOT unique here. */
  dedupKey?: string | null;
  actorId: string;
  /** Trigger payload or { notificationIds[], ... } for dispatch entries. */
  payload: unknown;
  attempts: number;
  state: NotificationOutboxState;
  nextAttemptAt: Date;
  claimExpiresAt: Date | null;
  failureCode: string | null;
  failedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const notificationOutboxSchema = new Schema<NotificationOutboxDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    eventId: { type: String, required: true, maxlength: 256 },
    kind: { type: String, enum: [...NOTIFICATION_OUTBOX_KIND_VALUES], required: true },
    notificationType: { type: String, required: true },
    dedupKey: { type: String, default: null, maxlength: 512 },
    actorId: { type: String, required: true, minlength: 1, maxlength: 128 },
    payload: { type: Schema.Types.Mixed, required: true },
    attempts: { type: Number, required: true, min: 0, default: 0 },
    state: {
      type: String,
      enum: [...NOTIFICATION_OUTBOX_STATE_VALUES],
      required: true,
      default: "pending",
    },
    nextAttemptAt: { type: Date, required: true, default: () => new Date() },
    claimExpiresAt: { type: Date, default: null },
    failureCode: { type: String, default: null, maxlength: 128 },
    failedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

// Insert-idempotency guard: a producer re-writing the same occurrence
// (e.g. a job retry) E11000s and is treated as already-written — no
// double-enqueue.
notificationOutboxSchema.index(
  { tenantId: 1, eventId: 1 },
  { unique: true, name: "uniq_notification_outbox_event" },
);
// Claim scan used by the Phase-1 scheduler.
notificationOutboxSchema.index(
  { tenantId: 1, kind: 1, state: 1, nextAttemptAt: 1 },
  { name: "idx_notification_outbox_claim_scan" },
);

export const NotificationOutboxModel =
  (mongoose.models.NotificationOutbox as
    | mongoose.Model<NotificationOutboxDocument>
    | undefined) ??
  mongoose.model<NotificationOutboxDocument>(
    "NotificationOutbox",
    notificationOutboxSchema,
  );

export default NotificationOutboxModel;
