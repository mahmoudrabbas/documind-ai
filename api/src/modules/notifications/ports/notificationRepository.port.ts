import type { NotificationDraft } from "../factory/factory.js";
import type {
  NotificationCategory,
  NotificationPriority,
  NotificationType,
} from "../../../db/models/notification.model.js";

/**
 * Structural transaction session (DIP — this port file stays pure TS).
 *
 * The mongo repository (S2) casts this to `mongoose.ClientSession` at its own
 * boundary (adapter responsibility, guardrail: mongoose appears only under
 * `repositories/mongo/`). Port consumers never import mongoose.
 */
export interface TransactionSession {
  withTransaction<T>(fn: (session: TransactionSession) => Promise<T>): Promise<T>;
  endSession(): Promise<void>;
}

export interface CreateManyEntry {
  userId: string;
  /** Bucketed dedupKey — unique-index guard against same-bucket concurrent
   *  inserts (E11000 surfaces as a conflict). */
  dedupKey: string;
}

export interface CreateManyResult {
  inserted: Array<{ id: string; userId: string }>;
  /** Recipients whose insert hit the unique dedupKey guard (E11000). */
  conflicts: Array<{ userId: string }>;
}

export interface FindDedupRangeQuery {
  type: NotificationType;
  dedupEventId: string;
  now: Date;
  windowMs: number;
}

/** Result of the sliding-window dedup range query (T5) — the PRIMARY dedup
 *  gate. The trailing index signature lets the mongo repo return the raw doc
 *  (`NotificationDocument`) without importing mongoose here. */
export interface DedupRangeMatch {
  id: string;
  version: number;
  [k: string]: unknown;
}

export interface ListNotificationsOptions {
  page: number;
  limit: number;
  category?: NotificationCategory;
  includeArchived?: boolean;
}

export interface PaginatedNotifications {
  items: Array<Record<string, unknown>>;
  total: number;
}

export interface MatchedResult {
  matched: boolean;
}

export interface MatchedCountResult {
  matchedCount: number;
}

export interface UnreadCountByPriorityResult {
  count: number;
  byPriority: Record<NotificationPriority, number>;
}

/**
 * Notification repository port (T6) — pure TS interface, NO mongoose, NO
 * express (DIP: the service depends on this abstraction, never on models).
 * Implemented by `MongoNotificationRepository` (S2) on the tenant-scoped
 * repository; tests inject a fake. `tenantId` is a string at this boundary.
 *
 * Behavioural notes pinned by plan review rounds (the mongo repo enforces):
 *  - E11000 insert conflicts are RETURNED as `conflicts`, never rethrown;
 *    any other insert error is rethrown.
 *  - `updateDeduped` applies the T3 update rule result and refreshes
 *    `deduplicatedAt`.
 *  - `softDeleteById` is the straddle-mitigation step (b): unconditionally
 *    marks a matched doc DELETED regardless of read/seen state.
 *  - `archive`/`softDelete`/`markRead`/`bulkRead` of an already-archived or
 *    already-deleted doc must NOT double-decrement the unread counter — the
 *    matched-flag contract lets the service decide whether to adjust state.
 */
export interface NotificationRepositoryPort {
  /** Insert one doc per entry sharing the draft. Returns per-user inserted ids
   *  plus the E11000 conflicts (non-11000 errors rethrown by the adapter). */
  createMany(
    tenantId: string,
    draft: NotificationDraft,
    entries: CreateManyEntry[],
    now: Date,
  ): Promise<CreateManyResult>;

  /** Sliding-window dedup lookup (T5 range query): newest matching doc within
   *  `windowMs` of `now`, or null when outside the window. */
  findDedupRange(
    tenantId: string,
    userId: string,
    query: FindDedupRangeQuery,
  ): Promise<DedupRangeMatch | null>;

  /** Apply the dedup-update patch (T3 applyUpdateRule result + version++ +
   *  deduplicatedAt refresh) to an existing notification. */
  updateDeduped(
    tenantId: string,
    notificationId: string,
    patch: Record<string, unknown>,
    now: Date,
  ): Promise<void>;

  /** Straddle mitigation step (b): unconditionally soft-delete a single doc
   *  regardless of read/seen state. No unread-counter adjustment here. */
  softDeleteById(
    tenantId: string,
    notificationId: string,
    session?: TransactionSession,
  ): Promise<void>;

  list(
    tenantId: string,
    userId: string,
    opts: ListNotificationsOptions,
  ): Promise<PaginatedNotifications>;

  getById(tenantId: string, notificationId: string): Promise<Record<string, unknown> | null>;

  markRead(
    tenantId: string,
    userId: string,
    notificationId: string,
    session?: TransactionSession,
  ): Promise<MatchedResult>;

  /** Mark all notifications read up to `cutoff` (exclusive of later inserts).
   *  `matchedCount` is used by the service to adjust the unread counter. */
  markAllRead(
    tenantId: string,
    userId: string,
    cutoff: Date,
    session?: TransactionSession,
  ): Promise<MatchedCountResult>;

  markSeen(
    tenantId: string,
    userId: string,
    notificationId: string,
  ): Promise<MatchedResult>;

  markAllSeen(tenantId: string, userId: string): Promise<MatchedCountResult>;

  bulkRead(
    tenantId: string,
    userId: string,
    ids: string[],
    session?: TransactionSession,
  ): Promise<MatchedCountResult>;

  archive(
    tenantId: string,
    userId: string,
    notificationId: string,
    session?: TransactionSession,
  ): Promise<MatchedResult>;

  /** Soft-delete by the owning user (unlike `softDeleteById`, which is the
   *  straddle-mitigation path). `actorId` is recorded for audit. */
  softDelete(
    tenantId: string,
    userId: string,
    notificationId: string,
    actorId: string,
    session?: TransactionSession,
  ): Promise<MatchedResult>;

  /** Backs the unread-count badge (T14), including per-priority totals. */
  unreadCountByPriority(
    tenantId: string,
    userId: string,
  ): Promise<UnreadCountByPriorityResult>;

  /** Purge all of a user's notification docs (soft delete) during user-data
   *  deletion. Called inside the deletion transaction when a session is given. */
  purgeUserNotifications(
    tenantId: string,
    userId: string,
    session?: TransactionSession,
  ): Promise<MatchedCountResult>;
}
