import { logger } from "../../../common/logger/logger.js";
import NotificationOutboxModel from "../../../db/models/notificationOutbox.model.js";
import {
  getNotificationOutboxDispatcher,
  type DispatchTotals,
  type NotificationOutboxDispatcher,
} from "./notificationOutbox.dispatcher.js";

export const NOTIFICATION_OUTBOX_DEFAULT_INTERVAL_MS = 5_000;
export const NOTIFICATION_OUTBOX_DEFAULT_BATCH = 50;

export interface NotificationOutboxSchedulerOptions {
  intervalMs?: number;
  maxBatch?: number;
  /** Injectable for tests; defaults to the singleton dispatcher. */
  dispatcher?: NotificationOutboxDispatcher;
}

export interface NotificationOutboxSweepTotals {
  tenantsScanned: number;
  claimed: number;
  dispatched: number;
  retryPending: number;
  deadLetter: number;
}

export interface NotificationOutboxScheduler {
  /** Start the fixed-interval sweep. Safe to call twice (returns the live
   *  timer). */
  start(): NodeJS.Timeout;
  stop(): void;
  /** Run one sweep immediately — used by tests and the first tick. */
  tick(): Promise<NotificationOutboxSweepTotals>;
}

/**
 * Phase-1 API in-process outbox poller (T10) — mirrors
 * entitlement/reconciliation.scheduler.ts. Every 5s it scans tenants that
 * hold claimable outbox entries and runs the dispatcher against each, so the
 * factory → create → enqueue pipeline advances without a BullMQ worker inside
 * the API process (guardrail 17). Errors inside a tick are caught so a DB or
 * queue failure never crashes the process.
 */
export function createNotificationOutboxScheduler(
  opts: NotificationOutboxSchedulerOptions = {},
): NotificationOutboxScheduler {
  const dispatcher = opts.dispatcher ?? getNotificationOutboxDispatcher();
  const maxBatch = opts.maxBatch ?? NOTIFICATION_OUTBOX_DEFAULT_BATCH;
  const intervalMs = opts.intervalMs ?? NOTIFICATION_OUTBOX_DEFAULT_INTERVAL_MS;
  let timer: NodeJS.Timeout | null = null;

  const tick = async (): Promise<NotificationOutboxSweepTotals> => {
    const totals: NotificationOutboxSweepTotals = {
      tenantsScanned: 0,
      claimed: 0,
      dispatched: 0,
      retryPending: 0,
      deadLetter: 0,
    };
    const tenantIds = await findTenantsWithClaimableEntries();
    totals.tenantsScanned = tenantIds.length;
    for (const tenantId of tenantIds) {
      const run: DispatchTotals = await dispatcher.dispatchPending(tenantId, maxBatch);
      totals.claimed += run.claimed;
      totals.dispatched += run.dispatched;
      totals.retryPending += run.retryPending;
      totals.deadLetter += run.deadLetter;
    }
    return totals;
  };

  return {
    start(): NodeJS.Timeout {
      if (timer) return timer;
      timer = setInterval(() => {
        void tick().catch((error: unknown) => {
          logger.error({ err: error }, "Notification outbox sweep failed");
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

/** Convenience for server.ts registration (additive, mirrors the entitlement
 *  scheduler registration). */
export function startNotificationOutboxScheduler(
  opts: NotificationOutboxSchedulerOptions = {},
): NodeJS.Timeout {
  return createNotificationOutboxScheduler(opts).start();
}

async function findTenantsWithClaimableEntries(): Promise<string[]> {
  const now = new Date();
  const ids = await NotificationOutboxModel.distinct("tenantId", {
    $or: [
      { state: { $in: ["pending", "retry_pending"] }, nextAttemptAt: { $lte: now } },
      { state: "dispatching", claimExpiresAt: { $lte: now } },
    ],
  }).exec();
  return ids.map((id) => id.toString());
}
