import mongoose, { Types } from "mongoose";
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
import { resolveFreePeriod } from "./free-fallback.service.js";

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
 *
 * The historical paid subscription is the durable source of truth for which
 * state applies:
 *
 * - CASE A — the paid subscription is still effective: the paid-to-Free
 *   transition has not happened yet, so the exact effective-subscription index
 *   must exist and the canonical Free package must be available. This keeps the
 *   original protection intact.
 *
 * - CASE B — the historical paid subscription is already CANCELED: the
 *   paid-to-Free requirement is already satisfied, but ONLY if the tenant is
 *   authoritatively on a single serviceable canonical Free subscription right
 *   now. A CANCELED paid subscription alone is never enough — confirmation
 *   fails closed unless that proof holds.
 */
export async function assertSystemRefundTransitionReady(input: {
  tenantId: string;
  subscriptionId: string;
  refund?: Pick<RefundDocument, "subscriptionImpactStatus" | "localTransitionStatus">;
}): Promise<void> {
  try {
    const freePackage = await PackageModel.findOne({ code: "free", active: true, visibility: "public" }).lean().exec();
    if (!freePackage) throw transitionNotReady();

    const paidSubscription = await SubscriptionModel.findOne({ _id: input.subscriptionId, tenantId: input.tenantId }).lean().exec();
    if (!paidSubscription) throw transitionNotReady();

    if (EFFECTIVE_SUBSCRIPTION_STATUSES.includes(paidSubscription.status as (typeof EFFECTIVE_SUBSCRIPTION_STATUSES)[number])) {
      const invariant = await inspectSubscriptionIndexInvariant(SubscriptionModel.collection);
      if (!invariant.valid) throw transitionNotReady();
      return;
    }

    if (paidSubscription.status !== "CANCELED") {
      // EXPIRED / UNPAID / any other terminal state is not provably a completed
      // paid-to-Free transition — fail closed rather than infer one.
      throw transitionNotReady();
    }

    await assertAlreadyFree(input.tenantId, String(freePackage._id), input.refund);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw transitionNotReady();
  }
}

/**
 * CASE B proof: the historical paid subscription is already CANCELED, so the
 * paid-to-Free requirement is satisfied only when the tenant is, right now,
 * on exactly one serviceable canonical Free subscription. This is never
 * inferred from a CANCELED subscription by itself, from package display text,
 * or from a missing transition status — each condition must hold authoritatively.
 */
async function assertAlreadyFree(
  tenantId: string,
  freePackageId: string,
  refund?: Pick<RefundDocument, "subscriptionImpactStatus" | "localTransitionStatus">,
): Promise<void> {
  const effective = await SubscriptionModel.find({
    tenantId: new Types.ObjectId(tenantId),
    status: { $in: [...EFFECTIVE_SUBSCRIPTION_STATUSES] },
  }).lean().exec();

  // Exactly one effective subscription must exist: none means the transition
  // never produced Free, more than one is ambiguous. Both fail closed.
  if (effective.length !== 1) throw transitionNotReady();

  const current = effective[0];
  // The current subscription must BE the canonical Free package by authoritative
  // package identity — never by name or UI text.
  if (!current.packageId || String(current.packageId) !== freePackageId) throw transitionNotReady();
  // Must be serviceable (canonical Free is always ACTIVE with no provider cycle).
  if (current.status !== "ACTIVE") throw transitionNotReady();
  if (current.provider !== "local" || Boolean(current.providerSubscriptionId)) throw transitionNotReady();

  // No unresolved transition state on the refund being confirmed.
  if (refund) {
    if (refund.subscriptionImpactStatus === "RETRY_PENDING" || refund.localTransitionStatus === "RETRY_PENDING") throw transitionNotReady();
  }

  // The effective-subscription uniqueness guarantee must still hold so the
  // "actual current subscription" proof cannot drift.
  const invariant = await inspectSubscriptionIndexInvariant(SubscriptionModel.collection);
  if (!invariant.valid) throw transitionNotReady();
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

  const retained = resolveFreePeriod({
    periodStart: paidSubscription.periodStart,
    periodEnd: paidSubscription.periodEnd,
  });

   if (!existingFree) {
     await SubscriptionModel.create([{
       tenantId: refund.tenantId,
       packageId: freePackage._id,
       packageVersion: freePackage.version,
       packageVersionId: null,
       status: "ACTIVE",
       startedAt: new Date(),
       periodStart: retained.periodStart,
       periodEnd: retained.periodEnd,
       currentPeriodStart: retained.periodStart,
       currentPeriodEnd: retained.periodEnd,
       trialStart: null,
       trialEnd: null,
       cancelledAt: null,
       cancellationReason: "",
       cancelAtPeriodEnd: false,
       providerCustomerId: paidSubscription.providerCustomerId ?? "",
       providerSubscriptionId: "",
       providerPriceId: "",
       provider: "local",
       billingInterval: "monthly",
      paymentState: "paid",
      providerMetadata: {},
      lastProviderEventId: "",
      lastProviderEventTimestamp: null,
      providerStateObservedAt: null,
      revision: 0,
    }], { session });
  } else if (!EFFECTIVE_SUBSCRIPTION_STATUSES.includes(existingFree.status as (typeof EFFECTIVE_SUBSCRIPTION_STATUSES)[number])) {
    // Preserve any already-valid period boundaries; only fill in missing ones
    // from the retained period or a fresh local cycle.
    const periodStart = existingFree.periodStart ?? retained.periodStart;
    const periodEnd = existingFree.periodEnd ?? retained.periodEnd;
    await SubscriptionModel.updateOne(
      { _id: existingFree._id, tenantId: refund.tenantId },
      {
        $set: {
          status: "ACTIVE",
          paymentState: "paid",
          cancelAtPeriodEnd: false,
          cancelledAt: null,
          cancellationReason: "",
          periodStart,
          periodEnd,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
         providerCustomerId: paidSubscription.providerCustomerId ?? "",
       providerSubscriptionId: "",
       providerPriceId: "",
       provider: "local",
       billingInterval: "monthly",
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
