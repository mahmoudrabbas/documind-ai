import mongoose from "mongoose";
import { getAuditWriter } from "../../common/observability/index.js";
import {
  EFFECTIVE_SUBSCRIPTION_STATUSES,
} from "../../db/subscription-index-invariant.js";
import PackageModel from "../../db/models/package.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";

/**
 * Local Free entitlement cycles use calendar-month arithmetic (not a
 * fixed 30-day duration) so that Free quota resets align with the same
 * monthly boundary that Stripe monthly billing uses.
 *
 * Stripe's `recurring.interval = "month"` (no interval_count) bills on the
 * same day-of-month each cycle: a subscription starting Jan 15 bills again
 * Feb 15, Mar 15, etc. When the day doesn't exist in the target month (Jan
 * 31 → Feb 28), Stripe lands on the last day of the month.
 *
 * Free subscriptions have no provider billing cycle, so the local period
 * is computed with the same calendar-month rules. This avoids the drift
 * that a fixed 30-day offset would introduce over time (since months
 * range from 28 to 31 days).
 *
 * The counter period key (YYYY-MM) is derived from `periodStart`. A local
 * Free subscription has no provider billing cycle, so the entitlement
 * provider advances the period to a fresh calendar-month cycle when the
 * current period expires (`resolveCurrentLocalFreePeriod`). The `periodEnd`
 * is returned to clients via `getPeriodReset()`.
 */

/**
 * Add `months` calendar months to `date`, clamping the day-of-month to the
 * last valid day of the target month.
 *
 * Examples:
 *  - Jan 31 + 1 month → Feb 28 (or Feb 29 in a leap year)
 *  - Jan 15 + 1 month → Feb 15
 *  - Mar 31 + 1 month → Apr 30
 *  - Feb 29 + 1 month → Mar 29 (in a non-leap year, Feb 28 → Mar 28)
 */
export function addCalendarMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();

  result.setUTCMonth(result.getUTCMonth() + months);

  // Handle end-of-month rollback: if the target month is shorter than
  // the original day (e.g. Jan 31 → Feb), JS silently rolls over to the
  // next month. Clamp to the last valid day of the target month.
  if (result.getUTCDate() < day) {
    result.setUTCDate(0); // last day of the previous (target) month
  }

  return result;
}

/**
 * Compute the period boundaries for a new local Free entitlement cycle.
 *
 * Uses calendar-month arithmetic aligned with Stripe's monthly billing:
 * the period ends on the same day-of-month one month ahead (clamped to
 * the last valid day for short months).
 *
 * `now` is accepted as a parameter for testability.
 */
export function computeLocalFreePeriod(
  now = new Date(),
): { periodStart: Date; periodEnd: Date } {
  const periodStart = new Date(now);
  const periodEnd = addCalendarMonths(now, 1);
  return { periodStart, periodEnd };
}

/**
 * Advance a local monthly entitlement period so that the returned period
 * contains `now`.
 *
 * A local Free subscription has a concrete period (`periodStart` →
 * `periodEnd`) but no provider billing cycle to renew it. Once the current
 * time reaches or passes `periodEnd`, the entitlement period rolls forward
 * by whole calendar months until `periodStart <= now < periodEnd`.
 *
 * - Idempotent: if `periodEnd` is already after `now`, the period is
 *   returned unchanged.
 * - Catches up across multiple missed months in a single call (the loop
 *   advances until the period contains `now`).
 * - Deterministic: uses the same calendar-month arithmetic as
 *   `computeLocalFreePeriod`, so consecutive periods differ by exactly one
 *   calendar month and the YYYY-MM counter key strictly advances.
 *
 * `now` is accepted as a parameter for testability.
 */
export function resolveCurrentLocalFreePeriod(
  periodStart: Date,
  periodEnd: Date,
  now = new Date(),
): { periodStart: Date; periodEnd: Date } {
  if (periodEnd.getTime() > now.getTime()) {
    return {
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
    };
  }

  // The current period has expired — start the next cycle at the old
  // period boundary so periods stay contiguous and counter keys strictly
  // advance by one month.
  let start = new Date(periodEnd);
  let end = addCalendarMonths(start, 1);
  while (end.getTime() <= now.getTime()) {
    start = end;
    end = addCalendarMonths(start, 1);
  }

  return { periodStart: start, periodEnd: end };
}

