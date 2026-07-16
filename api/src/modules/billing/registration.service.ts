import PackageModel from "../../db/models/package.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";
import { AppError } from "../../common/errors/AppError.js";
import { createSubscription } from "./subscription.service.js";

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Provision a subscription for a tenant during registration.
 *
 * If `packageCode` is provided, the matching active package is used;
 * otherwise falls back to the default package with code "free".
 *
 * Delegates to `SubscriptionService.createSubscription()`. Does NOT create
 * the tenant or user — that is the caller's responsibility.
 */
export async function provisionSubscription(
  tenantId: string,
  packageCode?: string,
) {
  const code = packageCode ?? "free";

  const pkg = await PackageModel.findOne({ code, active: true })
    .lean()
    .exec();
  if (!pkg) {
    throw new AppError(
      404,
      "PACKAGE_NOT_FOUND",
      `Active package with code "${code}" not found`,
    );
  }

  const subscription = await createSubscription(
    tenantId,
    String(pkg._id),
    // No actor — registration happens before a user session exists
    undefined,
  );

  return subscription;
}

/**
 * Resolve the effective entitlement limits for a tenant based on their
 * current subscription's linked package.
 *
 * Returns a flat entitlement object suitable for policy enforcement.
 */
export async function getEntitlements(tenantId: string) {
  const sub = await SubscriptionModel.findOne({ tenantId })
    .select("packageId")
    .lean()
    .exec();
  if (!sub) {
    throw new AppError(404, "NOT_FOUND", "No subscription found for tenant");
  }

  const pkg = await PackageModel.findById(sub.packageId)
    .select("entitlements")
    .lean()
    .exec();
  if (!pkg) {
    throw new AppError(500, "PACKAGE_MISSING", "Linked package not found");
  }

  return {
    employees: pkg.entitlements.employees,
    admins: pkg.entitlements.admins,
    documents: pkg.entitlements.documents,
    storageMb: pkg.entitlements.storageMb,
    fileSizeMb: pkg.entitlements.fileSizeMb,
    queriesPerMonth: pkg.entitlements.queriesPerMonth,
    tokensPerMonth: pkg.entitlements.tokensPerMonth,
    ocrPagesPerMonth: pkg.entitlements.ocrPagesPerMonth,
  };
}
