import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-client";
import {
  classifyCheckoutError,
  getCurrentPackageId,
  hasBlockingProviderSubscription,
} from "./checkout-state";

describe("checkout-state", () => {
  it("detects active provider-backed subscriptions", () => {
    expect(
      hasBlockingProviderSubscription({
        status: "ACTIVE",
        providerLinked: true,
      }),
    ).toBe(true);
    expect(
      hasBlockingProviderSubscription({
        status: "CANCELED",
        providerLinked: true,
      }),
    ).toBe(false);
  });

  it("treats a provider-backed subscription with an effective scheduled cancellation as non-blocking", () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    expect(
      hasBlockingProviderSubscription({
        status: "CANCEL_AT_PERIOD_END",
        providerLinked: true,
        cancelAtPeriodEnd: true,
        periodEnd: past,
      }),
    ).toBe(false);

    expect(
      hasBlockingProviderSubscription({
        status: "ACTIVE",
        providerLinked: true,
        cancelAtPeriodEnd: true,
        periodEnd: past,
      }),
    ).toBe(false);

    expect(
      hasBlockingProviderSubscription({
        status: "CANCEL_AT_PERIOD_END",
        providerLinked: true,
        cancelAtPeriodEnd: true,
        periodEnd: future,
      }),
    ).toBe(true);
  });

  it("resolves the current package id from populated or raw values", () => {
    expect(
      getCurrentPackageId({
        status: "ACTIVE",
        providerLinked: true,
        providerManaged: true,
        packageId: { _id: "pkg_123", name: "Real Pro" } as never,
      }),
    ).toBe("pkg_123");
    expect(
      getCurrentPackageId({
        status: "ACTIVE",
        providerLinked: true,
        providerManaged: true,
        packageId: "pkg_456" as never,
      }),
    ).toBe("pkg_456");
  });

  it("maps ACTIVE_SUBSCRIPTION_EXISTS to a billing-portal friendly state", () => {
    const conflict = classifyCheckoutError(
      new ApiError({
        status: 409,
        code: "ACTIVE_SUBSCRIPTION_EXISTS",
        message: "You already have an active subscription.",
        details: {
          currentStatus: "ACTIVE",
          currentPackageName: "Real Pro",
          manageBillingAvailable: true,
        },
      }),
    );

    expect(conflict).toEqual(
      expect.objectContaining({
        kind: "active-subscription",
        message: "You already have an active subscription.",
        manageBillingAvailable: true,
      }),
    );
  });

  it("maps CHECKOUT_SESSION_PENDING to a continue-checkout state only with a usable URL", () => {
    const conflict = classifyCheckoutError(
      new ApiError({
        status: 409,
        code: "CHECKOUT_SESSION_PENDING",
        message: "A checkout session is already in progress.",
        details: {
          reusableCheckoutUrl: "https://checkout.stripe.com/c/pay/cs_123",
        },
      }),
    );

    expect(conflict).toEqual(
      expect.objectContaining({
        kind: "checkout-pending",
        reusableCheckoutUrl: "https://checkout.stripe.com/c/pay/cs_123",
      }),
    );
  });

  it("does not surface continue checkout for missing or empty URLs", () => {
    const conflict = classifyCheckoutError(
      new ApiError({
        status: 409,
        code: "CHECKOUT_SESSION_PENDING",
        message: "A checkout session is already in progress.",
        details: {},
      }),
    );

    expect(conflict).toEqual(
      expect.objectContaining({
        kind: "checkout-pending",
        reusableCheckoutUrl: null,
      }),
    );
  });
});
