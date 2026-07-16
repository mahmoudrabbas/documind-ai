import { Types } from "mongoose";
import SubscriptionModel from "../../db/models/subscription.model.js";
import PackageModel from "../../db/models/package.model.js";
import AuditLogModel from "../../db/models/auditLog.model.js";
import { AppError } from "../../common/errors/AppError.js";
import type { AuthIdentity } from "../auth/auth.types.js";
import type { SubscriptionStatus } from "./billing.types.js";
import { LegalTransition } from "./billing.types.js";

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

async function audit(
  actor: AuthIdentity,
  action: string,
  resourceType: string,
  resourceId: string,
  changes: Record<string, unknown>,
  tenantId = actor.tenantId,
) {
  await AuditLogModel.create({
    tenantId,
    userId: actor.userId,
    actorId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    action,
    resourceType,
    resourceId,
    changes,
  });
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Create a subscription for a tenant with TRIALING status.
 *
 * The trial period defaults to 30 days. Throws if a subscription already
 * exists for this tenant (the model enforces a unique constraint on
 * `tenantId`).
 */
export async function createSubscription(
  tenantId: string,
  packageId: string,
  actor?: AuthIdentity,
) {
  // Verify the package exists and is active
  const pkg = await PackageModel.findOne({
    _id: packageId,
    active: true,
  })
    .lean()
    .exec();
  if (!pkg) throw new AppError(404, "NOT_FOUND", "Active package not found");

  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const sub = await SubscriptionModel.create({
    tenantId: new Types.ObjectId(tenantId),
    packageId: new Types.ObjectId(packageId),
    packageVersion: pkg.version,
    status: "TRIALING" as SubscriptionStatus,
    startedAt: now,
    periodStart: now,
    periodEnd,
    trialStart: now,
    trialEnd: periodEnd,
  });

  if (actor) {
    await audit(
      actor,
      "SUBSCRIPTION_CREATED",
      "subscription",
      String(sub._id),
      { tenantId, packageId, status: "TRIALING" },
    );
  }

  return sub.toJSON();
}

/**
 * Transition a subscription to a new status.
 *
 * Validates the requested transition against the `LegalTransition` map.
 * If the transition is not allowed, throws `AppError(400, "INVALID_TRANSITION", ...)`.
 * If the target status is `CANCELED`, also sets `cancelledAt` and the
 * optional `cancellationReason`.
 */
export async function transitionSubscription(
  tenantId: string,
  targetStatus: SubscriptionStatus,
  options?: { reason?: string; actor?: AuthIdentity },
) {
  const sub = await SubscriptionModel.findOne({ tenantId }).exec();
  if (!sub) throw new AppError(404, "NOT_FOUND", "Subscription not found");

  const currentStatus = sub.status;
  const allowed = LegalTransition[currentStatus];

  if (!allowed || !allowed.includes(targetStatus)) {
    throw new AppError(
      400,
      "INVALID_TRANSITION",
      `Cannot transition from ${currentStatus} to ${targetStatus}`,
    );
  }

  const changes: Record<string, unknown> = {
    from: currentStatus,
    to: targetStatus,
  };

  sub.status = targetStatus;

  if (targetStatus === "CANCELED") {
    sub.cancelledAt = new Date();
    if (options?.reason) {
      sub.cancellationReason = options.reason;
      changes.reason = options.reason;
    }
  }

  await sub.save();

  if (options?.actor) {
    await audit(
      options.actor,
      "SUBSCRIPTION_TRANSITIONED",
      "subscription",
      String(sub._id),
      changes,
    );
  }

  return sub.toJSON();
}

/**
 * Get the subscription for a tenant, with the linked package populated.
 *
 * Populates `packageId` with `name`, `code`, `version`, `monthlyPrice`, and
 * `currency`. Throws 404 if no subscription exists for the tenant.
 */
export async function getSubscription(tenantId: string) {
  const sub = await SubscriptionModel.findOne({ tenantId })
    .populate("packageId", "name code version monthlyPrice currency")
    .lean()
    .exec();

  if (!sub) throw new AppError(404, "NOT_FOUND", "Subscription not found");

  return sub;
}

/**
 * List all subscriptions with populated tenant and package references.
 *
 * Populates `tenantId` with `name`, `slug`, `status` and `packageId` with
 * `name`, `code`, `version`, `monthlyPrice`, `currency`. Results are sorted
 * by `updatedAt` descending.
 */
export async function listSubscriptions() {
  return SubscriptionModel.find()
    .populate("tenantId", "name slug status")
    .populate("packageId", "name code version monthlyPrice currency")
    .sort({ updatedAt: -1 })
    .lean()
    .exec();
}