/**
 * Resolve the period boundaries to assign to a new reactivated Free
 * subscription.
 *
 * Priority:
 *  1. An explicitly retained period passed from the outgoing paid
 *     subscription (when the transition replaced a paid subscription
 *     with an active billing period).
 *  2. A freshly computed local Free period using calendar-month arithmetic.
 *
 * In both cases the result is non-null so that the entitlement provider
 * always returns a concrete period range for an active subscription.
 */
export function resolveFreePeriod(
  retained?: { periodStart: Date | null; periodEnd: Date | null },
  now = new Date(),
): { periodStart: Date; periodEnd: Date } {
  if (retained?.periodStart && retained?.periodEnd) {
    return {
      periodStart: retained.periodStart,
      periodEnd: retained.periodEnd,
    };
  }
  if (retained?.periodStart && !retained.periodEnd) {
    // A valid start but a missing end is an invalid state — fall through
    // to a fresh local period rather than risking a "reset now" illusion.
    return computeLocalFreePeriod(retained.periodStart ?? now);
  }
  return computeLocalFreePeriod(now);
}

/**
 * Ensures a tenant that lost its last paid subscription still has an
 * effective subscription by creating or reactivating the canonical Free
 * plan. No-op when an effective subscription already exists (e.g. the
 * refund-to-Free flow created it before the provider cancellation event).
 *
 * When `retainedPeriod` is provided (from the outgoing paid subscription),
 * the Free subscription inherits those period boundaries so that usage
 * counters — keyed by YYYY-MM — are not silently reset.
 */
export async function ensureFreeFallbackSubscription(input: {
  tenantId: string;
  providerCustomerId?: string;
  reason?: string;
  retainedPeriod?: { periodStart: Date | null; periodEnd: Date | null };
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

      const now = new Date();
      const retained = resolveFreePeriod(input.retainedPeriod, now);

      // Canonical Free is always a local entitlement — it carries no
      // provider-linked billing account. `provider` is "local" and
      // `providerSubscriptionId` is "" so `providerLinked` is false,
      // which keeps `canOpenPortal` false even if a `providerCustomerId`
      // is preserved from the outgoing paid subscription.
      //
      // The `providerCustomerId` is intentionally retained from webhook
      // context so that a later Free → Paid checkout can reuse the
      // existing Stripe customer instead of creating a duplicate.
      const providerCustomerId = input.providerCustomerId ?? "";
      const provider = "local";

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
          startedAt: now,
          periodStart: retained.periodStart,
          periodEnd: retained.periodEnd,
          currentPeriodStart: retained.periodStart,
          currentPeriodEnd: retained.periodEnd,
          trialStart: null,
          trialEnd: null,
          cancelledAt: null,
          cancellationReason: "",
          cancelAtPeriodEnd: false,
          providerCustomerId,
          providerSubscriptionId: "",
          providerPriceId: "",
          provider,
          billingInterval: "monthly",
          paymentState: "paid",
          providerMetadata: {},
          lastProviderEventId: "",
          lastProviderEventTimestamp: null,
          providerStateObservedAt: null,
          revision: 0,
        }], { session });
        created = true;
      } else if (!EFFECTIVE_SUBSCRIPTION_STATUSES.includes(existingFree.status as (typeof EFFECTIVE_SUBSCRIPTION_STATUSES)[number])) {
        // Reactivate the existing Free subscription. Preserve any already-valid
        // period boundaries; only fill in missing ones from the retained period
        // or a fresh local cycle.
        const existingPeriodStart = existingFree.periodStart ?? retained.periodStart;
        const existingPeriodEnd = existingFree.periodEnd ?? retained.periodEnd;
        await SubscriptionModel.updateOne(
          { _id: existingFree._id, tenantId: input.tenantId },
          {
            $set: {
              status: "ACTIVE",
              paymentState: "paid",
              cancelAtPeriodEnd: false,
              cancelledAt: null,
              cancellationReason: "",
              periodStart: existingPeriodStart,
              periodEnd: existingPeriodEnd,
              currentPeriodStart: existingPeriodStart,
              currentPeriodEnd: existingPeriodEnd,
              providerCustomerId,
              providerSubscriptionId: "",
              providerPriceId: "",
              provider,
              billingInterval: "monthly",
              providerMetadata: {},
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
