/**
 * Mongo notification repository (S2) — the ONLY mongoose-aware layer
 * (guardrail: mongoose is confined to `repositories/mongo/`). Implements the
 * PURE port `NotificationRepositoryPort` (T6); structural TransactionSessions
 * are cast to ClientSession at this boundary (the one allowed cast).
 */
import mongoose, { Model, Types, type ClientSession } from "mongoose";
import NotificationModel, { NOTIFICATION_PRIORITY_VALUES, type NotificationDocument, type NotificationPriority } from "../../../../db/models/notification.model.js";
import type { NotificationDraft } from "../../factory/factory.js";
import type { CreateManyEntry, CreateManyResult, DedupRangeMatch, FindDedupRangeQuery, ListNotificationsOptions, MatchedCountResult, MatchedResult, NotificationRepositoryPort, PaginatedNotifications, TransactionSession, UnreadCountByPriorityResult } from "../../ports/notificationRepository.port.js";
import { buildDedupRangeQuery, DEDUP_WINDOW_HOURS } from "workers/contracts";
import { transitionLifecycle } from "../../lifecycle/lifecycle.js";

const isNotificationPriority = (v: string): v is NotificationPriority =>
  NOTIFICATION_PRIORITY_VALUES.some((p) => p === v);

export class MongoNotificationRepository implements NotificationRepositoryPort {
  constructor(private readonly model: Model<NotificationDocument> = NotificationModel) {}

  private toSession(session?: TransactionSession): ClientSession | undefined {
    return session ? (session as unknown as ClientSession) : undefined;
  }

