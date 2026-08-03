/**
 * T20 production adapters (mongoose/bullmq boundary) for the notification
 * sweeps — the ONLY concrete implementations of the pure ports in
 * `notificationSweeps.port.ts`. Mirrors the outbox scheduler's practice of
 * importing its model directly; unit tests never touch these (fakes instead).
 */
import { Types, type Model } from "mongoose";
import NotificationModel, {
  type NotificationDocument,
} from "../../../db/models/notification.model.js";
import NotificationDlqModel, {
  type NotificationDlqDocument,
} from "../../../db/models/notificationDlq.model.js";
import type {
  DlqEntry,
  DlqSink,
  ReconcileSource,
  TtlExpiredNotification,
  TtlSweepStore,
  UnreadCountByUser,
} from "./notificationSweeps.port.js";

/** (a) TTL sweep store — finds expired, not-yet-EXPIRED notifications and
 *  marks them EXPIRED (mirrors the `expiresAt > now` live-feed filter so a
 *  doc excluded from reads is exactly the doc this sweep marks). */
export class MongoTtlSweepStore implements TtlSweepStore {
  constructor(
    private readonly model: Model<NotificationDocument> = NotificationModel,
  ) {}

  async findExpiredNotifications(
    batch: number,
    now: Date,
  ): Promise<TtlExpiredNotification[]> {
    const docs = await this.model
      .find({
        expiresAt: { $lte: now },
        lifecycleState: { $ne: "EXPIRED" },
        deletedAt: null,
      })
      .limit(batch)
      .select({ tenantId: 1, userId: 1, isRead: 1 })
      .lean()
      .exec();
    return docs.map((doc) => ({
      id: doc._id.toString(),
      tenantId: doc.tenantId.toString(),
      userId: doc.userId.toString(),
      isRead: Boolean(doc.isRead),
    }));
  }

  async markNotificationsExpired(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await this.model.updateMany(
      { _id: { $in: ids }, lifecycleState: { $ne: "EXPIRED" } },
      { $set: { lifecycleState: "EXPIRED" } },
    );
    return result.modifiedCount;
  }
}

/** (c) Unread reconciliation source — per-user unread counts grouped from the
 *  live notifications feed (same filters as `unreadCountByPriority`). */
export class MongoUnreadReconcileSource implements ReconcileSource {
  constructor(
    private readonly model: Model<NotificationDocument> = NotificationModel,
  ) {}

  async countUnreadByUser(
    limit: number,
    offset: number,
  ): Promise<UnreadCountByUser[]> {
    const rows = await this.model
      .aggregate<{
        _id: { tenantId: Types.ObjectId; userId: Types.ObjectId };
        count: number;
      }>([
        {
          $match: {
            isRead: false,
            deletedAt: null,
            expiresAt: { $gt: new Date() },
          },
        },
        { $group: { _id: { tenantId: "$tenantId", userId: "$userId" }, count: { $sum: 1 } } },
        { $sort: { "_id.tenantId": 1, "_id.userId": 1 } },
        { $skip: offset },
        { $limit: limit },
      ])
      .exec();
    return rows.map((row) => ({
      tenantId: row._id.tenantId.toString(),
      userId: row._id.userId.toString(),
      count: row.count,
    }));
  }
}

/** (b) DLQ sink — writes `notificationDlqs` entries, idempotent on jobId. */
export class MongoNotificationDlqSink implements DlqSink {
  constructor(
    private readonly model: Model<NotificationDlqDocument> = NotificationDlqModel,
  ) {}

  async exists(jobId: string): Promise<boolean> {
    return (await this.model.exists({ jobId })) !== null;
  }

  async insert(entry: DlqEntry): Promise<void> {
    await this.model.create({
      tenantId: new Types.ObjectId(entry.tenantId),
      jobId: entry.jobId,
      notificationIds: entry.notificationIds,
      notificationCount: entry.notificationCount,
      reason: entry.reason ?? undefined,
      payloadHash: entry.payloadHash ?? undefined,
      failedAt: entry.failedAt,
      replayedAt: null,
    });
  }
}
