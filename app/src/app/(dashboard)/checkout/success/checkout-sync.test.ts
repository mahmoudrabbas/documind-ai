import { describe, expect, it } from "vitest";
import {
  CHECKOUT_SYNC_WINDOW_MS,
  checkoutSyncErrorPhase,
  checkoutSyncPhase,
  isValidCheckoutSessionId,
} from "./checkout-sync";

describe("checkout subscription synchronization", () => {
  it("recognizes a synchronized paid subscription", () => {
    expect(checkoutSyncPhase({ status: "ACTIVE", paymentState: "paid", providerLinked: true }, 100)).toBe("active");
  });

  it("keeps a delayed provider mapping in the synchronization state", () => {
    expect(checkoutSyncPhase({ status: "ACTIVE", paymentState: "paid", providerLinked: false }, 10_000)).toBe("synchronizing");
  });

  it("reports pending after the bounded synchronization window", () => {
    expect(checkoutSyncPhase({ status: "ACTIVE", paymentState: "paid", providerLinked: false }, CHECKOUT_SYNC_WINDOW_MS)).toBe("pending");
  });

  it("reports an actual provider-linked payment failure", () => {
    expect(checkoutSyncPhase({ status: "PAST_DUE", paymentState: "failed", providerLinked: true }, 1_000)).toBe("payment-incomplete");
  });

  it("validates Stripe Checkout Session IDs before synchronization", () => {
    expect(isValidCheckoutSessionId("cs_test_abc123")).toBe(true);
    expect(isValidCheckoutSessionId("sub_abc123")).toBe(false);
    expect(isValidCheckoutSessionId(null)).toBe(false);
  });

  it("distinguishes safe synchronization failures", () => {
    expect(checkoutSyncErrorPhase("CHECKOUT_SESSION_NOT_FOUND")).toBe("session-not-found");
    expect(checkoutSyncErrorPhase("CHECKOUT_PAYMENT_INCOMPLETE")).toBe("payment-incomplete");
    expect(checkoutSyncErrorPhase("CHECKOUT_SYNC_PROVIDER_UNAVAILABLE")).toBe("provider-unavailable");
  });
});