  private oid(v: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(v)) throw new Error("invalid object id");
    return new Types.ObjectId(v);
  }

  async createMany(tenantId: string, draft: NotificationDraft, entries: CreateManyEntry[], now: Date): Promise<CreateManyResult> {
    const docs: Array<Partial<NotificationDocument>> = entries.map((entry) => {
      const doc: Partial<NotificationDocument> = {
        tenantId: this.oid(tenantId), userId: this.oid(entry.userId), dedupKey: entry.dedupKey,
        dedupEventId: draft.dedupEventId, deduplicatedAt: now, type: draft.type, category: draft.category,
        priority: draft.priority, title: draft.title, body: draft.body, actions: draft.actions,
        metadata: draft.metadata, version: draft.version, lifecycleState: "CREATED",
        deliveryStatus: "pending", deliveryAttempts: 0, isRead: false, isSeen: false,
        isArchived: false, collapsedCount: 0,
      };
      if (draft.source !== undefined) doc.source = draft.source;
      if (draft.actorId !== undefined) doc.actorId = draft.actorId;
      if (draft.traceIds !== undefined) doc.traceIds = draft.traceIds;
      if (draft.createdBy !== undefined) doc.createdBy = draft.createdBy;
      return doc;
    });
    try {
      const insertedDocs = await this.model.insertMany(docs, { ordered: false });
      return {
        inserted: insertedDocs.map((d, i) => ({ id: d._id.toString(), userId: entries[i].userId })),
        conflicts: [],
      };
    } catch (e) {
      // E11000 conflicts are RETURNED, never rethrown; anything else rethrows.
      if (e instanceof mongoose.mongo.MongoBulkWriteError) {
        const writeErrors = Array.isArray(e.writeErrors) ? e.writeErrors : [e.writeErrors];
        if (writeErrors.some((we) => we.code === 11000 || we.err?.code === 11000)) {
          const inserted: Array<{ id: string; userId: string }> = [];
          const conflicts: Array<{ userId: string }> = [];
          for (let i = 0; i < entries.length; i++) {
            // result.insertedIds is keyed by operation index (absent = failed insert).
            const insertedId = e.result.insertedIds[i];
            if (insertedId == null) conflicts.push({ userId: entries[i].userId });
            else inserted.push({ id: String(insertedId), userId: entries[i].userId });
          }
          return { inserted, conflicts };
        }
      }
      throw e;
    }
  }

  async findDedupRange(tenantId: string, userId: string, query: FindDedupRangeQuery): Promise<DedupRangeMatch | null> {
    const q = buildDedupRangeQuery<Types.ObjectId>({
      tenantId: this.oid(tenantId), userId: this.oid(userId), type: query.type,
      dedupEventId: query.dedupEventId, now: query.now, windowHours: DEDUP_WINDOW_HOURS[query.type],
    });
    const doc = await this.model.findOne(q.filter, null, { sort: q.sort, limit: q.limit }).lean();
    if (!doc) return null;
    return { ...doc, id: doc._id.toString(), version: doc.version };
  }

  async updateDeduped(tenantId: string, notificationId: string, patch: Record<string, unknown>, now: Date): Promise<void> {
    // patch.version is ALREADY incremented by resolveDedup — never $inc again.
    await this.model.updateOne(
      { tenantId: this.oid(tenantId), _id: this.oid(notificationId) },
      { $set: { ...patch, deduplicatedAt: now } },
    );
  }

  async softDeleteById(tenantId: string, notificationId: string, session?: TransactionSession): Promise<void> {
    // Straddle mitigation (b): unconditional, no read/seen filter.
    await this.model.updateOne(
      { tenantId: this.oid(tenantId), _id: this.oid(notificationId), deletedAt: null },
      { $set: { deletedAt: new Date(), lifecycleState: "DELETED" } },
      { session: this.toSession(session) },
    );
  }

  async list(tenantId: string, userId: string, opts: ListNotificationsOptions): Promise<PaginatedNotifications> {
    const filter = {
      tenantId: this.oid(tenantId), userId: this.oid(userId), deletedAt: null,
      expiresAt: { $gt: new Date() }, // live feed excludes expired
      ...(opts.includeArchived ? {} : { isArchived: false }),
      ...(opts.category !== undefined ? { category: opts.category } : {}),
    };
    const skip = (opts.page - 1) * opts.limit;
    const [docs, total] = await Promise.all([
      this.model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(opts.limit).lean(),
      this.model.countDocuments(filter),
    ]);
    return { items: docs.map((d) => ({ ...d, id: d._id.toString() })), total };
  }

  async getById(tenantId: string, notificationId: string): Promise<Record<string, unknown> | null> {
    const doc = await this.model.findOne({
      tenantId: this.oid(tenantId), _id: this.oid(notificationId), deletedAt: null,
      expiresAt: { $gt: new Date() },
    }).lean();
    if (!doc) return null;
    return { ...doc, id: doc._id.toString() };
  }

  async markRead(tenantId: string, userId: string, notificationId: string, session?: TransactionSession): Promise<MatchedResult> {
    const r = await this.model.updateOne(
      { tenantId: this.oid(tenantId), userId: this.oid(userId), _id: this.oid(notificationId), isRead: false, deletedAt: null },
      { $set: { isRead: true, readAt: new Date(), lifecycleState: "READ" } },
      { session: this.toSession(session) },
    );
    return { matched: r.matchedCount > 0 };
  }

  async markAllRead(tenantId: string, userId: string, cutoff: Date, session?: TransactionSession): Promise<MatchedCountResult> {
    const r = await this.model.updateMany(
      { tenantId: this.oid(tenantId), userId: this.oid(userId), isRead: false, deletedAt: null, createdAt: { $lte: cutoff } },
      { $set: { isRead: true, readAt: new Date(), lifecycleState: "READ" } },
      { session: this.toSession(session) },
    );
    return { matchedCount: r.matchedCount };
  }

  async markSeen(tenantId: string, userId: string, notificationId: string): Promise<MatchedResult> {
    const r = await this.model.updateOne(
      { tenantId: this.oid(tenantId), userId: this.oid(userId), _id: this.oid(notificationId), isSeen: false, deletedAt: null },
      { $set: { isSeen: true, seenAt: new Date(), lifecycleState: "SEEN" } },
    );
    return { matched: r.matchedCount > 0 };
  }

  async markAllSeen(tenantId: string, userId: string): Promise<MatchedCountResult> {
    const r = await this.model.updateMany(
      { tenantId: this.oid(tenantId), userId: this.oid(userId), isSeen: false, deletedAt: null },
      { $set: { isSeen: true, seenAt: new Date(), lifecycleState: "SEEN" } },
    );
    return { matchedCount: r.matchedCount };
  }

  async bulkRead(tenantId: string, userId: string, ids: string[], session?: TransactionSession): Promise<MatchedCountResult> {
    const r = await this.model.updateMany(
      { tenantId: this.oid(tenantId), userId: this.oid(userId), _id: { $in: ids.map((id) => this.oid(id)) }, isRead: false, deletedAt: null },
      { $set: { isRead: true, readAt: new Date(), lifecycleState: "READ" } },
      { session: this.toSession(session) },
    );
    return { matchedCount: r.matchedCount };
  }

  async archive(tenantId: string, userId: string, notificationId: string, session?: TransactionSession): Promise<MatchedResult> {
    const r = await this.model.updateOne(
      { tenantId: this.oid(tenantId), userId: this.oid(userId), _id: this.oid(notificationId), isArchived: false, deletedAt: null },
      { $set: { isArchived: true, archivedAt: new Date() } }, // lifecycleState stays as-is
      { session: this.toSession(session) },
    );
    return { matched: r.matchedCount > 0 };
  }

  async softDelete(tenantId: string, userId: string, notificationId: string, actorId: string, session?: TransactionSession): Promise<MatchedResult> {
    const r = await this.model.updateOne(
      { tenantId: this.oid(tenantId), userId: this.oid(userId), _id: this.oid(notificationId), deletedAt: null },
      { $set: { deletedAt: new Date(), deletedBy: actorId, lifecycleState: "DELETED" } },
      { session: this.toSession(session) },
    );
    return { matched: r.matchedCount > 0 };
  }

  async unreadCountByPriority(tenantId: string, userId: string): Promise<UnreadCountByPriorityResult> {
    const rows = await this.model.aggregate<{ _id: string; n: number }>([
      { $match: { tenantId: this.oid(tenantId), userId: this.oid(userId), isRead: false, deletedAt: null, expiresAt: { $gt: new Date() } } },
      { $group: { _id: "$priority", n: { $sum: 1 } } },
    ]);
    const byPriority: Record<NotificationPriority, number> = { critical: 0, high: 0, normal: 0, low: 0 };
    let count = 0;
    for (const row of rows) {
      count += row.n;
      if (isNotificationPriority(row._id)) byPriority[row._id] = row.n;
    }
    return { count, byPriority };
  }

  async markEnqueued(
    tenantId: string,
    notificationIds: string[],
    session?: TransactionSession,
  ): Promise<MatchedCountResult> {
    // 'enqueue' is the only legal CREATED → QUEUED path (transitionLifecycle
    // throws for any other current state, and the filter keeps it idempotent).
    const target = transitionLifecycle("CREATED", "enqueue");
    const r = await this.model.updateMany(
      {
        tenantId: this.oid(tenantId),
        _id: { $in: notificationIds.map((id) => this.oid(id)) },
        lifecycleState: "CREATED",
      },
      { $set: { lifecycleState: target } },
      { session: this.toSession(session) },
    );
    return { matchedCount: r.modifiedCount };
  }

  async purgeUserNotifications(tenantId: string, userId: string, session?: TransactionSession): Promise<MatchedCountResult> {
    const r = await this.model.updateMany(
      { tenantId: this.oid(tenantId), userId: this.oid(userId), deletedAt: null },
      { $set: { deletedAt: new Date(), deletedBy: "system:user-purge", lifecycleState: "DELETED" } },
      { session: this.toSession(session) },
    );
    return { matchedCount: r.modifiedCount };
  }

  async softDeleteAll(tenantId: string, userId: string, actorId: string, session?: TransactionSession): Promise<MatchedCountResult> {
    const r = await this.model.updateMany(
      { tenantId: this.oid(tenantId), userId: this.oid(userId), deletedAt: null },
      { $set: { deletedAt: new Date(), deletedBy: actorId, lifecycleState: "DELETED" } },
      { session: this.toSession(session) },
    );
    return { matchedCount: r.modifiedCount };
  }
}
