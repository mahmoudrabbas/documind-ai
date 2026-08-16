import { describe, it, expect, vi } from "vitest";

const configMock = {
  STRIPE_BILLING_PORTAL_GENERAL_CONFIGURATION_ID: "bpc_general_valid",
  STRIPE_BILLING_PORTAL_PAYMENT_METHOD_CONFIGURATION_ID: "bpc_pm_valid",
};

vi.mock("../../config/index.js", () => ({ config: configMock }));

const { isBillingPortalFlowAvailable, assertBillingPortalFlowAvailable } = await import("./portal-flow-policy.js");

describe("portal-flow-policy", () => {
  it("always allows flows for non-Stripe providers regardless of configuration", () => {
    expect(isBillingPortalFlowAvailable("fake", "general")).toBe(true);
    expect(isBillingPortalFlowAvailable("fake", "payment_method_update")).toBe(true);
    expect(isBillingPortalFlowAvailable(null, "general")).toBe(true);
    expect(isBillingPortalFlowAvailable(undefined, "payment_method_update")).toBe(true);
  });

  it("allows both flows for Stripe when both configuration IDs are present", () => {
    expect(isBillingPortalFlowAvailable("stripe", "general")).toBe(true);
    expect(isBillingPortalFlowAvailable("stripe", "payment_method_update")).toBe(true);
  });

  it("rejects the general flow for Stripe when only the general configuration is missing", () => {
    const previous = configMock.STRIPE_BILLING_PORTAL_GENERAL_CONFIGURATION_ID;
    configMock.STRIPE_BILLING_PORTAL_GENERAL_CONFIGURATION_ID = "";
    expect(isBillingPortalFlowAvailable("stripe", "general")).toBe(false);
    expect(isBillingPortalFlowAvailable("stripe", "payment_method_update")).toBe(true);
    configMock.STRIPE_BILLING_PORTAL_GENERAL_CONFIGURATION_ID = previous;
  });

  it("rejects the payment_method_update flow for Stripe when only the payment-method configuration is missing", () => {
    const previous = configMock.STRIPE_BILLING_PORTAL_PAYMENT_METHOD_CONFIGURATION_ID;
    configMock.STRIPE_BILLING_PORTAL_PAYMENT_METHOD_CONFIGURATION_ID = "";
    expect(isBillingPortalFlowAvailable("stripe", "general")).toBe(true);
    expect(isBillingPortalFlowAvailable("stripe", "payment_method_update")).toBe(false);
    configMock.STRIPE_BILLING_PORTAL_PAYMENT_METHOD_CONFIGURATION_ID = previous;
  });

  it("rejects both flows for Stripe when both configuration IDs are missing", () => {
    const prevGeneral = configMock.STRIPE_BILLING_PORTAL_GENERAL_CONFIGURATION_ID;
    const prevPm = configMock.STRIPE_BILLING_PORTAL_PAYMENT_METHOD_CONFIGURATION_ID;
    configMock.STRIPE_BILLING_PORTAL_GENERAL_CONFIGURATION_ID = "";
    configMock.STRIPE_BILLING_PORTAL_PAYMENT_METHOD_CONFIGURATION_ID = "";
    expect(isBillingPortalFlowAvailable("stripe", "general")).toBe(false);
    expect(isBillingPortalFlowAvailable("stripe", "payment_method_update")).toBe(false);
    configMock.STRIPE_BILLING_PORTAL_GENERAL_CONFIGURATION_ID = prevGeneral;
    configMock.STRIPE_BILLING_PORTAL_PAYMENT_METHOD_CONFIGURATION_ID = prevPm;
  });

  it("throws BILLING_PROVIDER_CONFIGURATION_INVALID for Stripe payment_method_update without configuration", () => {
    const previous = configMock.STRIPE_BILLING_PORTAL_PAYMENT_METHOD_CONFIGURATION_ID;
    configMock.STRIPE_BILLING_PORTAL_PAYMENT_METHOD_CONFIGURATION_ID = "";
    expect(() => assertBillingPortalFlowAvailable("stripe", "payment_method_update")).toThrow(expect.objectContaining({ code: "BILLING_PROVIDER_CONFIGURATION_INVALID" }));
    configMock.STRIPE_BILLING_PORTAL_PAYMENT_METHOD_CONFIGURATION_ID = previous;
  });

  it("throws BILLING_PROVIDER_CONFIGURATION_INVALID for Stripe general without configuration", () => {
    const previous = configMock.STRIPE_BILLING_PORTAL_GENERAL_CONFIGURATION_ID;
    configMock.STRIPE_BILLING_PORTAL_GENERAL_CONFIGURATION_ID = "";
    expect(() => assertBillingPortalFlowAvailable("stripe", "general")).toThrow(expect.objectContaining({ code: "BILLING_PROVIDER_CONFIGURATION_INVALID" }));
    configMock.STRIPE_BILLING_PORTAL_GENERAL_CONFIGURATION_ID = previous;
  });

  it("does not throw for a non-Stripe provider even with both configurations missing", () => {
    const prevGeneral = configMock.STRIPE_BILLING_PORTAL_GENERAL_CONFIGURATION_ID;
    const prevPm = configMock.STRIPE_BILLING_PORTAL_PAYMENT_METHOD_CONFIGURATION_ID;
    configMock.STRIPE_BILLING_PORTAL_GENERAL_CONFIGURATION_ID = "";
    configMock.STRIPE_BILLING_PORTAL_PAYMENT_METHOD_CONFIGURATION_ID = "";
    expect(() => assertBillingPortalFlowAvailable("fake", "general")).not.toThrow();
    expect(() => assertBillingPortalFlowAvailable("fake", "payment_method_update")).not.toThrow();
    configMock.STRIPE_BILLING_PORTAL_GENERAL_CONFIGURATION_ID = prevGeneral;
    configMock.STRIPE_BILLING_PORTAL_PAYMENT_METHOD_CONFIGURATION_ID = prevPm;
  });
});
