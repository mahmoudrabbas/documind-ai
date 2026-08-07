import mongoose from "mongoose";
import type { EntitlementProviderPort } from "../ports/entitlement-provider.port.js";
import type { EntitlementSnapshot } from "../../billing/ports/entitlement-snapshot.port.js";
import { entitlementSnapshotFrom } from "../../billing/ports/entitlement-snapshot.port.js";
import { isServiceablePaymentState, isServiceableStatus } from "../../billing/subscription-status-policy.js";
import SubscriptionModel from "../../../db/models/subscription.model.js";
import RefundModel from "../../../db/models/refund.model.js";
import PackageModel from "../../../db/models/package.model.js";
import { evaluateSubscriptionAccess } from "../../billing/subscription-access-policy.js";
import { config } from "../../../config/index.js";

export class MongoEntitlementProvider implements EntitlementProviderPort {
  async getSnapshot(tenantId: string): Promise<EntitlementSnapshot | null> {
    // Find subscription for tenant
    const subscription = await SubscriptionModel.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      status: { $in: ["ACTIVE", "TRIALING", "CANCEL_AT_PERIOD_END", "PAST_DUE"] },
    }).sort({ createdAt: -1 });

    if (!subscription) {
      return null; // No subscription = fail closed
    }
    const pendingSystemTransition = await RefundModel.exists({
      tenantId: subscription.tenantId,
      subscriptionId: subscription._id,
      status: "SUCCEEDED",
      subscriptionImpact: "CANCEL_AND_MOVE_TO_FREE",
      localTransitionStatus: { $ne: "SUCCEEDED" },
      $or: [
        { reasonCode: "SYSTEM_REMAINING_BALANCE_REFUND" },
        { reasonCode: "VOLUNTARY_CANCELLATION", $expr: { $eq: ["$amountMinor", "$maximumEligibleRefundMinor"] } },
      ],
    });
    if (pendingSystemTransition) return null;
    const access = evaluateSubscriptionAccess({
      status: subscription.status, now: new Date(), periodEnd: subscription.periodEnd ?? subscription.currentPeriodEnd,
      trialEnd: subscription.trialEnd, cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      pastDueSince: subscription.lastProviderEventTimestamp ?? subscription.updatedAt,
      pastDueGraceDays: config.BILLING_PAST_DUE_GRACE_DAYS,
    });
    if (!access.eligible) return null;

    // Non-serviceable subscription status (canceled/expired/unpaid/…) = fail closed
    if (!isServiceableStatus(subscription.status)) {
      return null;
    }

    // Refunded subscription = fail closed (single source of truth:
    // entitlements consult status policy + paymentState)
    if (!subscription.paymentState || !isServiceablePaymentState(subscription.paymentState)) {
      return null;
    }

    // Find package
    const pkg = await PackageModel.findById(subscription.packageId);

    if (!pkg) {
      return null; // No package = fail closed
    }

    if (!pkg.active) {
      return null; // Inactive package = fail closed
    }

    // Find the matching version's entitlements
    const version = pkg.versions?.find(
      (v) => v.version === subscription.packageVersion,
    );

    if (!version) {
      return null; // Missing package version = fail closed
    }

    const versionEntitlements =
      typeof (version.entitlements as unknown as { toObject?: () => Record<string, unknown> })?.toObject === "function"
        ? (version.entitlements as unknown as { toObject: () => Record<string, unknown> }).toObject()
        : version.entitlements;

    const pkgEntitlements =
      typeof (pkg.entitlements as unknown as { toObject?: () => Record<string, unknown> })?.toObject === "function"
        ? (pkg.entitlements as unknown as { toObject: () => Record<string, unknown> }).toObject()
        : pkg.entitlements;

    if (!versionEntitlements && !pkgEntitlements) {
      return null;
    }

    const entitlements = {
      ...pkgEntitlements,
      ...versionEntitlements,
    };

    if ((!entitlements.documents || entitlements.documents === 0) && pkgEntitlements?.documents) {
      entitlements.documents = pkgEntitlements.documents;
    }

    // Build snapshot using the canonical builder
    return entitlementSnapshotFrom(
      entitlements as Parameters<typeof entitlementSnapshotFrom>[0],
      {
        supportedModels: version.supportedModels,
        analyticsLevel: version.analyticsLevel,
        retentionDays: version.retentionDays,
        supportLevel: version.supportLevel,
      },
    );
  }

  async getPeriodRange(
    tenantId: string,
  ): Promise<{ periodStart: Date; periodEnd: Date | null }> {
    const subscription = await SubscriptionModel.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      status: { $in: ["ACTIVE", "TRIALING", "CANCEL_AT_PERIOD_END", "PAST_DUE"] },
    }).sort({ createdAt: -1 });

    if (!subscription) {
      return {
        periodStart: new Date(),
        periodEnd: null,
      };
    }

    const pendingSystemTransition = await RefundModel.exists({
      tenantId: subscription.tenantId,
      subscriptionId: subscription._id,
      status: "SUCCEEDED",
      subscriptionImpact: "CANCEL_AND_MOVE_TO_FREE",
      localTransitionStatus: { $ne: "SUCCEEDED" },
    });
    if (pendingSystemTransition) return { periodStart: new Date(), periodEnd: null };

    // Non-serviceable subscription status mirrors the no-subscription shape
    if (!isServiceableStatus(subscription.status)) {
      return {
        periodStart: new Date(),
        periodEnd: null,
      };
    }

    return {
      periodStart: subscription.periodStart ?? new Date(),
      periodEnd: subscription.periodEnd ?? null,
    };
  }
}
