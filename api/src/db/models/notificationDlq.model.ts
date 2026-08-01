import mongoose, { Schema } from "mongoose";

/**
 * Notification dead-letter model (T11).
 *
 * Records a permanently-failed 'notification.dispatch' BullMQ job so an admin
 * can inspect and replay it. The worker (T11) writes one entry when a dispatch
 * job hits a permanent transport failure (the job is dead-lettered via
 * PermanentJobError and retained with removeOnFail:false); the API-side daily
 * DLQ sweep (T20) also copies failed jobs here from the queue's failed set.
 *
 * `jobId` is REQUIRED and is the BullMQ job id (`buildDedupKey(jobType,
 * idempotencyKey)` from the job envelope) — T24 replays via
 * ApiJobDispatcher.replayJob(jobId).
 *
 * `notificationIds` holds the FULL ids array from the failed job's envelope
 * payload (a dispatch job carries up to 50 notificationIds, so a singular
 * notificationId would be ambiguous — pinned after review round 3 M1).
 *
 * The DLQ SWEEP itself is NOT implemented here — it is the API-side daily
 * scheduler in T20 (workers have no queue-introspection port). No auto
 * re-enqueue; no retry policy of its own (inherits ApiJobDispatcher defaults).
 */
export interface NotificationDlqDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  /** BullMQ job id — T24 replays via ApiJobDispatcher.replayJob(jobId). */
  jobId: string;
  /** FULL ids array from the failed job's envelope payload (up to 50). */
  notificationIds: string[];
  /** Length of notificationIds. */
  notificationCount: number;
  reason?: string;
  payloadHash?: string;
  failedAt?: Date | null;
  replayedAt?: Date | null;
}

const notificationDlqSchema = new Schema<NotificationDlqDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    jobId: { type: String, required: true, maxlength: 256 },
    notificationIds: {
      type: [String],
      required: true,
      validate: {
        validator: (value: string[] | null | undefined) => (value ?? []).length <= 50,
        message: "notificationIds cannot exceed 50 items",
      },
    },
    notificationCount: { type: Number, required: true, min: 0 },
    reason: { type: String, maxlength: 1024 },
    payloadHash: { type: String, maxlength: 128 },
    failedAt: { type: Date, default: null },
    replayedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

export const NotificationDlqModel =
  (mongoose.models.NotificationDlq as
    | mongoose.Model<NotificationDlqDocument>
    | undefined) ??
  mongoose.model<NotificationDlqDocument>(
    "NotificationDlq",
    notificationDlqSchema,
  );

export default NotificationDlqModel;
