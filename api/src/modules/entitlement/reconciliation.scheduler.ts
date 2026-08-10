import { logger } from "../../common/logger/logger.js";
import { getReconciliationService } from "./reconciliation.service.js";
import { getPaymentProvider } from "../checkout/payment-provider-loader.js";
import { reconcileSucceededSystemRefundSettlements, reconcilePendingRefundSettlements } from "../billing/refund.service.js";
import { reconcileProviderPendingOperations } from "../billing/billing-operation-reconciliation.service.js";

export interface EntitlementReconciliationSchedulerOptions {
  intervalMs?: number;
  mode?: "dry-run" | "execute";
}

export const ENTITLEMENT_RECONCILE_DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Start a lightweight in-process entitlement reconciliation sweep.
 *
 * Runs `reconcileAll(mode)` on a fixed interval and logs a summary of the
 * run. Disabled when `ENTITLEMENT_RECONCILE_ENABLED === "false"`.
 * Interval (default 24h) and mode (default "execute") can be overridden via
 * options or the ENTITLEMENT_RECONCILE_INTERVAL_MS / ENTITLEMENT_RECONCILE_MODE
 * environment variables. Errors inside a tick are caught so a DB failure
 * never crashes the process.
 */
export function startEntitlementReconciliation(
  opts: EntitlementReconciliationSchedulerOptions = {},
): NodeJS.Timeout {
  if (process.env.ENTITLEMENT_RECONCILE_ENABLED === "false") {
    logger.info(
      "Entitlement reconciliation scheduler disabled (ENTITLEMENT_RECONCILE_ENABLED=false)",
    );
    return setInterval(() => undefined, ENTITLEMENT_RECONCILE_DEFAULT_INTERVAL_MS);
  }

  const intervalMs = resolveIntervalMs(opts.intervalMs);
  const mode = resolveMode(opts.mode);

  const runOnce = async (): Promise<void> => {
    try {
      const run = await getReconciliationService().reconcileAll(mode);
      logger.info(
        {
          mode,
          totalTenants: run.totalTenants,
          totalDiscrepancies: run.totalDiscrepancies,
          totalFixed: run.totalFixed,
        },
        "Entitlement reconciliation sweep completed",
      );
    } catch (error) {
      logger.error(
        { err: error, mode },
      "Entitlement reconciliation sweep failed",
    );
    }
    if (process.env.BILLING_REFUND_RECONCILE_ENABLED === "false") return;
    const provider = await getPaymentProvider();
    try {
      const settlements = await reconcileSucceededSystemRefundSettlements({ provider, maxRecords: 200 });
      logger.info({
        examined: settlements.examined,
        eligibleForTransitionRepair: settlements.eligibleForTransitionRepair,
        transitionsCompleted: settlements.transitionsCompleted,
        transitionsRetryable: settlements.transitionsRetryable,
        failed: settlements.failed,
      }, "Succeeded refund settlement reconciliation sweep completed");
    } catch (error) {
      logger.error({ err: error }, "Succeeded refund settlement reconciliation sweep failed");
    }
    try {
      const pendingRefunds = await reconcilePendingRefundSettlements({ provider });
      logger.info({
        examined: pendingRefunds.examined,
        synchronized: pendingRefunds.synchronized,
        retried: pendingRefunds.retried,
        confirmed: pendingRefunds.confirmed,
        failed: pendingRefunds.failed,
        pending: pendingRefunds.pending,
      }, "Pending refund reconciliation sweep completed");
    } catch (error) {
      logger.error({ err: error }, "Pending refund reconciliation sweep failed");
    }
    try {
      const pendingOperations = await reconcileProviderPendingOperations({ provider });
      logger.info({
        examined: pendingOperations.examined,
        synchronized: pendingOperations.synchronized,
        repaired: pendingOperations.repaired,
        confirmed: pendingOperations.confirmed,
        failed: pendingOperations.failed,
        pending: pendingOperations.pending,
        providerUnavailable: pendingOperations.providerUnavailable,
      }, "Provider-pending billing operation reconciliation sweep completed");
    } catch (error) {
      logger.error({ err: error }, "Provider-pending billing operation reconciliation sweep failed");
    }
  };

  return setInterval(() => {
    void runOnce();
  }, intervalMs);
}

function resolveIntervalMs(intervalMs?: number): number {
  if (
    typeof intervalMs === "number" &&
    Number.isFinite(intervalMs) &&
    intervalMs > 0
  ) {
    return intervalMs;
  }
  const fromEnv = Number(process.env.ENTITLEMENT_RECONCILE_INTERVAL_MS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }
  return ENTITLEMENT_RECONCILE_DEFAULT_INTERVAL_MS;
}

function resolveMode(mode?: "dry-run" | "execute"): "dry-run" | "execute" {
  if (mode === "dry-run" || mode === "execute") {
    return mode;
  }
  return process.env.ENTITLEMENT_RECONCILE_MODE === "dry-run"
    ? "dry-run"
    : "execute";
}
