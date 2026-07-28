import type { SubscriptionStatus } from "@/types/api/billing.types";

export type CheckoutSyncPhase =
  | "synchronizing"
  | "active"
  | "pending"
  | "payment-incomplete"
  | "provider-unavailable"
  | "session-not-found"
  | "invalid-session";
export const CHECKOUT_SYNC_WINDOW_MS = 30_000;
export const CHECKOUT_SYNC_BACKOFF_MS = [500, 1_000, 2_000, 4_000, 5_000] as const;

export function isValidCheckoutSessionId(value: string | null): value is string {
  return typeof value === "string" && /^cs_(?:test_|live_)?[A-Za-z0-9_]+$/.test(value);
}

export function checkoutSyncErrorPhase(code: string | null): CheckoutSyncPhase | null {
  if (code === "CHECKOUT_SESSION_NOT_FOUND") return "session-not-found";
  if (code === "CHECKOUT_SESSION_INCOMPLETE" || code === "CHECKOUT_PAYMENT_INCOMPLETE") {
    return "payment-incomplete";
  }
  if (code === "CHECKOUT_SYNC_PROVIDER_UNAVAILABLE") return "provider-unavailable";
  return null;
}

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
  ) return "payment-incomplete";
  return elapsedMs >= CHECKOUT_SYNC_WINDOW_MS ? "pending" : "synchronizing";
}
