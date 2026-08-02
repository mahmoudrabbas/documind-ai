/**
 * T20 — API in-process notification sweeps scheduler.
 *
 * Runs three separate sweeps on a fixed setInterval (mirrors
 * `notificationOutbox.scheduler.ts`):
 *   (a) TTL — notifications with `expiresAt` past are marked
 *       `lifecycleState: EXPIRED` and each still-unread recipient's unread
 *       counter is decremented (decrementUnread pattern, floor at 0);
 *   (b) DLQ — permanently-failed 'notification.dispatch' jobs are copied from
 *       the BullMQ queue failed set into `notificationDlqs` once (idempotent
 *       on jobId) — the T20 daily sweep per notificationDispatchJob.ts:226-228;
 *   (c) Reconcile — UserNotificationState unread counts are recomputed from
 *       the live notifications feed (self-heals drift after TTL purges etc.).
 *
 * Env-gated: the scheduler is a no-op when `NOTIFICATION_SWEEP_ENABLED` is
 * false (default). Interval/batch sizes come from the T20 env keys. Failures
 * are isolated PER SWEEP (one sweep throwing never blocks the other two) and
 * per tick (a tick throwing never kills the interval) — the outbox pattern.
 *
 * DIP: the scheduler depends only on the pure ports in
 * `notificationSweeps.port.ts`; production adapters are the defaults when not
 * injected (unit tests inject fakes).
 */
import { logger } from "../../../common/logger/logger.js";
import { MongoUserNotificationStateRepository } from "../repositories/mongo/userNotificationState.repository.js";
import { BullMQDlqSweepSource } from "./bullMqDlqSweepSource.js";
import {
  MongoNotificationDlqSink,
  MongoTtlSweepStore,
  MongoUnreadReconcileSource,
} from "./notificationSweeps.adapters.js";
import type {
  DlqSink,
  DlqSource,
  DlqSweepTotals,
  NotificationSweepTotals,
  ReconcileSource,
  ReconcileSweepTotals,
  TtlSweepStore,
  TtlSweepTotals,
  UnreadStateStore,
} from "./notificationSweeps.port.js";

export const NOTIFICATION_SWEEP_DEFAULT_INTERVAL_MS = 60_000;
export const NOTIFICATION_SWEEP_DEFAULT_TTL_BATCH = 500;
export const NOTIFICATION_SWEEP_DEFAULT_DLQ_BATCH = 100;
export const NOTIFICATION_SWEEP_DEFAULT_RECONCILE_BATCH = 500;

export interface NotificationSweepsOptions {
  /** When false (default) start() is a no-op and tick() is inert. */
  enabled?: boolean;
  intervalMs?: number;
  ttlBatch?: number;
  dlqBatch?: number;
  reconcileBatch?: number;
  /** Injectable for tests; defaults to the production Mongo adapters. */
  ttlStore?: TtlSweepStore;
  stateStore?: UnreadStateStore;
  dlqSource?: DlqSource;
  dlqSink?: DlqSink;
  reconcileSource?: ReconcileSource;
}

export interface NotificationSweepsScheduler {
  /** Start the fixed-interval sweep. Returns null when disabled. Safe to call
   *  twice (returns the live timer). */
  start(): NodeJS.Timeout | null;
  stop(): void;
  /** Run all three sweeps once — used by tests and each interval tick. */
  tick(): Promise<NotificationSweepTotals>;
}

/** (a) TTL sweep — page through expired notifications, mark EXPIRED, and
 *  decrement unread per still-unread recipient. Batch loop runs until a short
 *  page so `batch` bounds each query while all expired docs are processed. */
export async function runTtlSweep(
  store: TtlSweepStore,
  state: UnreadStateStore,
  batch: number,
  now: Date = new Date(),
): Promise<TtlSweepTotals> {
  const totals: TtlSweepTotals = {
    processed: 0,
    markedExpired: 0,
    decremented: 0,
    failed: false,
  };
  for (;;) {
    const expired = await store.findExpiredNotifications(batch, now);
    if (expired.length === 0) break;
    const ids = expired.map((n) => n.id);
    totals.markedExpired += await store.markNotificationsExpired(ids);
    totals.processed += expired.length;
    for (const n of expired) {
      if (n.isRead) continue;
      await state.decrementUnread(n.tenantId, n.userId);
      totals.decremented += 1;
    }
    if (expired.length < batch) break;
  }
  return totals;
}

/** (b) DLQ sweep — copy failed dispatch jobs from the queue failed set into
 *  `notificationDlqs`, skipping jobIds already present (idempotent). */
