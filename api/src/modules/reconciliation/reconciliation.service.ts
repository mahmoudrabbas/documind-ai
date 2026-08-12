import SubscriptionModel from "../../db/models/subscription.model.js";
import PaymentEventModel from "../../db/models/paymentEvent.model.js";
import { logger } from "../../common/logger/logger.js";
import { getAuditWriter } from "../../common/observability/index.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  authorizePlatformOperation,
  type OperationAuthorizationContext,
} from "../permissions/permissions.operation.js";
import { Types } from "mongoose";
import type { PaymentProvider, ProviderSubscription } from "../billing/ports/payment-provider.port.js";
import {
  providerPaymentState,
  providerSubscriptionStatus,
  resolveProviderSubscription,
} from "../billing/provider-subscription-sync.service.js";
import { firePlanChangeHooks } from "../billing/subscription.service.js";
import type { SubscriptionStatus } from "../billing/billing.types.js";
import { getPaymentProvider } from "../checkout/payment-provider-loader.js";
import { AppError } from "../../common/errors/AppError.js";
import { NOT_FOUND } from "../../common/errors/errorCodes.js";

export interface ReconciliationResult {
  totalSubscriptions: number;
  skippedNullTenant: number;
  mismatched: Array<{
    tenantId: string;
    localStatus: string;
    localPaymentState: string;
    issues: string[];
  }>;
}

export async function reconcileSubscriptions(
  context: OperationAuthorizationContext,
): Promise<ReconciliationResult> {
  const actor = await authorizePlatformOperation(
    context,
    Permission.BILLING_READ,
  );
  const subscriptions = await SubscriptionModel.find({}).lean().exec();
  const mismatched: ReconciliationResult["mismatched"] = [];
  let skippedNullTenant = 0;

  for (const sub of subscriptions) {
    if (!sub.tenantId) {
      skippedNullTenant++;
      continue;
    }
    const issues: string[] = [];
    const tenantId = String(sub.tenantId);

    if (sub.status === "ACTIVE" && sub.paymentState === "failed") {
      issues.push("Status is ACTIVE but paymentState is failed");
    }

    if (sub.status === "PAST_DUE" && sub.paymentState === "paid") {
      issues.push("Status is PAST_DUE but paymentState is paid");
    }

    if (sub.providerSubscriptionId && sub.status === "ACTIVE") {
      const recentEvent = await PaymentEventModel.findOne({
        tenantId: sub.tenantId,
        status: "processed",
      })
        .sort({ createdAt: -1 })
        .lean()
        .exec();

      if (
        recentEvent &&
        recentEvent.eventType === "customer.subscription.deleted"
      ) {
        issues.push(
          "Status is ACTIVE but latest processed event is customer.subscription.deleted",
        );
      }
    }

    if (issues.length > 0) {
      mismatched.push({
        tenantId,
        localStatus: sub.status,
        localPaymentState: sub.paymentState,
        issues,
      });
    }
  }

  logger.info(
    { total: subscriptions.length, mismatched: mismatched.length },
    "Subscription reconciliation complete",
  );
  await getAuditWriter().write({
    tenantId: actor.tenantId,
    action: "SUBSCRIPTION_RECONCILED",
    resourceType: "System",
    resourceId: "subscriptions",
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    actorKind: actor.actorKind,
    changes: {
      totalSubscriptions: subscriptions.length,
      mismatchCount: mismatched.length,
    },
    metadata: { traceId: actor.traceId, requestId: actor.requestId },
  });

  return {
    totalSubscriptions: subscriptions.length,
    skippedNullTenant,
    mismatched,
  };
}

function chooseProviderSubscription(
  subscriptions: ProviderSubscription[],
): ProviderSubscription {
  const live = subscriptions.filter(
    (subscription) => !["canceled", "incomplete_expired"].includes(subscription.status),
  );
  const candidates = live.length > 0 ? live : subscriptions;
  if (candidates.length !== 1) {
    throw new Error(
      `Stripe customer subscription mapping is ${candidates.length === 0 ? "missing" : "ambiguous"}`,
    );
  }
  return candidates[0];
}

