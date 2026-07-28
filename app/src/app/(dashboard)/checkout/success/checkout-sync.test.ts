import { describe, expect, it } from "vitest";
import { CHECKOUT_SYNC_WINDOW_MS, checkoutSyncPhase } from "./checkout-sync";

describe("checkout subscription synchronization", () => {
  it("recognizes a synchronized paid subscription", () => {
    expect(checkoutSyncPhase({ status: "ACTIVE", paymentState: "paid", providerSubscriptionId: "sub_1" }, 100)).toBe("active");
  });

  it("keeps a delayed provider mapping in the synchronization state", () => {
    expect(checkoutSyncPhase({ status: "ACTIVE", paymentState: "paid", providerSubscriptionId: "" }, 10_000)).toBe("synchronizing");
  });

  it("reports pending after the bounded synchronization window", () => {
    expect(checkoutSyncPhase({ status: "ACTIVE", paymentState: "paid", providerSubscriptionId: "" }, CHECKOUT_SYNC_WINDOW_MS)).toBe("pending");
  });

  it("reports an actual provider-linked payment failure", () => {
    expect(checkoutSyncPhase({ status: "PAST_DUE", paymentState: "failed", providerSubscriptionId: "sub_1" }, 1_000)).toBe("failed");
  });
});
