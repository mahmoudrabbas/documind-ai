import type { NotificationType } from "../../../db/models/notification.model.js";

/**
 * Structural transaction session (duplicated from notificationRepository.port.ts
 * on purpose — the two ports stay decoupled; the mongo repositories cast this
 * to `mongoose.ClientSession` at their own boundary). Pure TS, NO mongoose.
 */
export interface TransactionSession {
  withTransaction<T>(fn: (session: TransactionSession) => Promise<T>): Promise<T>;
  endSession(): Promise<void>;
}

export interface UserNotificationState {
  unreadCount: number;
  /** Per-type mute stopgap (T2): the service skips recipients whose state
   *  mutes the notification type. */
  mutedTypes?: NotificationType[];
  lastReadAt?: Date | null;
}

/**
 * User notification state port (T6) — pure TS interface over the O(1) unread
 * counter (one doc per tenant+user, unique index). Implemented by
 * `MongoUserNotificationStateRepository` (S2) using atomic $inc
 * (findOneAndUpdate), never read-modify-write. Tests inject a fake.
 */
export interface UserNotificationStatePort {
  get(tenantId: string, userId: string): Promise<UserNotificationState | null>;

  /** Upsert + $inc:1 — a new notification is created (impl in the mongo repo). */
  incUnread(
    tenantId: string,
    userId: string,
    session?: TransactionSession,
  ): Promise<void>;

  /** $inc:-1 with a floor at 0 — a single notification left the unread set
   *  (read/archive/delete). Impl in the mongo repo. */
  decrementUnread(
    tenantId: string,
    userId: string,
    session?: TransactionSession,
  ): Promise<void>;

  /** $inc:-matchedCount + lastReadAt=now in one step — backs the
   *  transactional markAllRead. Impl in the mongo repo. */
  markAllReadAdjustment(
    tenantId: string,
    userId: string,
    matchedCount: number,
    now: Date,
    session?: TransactionSession,
  ): Promise<void>;

  /** Reconcile the counter to an externally-computed authoritative count
   *  (counter reconciliation, T20). Impl in the mongo repo. */
  recompute(
    tenantId: string,
    userId: string,
    count: number,
    session?: TransactionSession,
  ): Promise<void>;

  /** Remove the user's state doc entirely during user-data deletion. */
  deleteState(
    tenantId: string,
    userId: string,
    session?: TransactionSession,
  ): Promise<void>;
}
