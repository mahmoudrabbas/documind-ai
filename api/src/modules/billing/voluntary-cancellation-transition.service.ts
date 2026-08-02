import mongoose from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import { SUBSCRIPTION_INDEX_MIGRATION_REQUIRED } from "../../common/errors/errorCodes.js";
import { getAuditWriter } from "../../common/observability/index.js";
import {
  EFFECTIVE_SUBSCRIPTION_STATUSES,
  inspectSubscriptionIndexInvariant,
} from "../../db/subscription-index-invariant.js";
import InvoiceModel from "../../db/models/invoice.model.js";
import PackageModel from "../../db/models/package.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";
import type { RefundDocument } from "../../db/models/refund.model.js";
import { calculateRemainingRefundableMinor } from "./refund-balances.js";

function transitionNotReady(): AppError {
  return new AppError(
    503,
    SUBSCRIPTION_INDEX_MIGRATION_REQUIRED,
    "Refund transition is temporarily unavailable",
  );
}

/**
 * Fail before creating a provider refund if the local paid-to-Free transition
 * cannot preserve subscription history safely. This prevents an authoritative
 * refund from leaving a tenant without an effective subscription merely
 * because the subscription-history index migration was not applied.
 */
export async function assertSystemRefundTransitionReady(input: {
  tenantId: string;
  subscriptionId: string;
}): Promise<void> {
  try {
    const freePackage = await PackageModel.exists({ code: "free", active: true, visibility: "public" });
    const paidSubscription = await SubscriptionModel.exists({
      _id: input.subscriptionId,
      tenantId: input.tenantId,
      status: { $in: EFFECTIVE_SUBSCRIPTION_STATUSES },
    });
    if (!freePackage || !paidSubscription) throw transitionNotReady();

    const invariant = await inspectSubscriptionIndexInvariant(SubscriptionModel.collection);
    if (!invariant.valid) throw transitionNotReady();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw transitionNotReady();
  }
}

export function isSystemSettlementRefund(refund: Pick<RefundDocument, "reasonCode" | "subscriptionImpact" | "amountMinor" | "maximumEligibleRefundMinor">): boolean {
  if (refund.reasonCode === "SYSTEM_REMAINING_BALANCE_REFUND") return true;
  return refund.reasonCode === "VOLUNTARY_CANCELLATION"
    && refund.subscriptionImpact === "CANCEL_AND_MOVE_TO_FREE"
    && refund.amountMinor === refund.maximumEligibleRefundMinor;
}

/**
 * Closes the paid billing record and creates/reuses the canonical Free
 * subscription. This is deliberately separate from provider cancellation:
 * paid access is disabled locally as soon as the refund is authoritative.
 */
export async function completeVoluntaryCancellationLocally(
  refund: RefundDocument,
  session: mongoose.ClientSession,
): Promise<boolean> {
  if (!isSystemSettlementRefund(refund) || !refund.subscriptionId) return false;

  // MongoDB transactions do not support parallel operations on one session.
  // Keep these authoritative reads sequential so the transaction is portable
  // across replica sets and managed development clusters.
  const invoice = refund.invoiceId
    ? await InvoiceModel.findOne({ _id: refund.invoiceId, tenantId: refund.tenantId }).session(session).lean().exec()
    : null;
  const paidSubscription = await SubscriptionModel.findOne({ _id: refund.subscriptionId, tenantId: refund.tenantId }).session(session).exec();
  const freePackage = await PackageModel.findOne({ code: "free", active: true, visibility: "public" }).session(session).lean().exec();
  if (!invoice) throw new Error("Authoritative settlement invoice is unavailable");
  if (!paidSubscription || !freePackage) throw new Error("Canonical Free subscription target is unavailable");

  const inferredRetained = Math.max(0, Number(invoice.amountPaidMinor ?? 0) - Number(invoice.refundedAmountMinor ?? 0) - Number(refund.amountMinor ?? 0));
  const retainedConsumedMinor = Math.max(Number(invoice.retainedConsumedMinor ?? 0), Number(refund.retainedConsumedMinor ?? 0), inferredRetained);
  if (Number(invoice.retainedConsumedMinor ?? 0) < retainedConsumedMinor) {
    await InvoiceModel.updateOne({ _id: invoice._id, tenantId: refund.tenantId }, { $set: { retainedConsumedMinor } }, { session }).exec();
  }
  const remainingRefundableMinor = calculateRemainingRefundableMinor({
    amountPaidMinor: Number(invoice.amountPaidMinor ?? 0),
    retainedConsumedMinor,
    confirmedRefundedMinor: Number(invoice.refundedAmountMinor ?? 0),
    pendingReservedMinor: Number(invoice.reservedRefundAmountMinor ?? 0),
  });
  if (remainingRefundableMinor !== 0) return false;

  const totalRefunded = Number(invoice.refundedAmountMinor ?? 0);
  const fullyRefunded = totalRefunded >= Number(invoice.amountPaidMinor ?? 0);
  await SubscriptionModel.updateOne(
    { _id: paidSubscription._id, tenantId: refund.tenantId },
    {
      $set: {
        status: "CANCELED",
        paymentState: fullyRefunded ? "refunded" : "paid",
        cancelAtPeriodEnd: false,
        cancelledAt: new Date(),
        cancellationReason: "VOLUNTARY_CANCELLATION_REFUND",
      },
    },
    { session },
  ).exec();

  const existingFree = await SubscriptionModel.findOne({
    tenantId: refund.tenantId,
    packageId: freePackage._id,
  }).sort({ createdAt: -1 }).session(session).exec();
  if (!existingFree) {
    await SubscriptionModel.create([{
      tenantId: refund.tenantId,
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
      providerCustomerId: "",
      providerSubscriptionId: "",
      providerPriceId: "",
      provider: "local",
      billingInterval: null,
      paymentState: "paid",
      providerMetadata: {},
      lastProviderEventId: "",
      lastProviderEventTimestamp: null,
      providerStateObservedAt: null,
      revision: 0,
    }], { session });
  } else if (!EFFECTIVE_SUBSCRIPTION_STATUSES.includes(existingFree.status as (typeof EFFECTIVE_SUBSCRIPTION_STATUSES)[number])) {
    await SubscriptionModel.updateOne(
      { _id: existingFree._id, tenantId: refund.tenantId },
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
          providerCustomerId: "",
          providerSubscriptionId: "",
          providerPriceId: "",
          provider: "local",
          billingInterval: null,
          providerMetadata: {},
        },
      },
      { session },
    ).exec();
  }

  const effectiveCount = await SubscriptionModel.countDocuments({
    tenantId: refund.tenantId,
    status: { $in: EFFECTIVE_SUBSCRIPTION_STATUSES },
  }).session(session).exec();
  if (effectiveCount !== 1) throw new Error("Effective subscription invariant failed");

  refund.subscriptionImpact = "CANCEL_AND_MOVE_TO_FREE";
  refund.localTransitionStatus = "SUCCEEDED";
  if (refund.subscriptionImpactStatus === "NOT_REQUIRED" || !refund.subscriptionImpactStatus) refund.subscriptionImpactStatus = "PENDING";
  await refund.save({ session });

  await getAuditWriter().write({
    action: "BILLING_FREE_PLAN_ACTIVATED",
    resourceType: "Subscription",
    resourceId: String(paidSubscription._id),
    tenantId: String(refund.tenantId),
    changes: { reason: "VOLUNTARY_CANCELLATION_REFUND", fullyRefunded },
  });
  return true;
}
