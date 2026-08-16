import mongoose from "mongoose";
import type { EntitlementProviderPort } from "../ports/entitlement-provider.port.js";
import type { EntitlementSnapshot } from "../../billing/ports/entitlement-snapshot.port.js";
import { entitlementSnapshotFrom } from "../../billing/ports/entitlement-snapshot.port.js";
import { isServiceablePaymentState, isServiceableStatus } from "../../billing/subscription-status-policy.js";
import SubscriptionModel from "../../../db/models/subscription.model.js";
import RefundModel from "../../../db/models/refund.model.js";
import PackageModel from "../../../db/models/package.model.js";
import { evaluateSubscriptionAccess } from "../../billing/subscription-access-policy.js";
import { resolveCurrentLocalFreePeriod } from "../../billing/free-fallback.service.js";
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

    const periodStart = subscription.periodStart;
    const periodEnd = subscription.periodEnd;

    if (periodStart && periodEnd) {
      const now = new Date();
      if (isLocalFreeSubscription(subscription) && periodEnd.getTime() <= now.getTime()) {
        const advanced = await this.advanceLocalFreePeriod(
          {
            _id: subscription._id,
            tenantId: subscription.tenantId,
            periodStart,
            periodEnd,
          },
          now,
        );
        return { periodStart: advanced.periodStart, periodEnd: advanced.periodEnd };
      }
      return { periodStart, periodEnd };
    }

    return {
      periodStart: periodStart ?? new Date(),
      periodEnd: periodEnd ?? null,
    };
  }

  /**
   * Roll a local Free subscription's entitlement period forward once the
   * current period has expired, so quota counters keyed by YYYY-MM advance
   * to a fresh monthly cycle. Only period fields are mutated — snapshot
   * dimensions (employees, admins, documents, storageMb) are untouched and
   * historical quota-counter rows are preserved.
   *
   * Concurrency: the conditional findOneAndUpdate (`periodEnd <= now`) is an
   * atomic compare-and-swap — exactly one caller wins the rollover and any
   * loser re-reads the winner's period. Idempotent: once `periodEnd > now`
   * the update filter no longer matches, so repeated calls are no-ops.
   */
  private async advanceLocalFreePeriod(
    subscription: {
      _id: mongoose.Types.ObjectId;
      tenantId: mongoose.Types.ObjectId;
      periodStart: Date;
      periodEnd: Date;
    },
    now: Date,
  ): Promise<{ periodStart: Date; periodEnd: Date }> {
    const target = resolveCurrentLocalFreePeriod(subscription.periodStart, subscription.periodEnd, now);
    if (target.periodEnd.getTime() === subscription.periodEnd.getTime()) {
      return target;
    }

    try {
      const updated = await SubscriptionModel.findOneAndUpdate(
        {
          _id: subscription._id,
          tenantId: subscription.tenantId,
          periodEnd: { $lte: now },
        },
        {
          $set: {
            periodStart: target.periodStart,
            periodEnd: target.periodEnd,
            currentPeriodStart: target.periodStart,
            currentPeriodEnd: target.periodEnd,
          },
        },
        { returnDocument: "after" },
      ).lean().exec();

      if (updated?.periodStart && updated?.periodEnd) {
        return { periodStart: updated.periodStart, periodEnd: updated.periodEnd };
      }

      // Another request won the rollover — return the winner's period.
      const fresh = await SubscriptionModel.findById(subscription._id).lean().exec();
      return {
        periodStart: fresh?.periodStart ?? target.periodStart,
        periodEnd: fresh?.periodEnd ?? target.periodEnd,
      };
    } catch {
      // Transient failure: keep the persisted (stale) period. The next
      // entitlement access retries the rollover; never fail a read for it.
      return { periodStart: subscription.periodStart, periodEnd: subscription.periodEnd };
    }
  }
}

/**
 * A local monthly entitlement: a subscription with no provider billing
 * subscription and a concrete period. Native Free registrations leave
 * `provider` as the schema default (""); fallback and refund-to-Free
 * subscriptions are explicitly "local". Paid subscriptions always carry a
 * `providerSubscriptionId`, so they never match.
 */
function isLocalFreeSubscription(subscription: {
  provider: string;
  providerSubscriptionId: string;
  periodStart?: Date | null;
  periodEnd?: Date | null;
}): boolean {
  return (
    (subscription.provider === "" || subscription.provider === "local") &&
    !subscription.providerSubscriptionId &&
    Boolean(subscription.periodStart) &&
    Boolean(subscription.periodEnd)
  );
}