export async function syncTenantSubscriptionFromProvider(
  tenantId: string,
  context: OperationAuthorizationContext,
  injectedProvider?: PaymentProvider,
) {
  const actor = await authorizePlatformOperation(
    context,
    Permission.BILLING_MANAGE,
  );
  if (!Types.ObjectId.isValid(tenantId)) {
    throw new AppError(404, NOT_FOUND, "Subscription not found");
  }
  const linkedSubscriptions = await SubscriptionModel.find({
    tenantId: new Types.ObjectId(tenantId),
    providerSubscriptionId: { $nin: ["", null] },
  }).sort({ createdAt: -1 }).limit(3).exec();
  const effective = linkedSubscriptions.filter((candidate) =>
    ["TRIALING", "INCOMPLETE", "ACTIVE", "PAST_DUE", "PAUSED", "CANCEL_AT_PERIOD_END"].includes(candidate.status));
  const subscription = effective.length === 1
    ? effective[0]
    : effective.length === 0 && linkedSubscriptions.length === 1
      ? linkedSubscriptions[0]
      : null;
  if (!subscription) {
    throw new AppError(linkedSubscriptions.length > 1 ? 409 : 404, NOT_FOUND, "Provider-linked subscription mapping is unavailable");
  }

  const provider = injectedProvider ?? (await getPaymentProvider());
  let providerSubscription: ProviderSubscription;
  if (subscription.providerSubscriptionId) {
    if (!provider.retrieveSubscription) throw new Error("Payment provider cannot retrieve subscriptions");
    providerSubscription = await provider.retrieveSubscription(
      subscription.providerSubscriptionId,
    );
  } else if (subscription.providerCustomerId) {
    if (!provider.listCustomerSubscriptions) throw new Error("Payment provider cannot list customer subscriptions");
    providerSubscription = chooseProviderSubscription(
      await provider.listCustomerSubscriptions(subscription.providerCustomerId),
    );
  } else {
    throw new Error("Local subscription has no Stripe customer or subscription linkage");
  }

  const resolution = await resolveProviderSubscription(providerSubscription, tenantId);
  if (resolution.tenantId !== tenantId) {
    throw new Error("Stripe subscription belongs to a different tenant");
  }
  const status = providerSubscriptionStatus(providerSubscription.status);
  if (!status) throw new Error(`Unsupported Stripe subscription status: ${providerSubscription.status}`);

  const previous = {
    packageId: String(subscription.packageId),
    packageVersionId: subscription.packageVersionId?.toString() ?? null,
    packageVersion: subscription.packageVersion,
    providerCustomerId: subscription.providerCustomerId,
    providerSubscriptionId: subscription.providerSubscriptionId,
    status: subscription.status,
    paymentState: subscription.paymentState,
  };
  const update = {
    packageId: new Types.ObjectId(resolution.packageId),
    packageVersionId: new Types.ObjectId(resolution.packageVersionId),
    packageVersion: resolution.packageVersion,
    billingInterval: resolution.billingInterval,
    providerCustomerId: providerSubscription.customerId,
    providerSubscriptionId: providerSubscription.id,
    providerPriceId: providerSubscription.priceId,
    provider: "stripe",
    status,
    paymentState: providerPaymentState(providerSubscription.status),
    periodStart: providerSubscription.currentPeriodStart,
    periodEnd: providerSubscription.currentPeriodEnd,
    currentPeriodStart: providerSubscription.currentPeriodStart,
    currentPeriodEnd: providerSubscription.currentPeriodEnd,
    cancelAtPeriodEnd: providerSubscription.cancelAtPeriodEnd,
  };
  await SubscriptionModel.updateOne({ _id: subscription._id }, { $set: update });

  const packageChanged =
    previous.packageId !== String(update.packageId) ||
    previous.packageVersion !== update.packageVersion;
  const statusChanged = previous.status !== status;
  if (packageChanged || statusChanged) {
    await firePlanChangeHooks({
      tenantId,
      fromPackageId: previous.packageId,
      toPackageId: String(update.packageId),
      fromStatus: previous.status as SubscriptionStatus,
      toStatus: status as SubscriptionStatus,
    });
  }

  await getAuditWriter().write({
    tenantId,
    action: "SUBSCRIPTION_RECONCILED",
    resourceType: "Subscription",
    resourceId: String(subscription._id),
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    actorKind: actor.actorKind,
    changes: {
      source: "stripe",
      previous: { packageId: previous.packageId, packageVersion: previous.packageVersion, status: previous.status, paymentState: previous.paymentState },
      current: { packageId: String(update.packageId), packageVersion: update.packageVersion, status: update.status, paymentState: update.paymentState },
      triggeredBy: "provider_sync",
      reason: "Subscription state synchronized from payment provider",
    },
    metadata: { traceId: actor.traceId, requestId: actor.requestId },
  });

  return {
    tenantId,
    source: "stripe" as const,
    packageId: resolution.packageId,
    packageVersionId: resolution.packageVersionId,
    packageVersion: resolution.packageVersion,
    billingInterval: resolution.billingInterval,
    status,
    paymentState: update.paymentState,
  };
}