export async function runDlqSweep(
  source: DlqSource,
  sink: DlqSink,
  limit: number,
  now: Date = new Date(),
): Promise<DlqSweepTotals> {
  const totals: DlqSweepTotals = { scanned: 0, inserted: 0, skipped: 0, failed: false };
  const failed = await source.getFailedDispatchJobs(limit);
  totals.scanned = failed.length;
  for (const job of failed) {
    if (await sink.exists(job.jobId)) {
      totals.skipped += 1;
      continue;
    }
    await sink.insert({
      jobId: job.jobId,
      tenantId: job.tenantId,
      notificationIds: job.notificationIds,
      notificationCount: job.notificationIds.length,
      reason: job.reason,
      payloadHash: job.payloadHash,
      failedAt: job.failedAt ?? now,
    });
    totals.inserted += 1;
  }
  return totals;
}

/** (c) Unread reconciliation — recompute each user's UserNotificationState
 *  unread count from the live notifications feed (paged until a short batch). */
export async function runReconcileSweep(
  source: ReconcileSource,
  state: UnreadStateStore,
  batch: number,
): Promise<ReconcileSweepTotals> {
  const totals: ReconcileSweepTotals = { scanned: 0, recomputed: 0, failed: false };
  let offset = 0;
  for (;;) {
    const rows = await source.countUnreadByUser(batch, offset);
    if (rows.length === 0) break;
    for (const row of rows) {
      await state.recompute(row.tenantId, row.userId, row.count);
      totals.recomputed += 1;
    }
    totals.scanned += rows.length;
    offset += rows.length;
    if (rows.length < batch) break;
  }
  return totals;
}

/** Wrap one sweep so a throw becomes a `failed: true` totals marker instead
 *  of aborting the tick (per-sweep failure isolation). */
async function guarded<T extends { failed: boolean }>(
  run: () => Promise<T>,
  label: string,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    logger.error({ err: error }, `Notification ${label} sweep failed`);
    return { failed: true } as T;
  }
}

export function createNotificationSweepsScheduler(
  opts: NotificationSweepsOptions = {},
): NotificationSweepsScheduler {
  const enabled = opts.enabled ?? false;
  const intervalMs = opts.intervalMs ?? NOTIFICATION_SWEEP_DEFAULT_INTERVAL_MS;
  const ttlBatch = opts.ttlBatch ?? NOTIFICATION_SWEEP_DEFAULT_TTL_BATCH;
  const dlqBatch = opts.dlqBatch ?? NOTIFICATION_SWEEP_DEFAULT_DLQ_BATCH;
  const reconcileBatch =
    opts.reconcileBatch ?? NOTIFICATION_SWEEP_DEFAULT_RECONCILE_BATCH;
  const ttlStore = opts.ttlStore ?? new MongoTtlSweepStore();
  const stateStore = opts.stateStore ?? new MongoUserNotificationStateRepository();
  const dlqSource = opts.dlqSource ?? new BullMQDlqSweepSource();
  const dlqSink = opts.dlqSink ?? new MongoNotificationDlqSink();
  const reconcileSource = opts.reconcileSource ?? new MongoUnreadReconcileSource();
  let timer: NodeJS.Timeout | null = null;

  const tick = async (): Promise<NotificationSweepTotals> => {
    if (!enabled) {
      return {
        ttl: { processed: 0, markedExpired: 0, decremented: 0, failed: false },
        dlq: { scanned: 0, inserted: 0, skipped: 0, failed: false },
        reconcile: { scanned: 0, recomputed: 0, failed: false },
      };
    }
    const ttl = await guarded(() => runTtlSweep(ttlStore, stateStore, ttlBatch), "ttl");
    const dlq = await guarded(
      () => runDlqSweep(dlqSource, dlqSink, dlqBatch),
      "dlq",
    );
    const reconcile = await guarded(
      () => runReconcileSweep(reconcileSource, stateStore, reconcileBatch),
      "reconcile",
    );
    return { ttl, dlq, reconcile };
  };

  return {
    start(): NodeJS.Timeout | null {
      if (!enabled) return null;
      if (timer) return timer;
      timer = setInterval(() => {
        void tick().catch((error: unknown) => {
          logger.error({ err: error }, "Notification sweeps tick failed");
        });
      }, intervalMs);
      return timer;
    },
    stop(): void {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    tick,
  };
}

/** Convenience for server.ts registration (mirrors
 *  startNotificationOutboxScheduler). Env gating + interval/batch sizes are
 *  supplied by the caller (server.ts reads the T20 env keys); defaults mirror
 *  the env.ts defaults so omitting them is safe. */
export function startNotificationSweepsScheduler(
  opts: NotificationSweepsOptions = {},
): NodeJS.Timeout | null {
  return createNotificationSweepsScheduler(opts).start();
}
