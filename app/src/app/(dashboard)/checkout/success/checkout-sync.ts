import type { SubscriptionStatus } from "@/types/api/billing.types";

export type CheckoutSyncPhase = "synchronizing" | "active" | "pending" | "failed";
export const CHECKOUT_SYNC_WINDOW_MS = 30_000;
export const CHECKOUT_SYNC_BACKOFF_MS = [500, 1_000, 2_000, 4_000, 5_000] as const;

export function checkoutSyncPhase(
  subscription: Pick<SubscriptionStatus, "status" | "paymentState" | "providerSubscriptionId">,
  elapsedMs: number,
): CheckoutSyncPhase {
  const providerLinked = Boolean(subscription.providerSubscriptionId);
  if (
    providerLinked &&
    subscription.status === "ACTIVE" &&
    subscription.paymentState === "paid"
  ) return "active";
  if (
    providerLinked &&
    subscription.paymentState === "failed" &&
    ["PAST_DUE", "UNPAID", "CANCELED", "EXPIRED"].includes(subscription.status)
  ) return "failed";
  return elapsedMs >= CHECKOUT_SYNC_WINDOW_MS ? "pending" : "synchronizing";
}
