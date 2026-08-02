/**
 * Notification sweeps ports (T20) — pure TS interfaces, NO mongoose, NO
 * bullmq, NO express (DIP: the sweeps scheduler depends on these abstractions,
 * never on adapters). Production adapters live in this folder (mirrors the
 * outbox scheduler, which imports its model directly); unit tests inject fakes.
 */

/** A notification whose `expiresAt` has passed and that is not yet EXPIRED. */
export interface TtlExpiredNotification {
  id: string;
  tenantId: string;
  userId: string;
  /** Whether the notification was still unread — only these decrement unread. */
  isRead: boolean;
}

/** Read/update source for the TTL sweep (backed by the Notification model). */
export interface TtlSweepStore {
  /** Next page (≤ `batch`) of expired, not-yet-EXPIRED notifications. */
  findExpiredNotifications(batch: number, now: Date): Promise<TtlExpiredNotification[]>;
  /** Mark the given ids EXPIRED; returns how many docs were actually updated. */
  markNotificationsExpired(ids: string[]): Promise<number>;
}

/** Atomic unread-counter store (backed by UserNotificationState). */
export interface UnreadStateStore {
  /** Atomic unread decrement with a floor at 0 (never negative). */
  decrementUnread(tenantId: string, userId: string): Promise<void>;
  /** Overwrite the unread count from a recompute (reconciliation). */
  recompute(tenantId: string, userId: string, count: number): Promise<void>;
}

/** A permanently-failed 'notification.dispatch' job on the queue failed set. */
export interface FailedDispatchJob {
  /** BullMQ job id — `buildDedupKey(jobType, idempotencyKey)`; replay key. */
  jobId: string;
  tenantId: string;
  /** Full ids array from the failed job's envelope payload (≤50). */
  notificationIds: string[];
  reason: string | null;
  payloadHash: string | null;
  failedAt: Date | null;
}

/** Queue-failed-set reader for the DLQ sweep. */
export interface DlqSource {
  /** Newest failed dispatch jobs, capped at `limit`. */
  getFailedDispatchJobs(limit: number): Promise<FailedDispatchJob[]>;
}

/** A notificationDlqs entry (same shape the dispatch worker writes). */
export interface DlqEntry {
  jobId: string;
  tenantId: string;
  notificationIds: string[];
  notificationCount: number;
  reason: string | null;
  payloadHash: string | null;
  failedAt: Date | null;
}

/** Persistence sink for the DLQ sweep (backed by the notificationDlqs model). */
export interface DlqSink {
  /** True when a DLQ entry for `jobId` already exists (idempotency). */
  exists(jobId: string): Promise<boolean>;
  /** Persist a DLQ entry. */
  insert(entry: DlqEntry): Promise<void>;
}

/** One user's unread-notification count, grouped from the Notification docs. */
export interface UnreadCountByUser {
  tenantId: string;
  userId: string;
  count: number;
}

/** Read source for the unread reconciliation sweep. */
export interface ReconcileSource {
  /** Next page (≤ `limit`, starting at `offset`) of per-user unread counts. */
  countUnreadByUser(limit: number, offset: number): Promise<UnreadCountByUser[]>;
}

export interface TtlSweepTotals {
  processed: number;
  markedExpired: number;
  decremented: number;
  /** True when the sweep threw — the scheduler isolates the failure. */
  failed: boolean;
}

export interface DlqSweepTotals {
  scanned: number;
  inserted: number;
  skipped: number;
  failed: boolean;
}

export interface ReconcileSweepTotals {
  scanned: number;
  recomputed: number;
  failed: boolean;
}

export interface NotificationSweepTotals {
  ttl: TtlSweepTotals;
  dlq: DlqSweepTotals;
  reconcile: ReconcileSweepTotals;
}
