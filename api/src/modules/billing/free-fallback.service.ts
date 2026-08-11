import mongoose from "mongoose";
import { getAuditWriter } from "../../common/observability/index.js";
import {
  EFFECTIVE_SUBSCRIPTION_STATUSES,
} from "../../db/subscription-index-invariant.js";
import PackageModel from "../../db/models/package.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";

/**
 * Ensures a tenant that lost its last paid subscription still has an
 * effective subscription by creating or reactivating the canonical Free
 * plan. No-op when an effective subscription already exists (e.g. the
 * refund-to-Free flow created it before the provider cancellation event).
 */
export async function ensureFreeFallbackSubscription(input: {
  tenantId: string;
  providerCustomerId?: string;
  reason?: string;
}): Promise<boolean> {
  const session = await mongoose.startSession();
  let created = false;
  try {
    await session.withTransaction(async () => {
      const effectiveCount = await SubscriptionModel.countDocuments({
        tenantId: input.tenantId,
        status: { $in: EFFECTIVE_SUBSCRIPTION_STATUSES },
      }).session(session).exec();
      if (effectiveCount > 0) return;

      const freePackage = await PackageModel.findOne({ code: "free", active: true, visibility: "public" }).session(session).lean().exec();
      if (!freePackage) throw new Error("Canonical Free package is unavailable");

      const providerCustomerId = input.providerCustomerId ?? "";
      const existingFree = await SubscriptionModel.findOne({
        tenantId: input.tenantId,
        packageId: freePackage._id,
      }).sort({ createdAt: -1 }).session(session).exec();

      if (!existingFree) {
        await SubscriptionModel.create([{
          tenantId: input.tenantId,
          packageId: freePackage._id,
          packageVersion: freePackage.version,
          packageVersionId: null,
          status: "ACTIVE",
          startedAt: new Date(),
          periodStart: null,
          periodEnd: null,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          trialStart: null,
          trialEnd: null,
          cancelledAt: null,
          cancellationReason: "",
          cancelAtPeriodEnd: false,
          providerCustomerId,
          providerSubscriptionId: "",
          providerPriceId: "",
          provider: providerCustomerId ? "stripe" : "local",
          billingInterval: null,
          paymentState: "paid",
          providerMetadata: {},
          lastProviderEventId: "",
          lastProviderEventTimestamp: null,
          providerStateObservedAt: null,
          revision: 0,
        }], { session });
        created = true;
      } else if (!EFFECTIVE_SUBSCRIPTION_STATUSES.includes(existingFree.status as (typeof EFFECTIVE_SUBSCRIPTION_STATUSES)[number])) {
        await SubscriptionModel.updateOne(
          { _id: existingFree._id, tenantId: input.tenantId },
          {
            $set: {
              status: "ACTIVE",
              paymentState: "paid",
              cancelAtPeriodEnd: false,
              cancelledAt: null,
              cancellationReason: "",
              periodStart: null,
              periodEnd: null,
              currentPeriodStart: null,
              currentPeriodEnd: null,
              providerSubscriptionId: "",
              providerPriceId: "",
              billingInterval: null,
              providerMetadata: {},
              ...(providerCustomerId ? { providerCustomerId } : {}),
            },
          },
          { session },
        ).exec();
        created = true;
      }

      await getAuditWriter().write({
        action: "BILLING_FREE_PLAN_ACTIVATED",
        resourceType: "Subscription",
        resourceId: existingFree ? String(existingFree._id) : "free-fallback",
        tenantId: input.tenantId,
        changes: { reason: input.reason ?? "PROVIDER_SUBSCRIPTION_DELETED" },
      });
    });
  } finally {
    await session.endSession();
  }
  return created;
}
