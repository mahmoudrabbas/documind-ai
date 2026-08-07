import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import {
  FORBIDDEN,
  SUBSCRIPTION_INACTIVE,
} from "../../common/errors/errorCodes.js";
import { getEntitlementService } from "./entitlement.service.js";
import SubscriptionModel, { type SubscriptionStatus } from "../../db/models/subscription.model.js";
import DocumentModel from "../../db/models/document.model.js";
import MessageModel from "../../db/models/message.model.js";
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
): Record<string, number> {
  const limit: Record<string, number> = {};
  const source = snapshot as unknown as Record<string, unknown>;
  for (const key of COUNTER_DIMENSIONS) {
    const value = source[key];
    limit[key] = typeof value === "number" ? value : 0;
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

  const effectiveStatuses: SubscriptionStatus[] = ["TRIALING", "INCOMPLETE", "ACTIVE", "PAST_DUE", "PAUSED", "CANCEL_AT_PERIOD_END"];
  let subscription = await SubscriptionModel.findOne({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    status: { $in: effectiveStatuses },
  });
  // Preserve the inactive-subscription diagnostic when no current effective
  // subscription exists, while never allowing historical paid records to win
  // over an effective Free subscription.
  if (!subscription) {
    subscription = await SubscriptionModel.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      status: { $nin: effectiveStatuses },
    }).sort({ updatedAt: -1, createdAt: -1 });
  }

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

  const limit = resolvedSnapshot
    ? buildLimitMap(resolvedSnapshot)
    : {};

  // Dashboard totals are projections of tenant-owned records, not quota
  // reservations. Quota counters are intentionally retained in `current`
  // for enforcement and the detailed usage page.
  const [documents, storage, questions] = await Promise.all([
    DocumentModel.countDocuments({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      isArchived: false,
      deletedAt: null,
      status: { $nin: ["failed", "canceled"] },
    }),
    DocumentModel.aggregate<{ totalBytes: number }>([
      {
        $match: {
          tenantId: new mongoose.Types.ObjectId(tenantId),
          isArchived: false,
          deletedAt: null,
          status: { $nin: ["failed", "canceled"] },
        },
      },
      { $group: { _id: null, totalBytes: { $sum: "$fileSize" } } },
    ]),
    MessageModel.countDocuments({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      role: "user",
    }),
  ]);

  // Reconcile the documents counter with the actual document count from the DB.
  // The quota counter can drift (e.g. documents uploaded before entitlement
  // enforcement was active), so the real document count is authoritative.
  const reconciledUsage = {
    ...usage,
    documents: documents,
  };

  return {
    current: reconciledUsage,
    limit,
    actual: {
      documents,
      storageBytes: storage[0]?.totalBytes ?? 0,
      questions,
    },
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
