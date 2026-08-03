/**
 * Mongo user-notification-state repository (S2) — the ONLY layer where
 * mongoose may appear (guardrail: mongoose is confined to `repositories/mongo/`).
 *
 * Implements the PURE port `UserNotificationStatePort` (T6). The O(1) unread
 * counter uses ATOMIC $inc (findOneAndUpdate) / pipeline $set with a floor at
 * 0 — never read-modify-write (see userNotificationState.model.ts comment).
 */

import { Model, Types, type ClientSession } from "mongoose";
import UserNotificationStateModel, {
  type UserNotificationStateDocument,
} from "../../../../db/models/userNotificationState.model.js";
import {
  NOTIFICATION_TYPE_VALUES,
  type NotificationType,
} from "../../../../db/models/notification.model.js";
import type {
  TransactionSession,
  UserNotificationState,
  UserNotificationStatePort,
} from "../../ports/userNotificationState.port.js";

export class MongoUserNotificationStateRepository implements UserNotificationStatePort {
  constructor(
    private readonly model: Model<UserNotificationStateDocument> = UserNotificationStateModel,
  ) {}

  /** Structural port session → mongoose boundary (the ONE allowed cast). */
  private toSession(session?: TransactionSession): ClientSession | undefined {
    return session ? (session as unknown as ClientSession) : undefined;
  }

  /** String id → ObjectId boundary; guards malformed ids so S5 tests can
   *  assert on the thrown error. */
  private oid(v: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(v)) {
      throw new Error("invalid object id");
    }
    return new Types.ObjectId(v);
  }

  async get(tenantId: string, userId: string): Promise<UserNotificationState | null> {
    const doc = await this.model
      .findOne({ tenantId: this.oid(tenantId), userId: this.oid(userId) })
      .lean();
    if (!doc) return null;
    // Model stores mutedTypes as string[]; the port speaks NotificationType[] —
    // narrow with a type guard (no casts).
    const mutedTypes = doc.mutedTypes.filter(
      (t): t is NotificationType => NOTIFICATION_TYPE_VALUES.some((v) => v === t),
    );
    return { unreadCount: doc.unreadCount, mutedTypes, lastReadAt: doc.lastReadAt };
  }

  async incUnread(
    tenantId: string,
    userId: string,
    session?: TransactionSession,
  ): Promise<void> {
    // Atomic upsert + $inc:1 (never read-modify-write).
    await this.model.findOneAndUpdate(
      { tenantId: this.oid(tenantId), userId: this.oid(userId) },
      { $inc: { unreadCount: 1 } },
      {
        upsert: true,
        setDefaultsOnInsert: true,
        session: this.toSession(session),
        new: true,
      },
    );
  }

  async decrementUnread(
    tenantId: string,
    userId: string,
    session?: TransactionSession,
  ): Promise<void> {
    // Pipeline form enforces the floor at 0 (spec: never negative).
    await this.model.updateOne(
      { tenantId: this.oid(tenantId), userId: this.oid(userId) },
      [{ $set: { unreadCount: { $max: [{ $subtract: ["$unreadCount", 1] }, 0] } } }],
      { session: this.toSession(session), updatePipeline: true },
    );
  }

  async markAllReadAdjustment(
    tenantId: string,
    userId: string,
    matchedCount: number,
    now: Date,
    session?: TransactionSession,
  ): Promise<void> {
    // $inc:-matchedCount + lastReadAt in ONE step; upsert: false (only adjust
    // an existing state doc).
    await this.model.updateOne(
      { tenantId: this.oid(tenantId), userId: this.oid(userId) },
      [
        {
          $set: {
            unreadCount: { $max: [{ $subtract: ["$unreadCount", matchedCount] }, 0] },
            lastReadAt: now,
          },
        },
      ],
      { session: this.toSession(session), updatePipeline: true },
    );
  }

  async recompute(
    tenantId: string,
    userId: string,
    count: number,
    session?: TransactionSession,
  ): Promise<void> {
    await this.model.updateOne(
      { tenantId: this.oid(tenantId), userId: this.oid(userId) },
      { $set: { unreadCount: count } },
      { upsert: true, session: this.toSession(session) },
    );
  }

  async deleteState(
    tenantId: string,
    userId: string,
    session?: TransactionSession,
  ): Promise<void> {
    await this.model.deleteOne(
      { tenantId: this.oid(tenantId), userId: this.oid(userId) },
      { session: this.toSession(session) },
    );
  }
}
