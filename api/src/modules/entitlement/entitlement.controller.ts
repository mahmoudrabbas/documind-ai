import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import {
  FORBIDDEN,
  SUBSCRIPTION_INACTIVE,
} from "../../common/errors/errorCodes.js";
import { getEntitlementService } from "./entitlement.service.js";
import SubscriptionModel from "../../db/models/subscription.model.js";
import {
  isServiceablePaymentState,
  isServiceableStatus,
} from "../billing/subscription-status-policy.js";
import type { CounterDimension } from "./entitlement.types.js";
import type { EntitlementSnapshot } from "../billing/ports/entitlement-snapshot.port.js";

// ── Error helper ─────────────────────────────────────────────────────────

function requireTenantId(req: Request): string {
  const tenantId = req.tenantId;
  if (!tenantId) {
    throw new AppError(403, FORBIDDEN, "Tenant context required");
  }
  return tenantId;
}

// ── Wrapper (matches platform.controller.ts pattern) ──────────────────────

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;

const endpoint =
  (handler: Handler) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await handler(req, res);
      if (!res.headersSent) res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

/**
 * All counter dimensions that can appear in both usage and limit records.
 */
const COUNTER_DIMENSIONS: CounterDimension[] = [
  "employees",
  "admins",
  "documents",
  "storageMb",
  "fileSizeMb",
  "queriesPerMonth",
  "tokensPerMonth",
  "ocrPagesPerMonth",
];

/**
 * Extract numeric limit values from an EntitlementSnapshot keyed by the
 * counter dimensions present in the usage record.
 */
function buildLimitMap(
  snapshot: EntitlementSnapshot,
  usageKeys: readonly string[],
): Record<string, number> {
  const limit: Record<string, number> = {};
  const source = snapshot as unknown as Record<string, unknown>;
  for (const key of COUNTER_DIMENSIONS) {
    if (usageKeys.includes(key)) {
      const value = source[key];
      limit[key] = typeof value === "number" ? value : 0;
    }
  }
  return limit;
}

// ── Controllers ──────────────────────────────────────────────────────────

/**
 * Distinguish WHY a snapshot is null: a subscription that exists but is
 * non-serviceable (status or refunded paymentState) → 403 SUBSCRIPTION_INACTIVE;
 * otherwise (no subscription, or package/snapshot unavailable) → null keeps the
 * caller's empty-snapshot response.
 */
async function resolveSnapshot(
  tenantId: string,
  snapshot: EntitlementSnapshot | null,
): Promise<EntitlementSnapshot | null> {
  if (snapshot) {
    return snapshot;
  }

  const subscription = await SubscriptionModel.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId),
  });

  if (
    subscription &&
    (!isServiceableStatus(subscription.status) ||
      !isServiceablePaymentState(subscription.paymentState))
  ) {
    throw new AppError(
      403,
      SUBSCRIPTION_INACTIVE,
      "Your subscription is inactive",
      {
        status: subscription.status,
        paymentState: subscription.paymentState,
      },
    );
  }

  return null;
}

/**
 * GET /entitlement/usage
 *
 * Returns current usage versus limits for the authenticated tenant's current
 * billing period, along with period boundaries.
 */
export const getUsageController = endpoint(async (req) => {
  const tenantId = requireTenantId(req);
  const svc = getEntitlementService();

  const [usage, snapshot, periodStart, periodEnd] = await Promise.all([
    svc.getUsage(tenantId),
    svc.getEntitlementSnapshot(tenantId),
    svc.getPeriodStart(tenantId),
    svc.getPeriodReset(tenantId),
  ]);

  const resolvedSnapshot = await resolveSnapshot(tenantId, snapshot);

  const usageKeys = Object.keys(usage);
  const limit = resolvedSnapshot
    ? buildLimitMap(resolvedSnapshot, usageKeys)
    : {};

  return {
    current: usage,
    limit,
    periodStart,
    periodEnd,
  };
});

/**
 * GET /entitlement/limits
 *
 * Returns the full entitlement snapshot (limits) for the authenticated tenant.
 * Omits usage counters — only the plan-configured limits and capabilities.
 */
export const getLimitsController = endpoint(async (req) => {
  const tenantId = requireTenantId(req);
  const svc = getEntitlementService();

  const snapshot = await svc.getEntitlementSnapshot(tenantId);
  const resolvedSnapshot = await resolveSnapshot(tenantId, snapshot);

  return resolvedSnapshot ?? {};
});
