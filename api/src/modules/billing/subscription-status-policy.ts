import type {
  PaymentState,
  SubscriptionStatus,
} from "../../db/models/subscription.model.js";

/**
 * Subscription statuses under which a tenant keeps access to the package's
 * entitlements. Every other status in `SubscriptionStatus` is treated as
 * non-serviceable.
 */
export const SERVICEABLE_STATUSES: ReadonlySet<SubscriptionStatus> =
  new Set<SubscriptionStatus>([
    "ACTIVE",
    "TRIALING",
    "CANCEL_AT_PERIOD_END",
    "PAST_DUE",
  ]);

/**
 * Returns whether a subscription status still entitles the tenant to the
 * package's entitlements.
 *
 * @param status - the subscription status to evaluate
 * @returns true only for ACTIVE, TRIALING, CANCEL_AT_PERIOD_END and PAST_DUE;
 * false for every other (or unknown) status
 */
export function isServiceableStatus(status: SubscriptionStatus): boolean {
  return SERVICEABLE_STATUSES.has(status);
}

/**
 * Returns whether a payment state alone blocks entitlement access.
 *
 * "refunded" is terminal and always blocks access. "paid" never blocks.
 * "pending" and "failed" are TRANSIENT states: they do not decide access on
 * their own — governance for those states is DELEGATED to the status policy
 * (`isServiceableStatus`). Callers MUST compose this function with
 * `isServiceableStatus` so a tenant in a transient payment state is only
 * granted entitlements when their subscription status is also serviceable.
 *
 * @param state - the payment state to evaluate
 * @returns false for "refunded"; true for every other state
 */
export function isServiceablePaymentState(state: PaymentState): boolean {
  return state !== "refunded";
}
