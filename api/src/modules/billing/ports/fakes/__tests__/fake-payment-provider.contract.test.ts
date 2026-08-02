import { describe, beforeEach, afterEach } from "vitest";
import { FakePaymentProvider } from "../fake-payment-provider.js";
import { billingFoundationProviderContractTests, paymentProviderContractTests } from "../../__tests__/payment-provider.contract.suite.js";
import type { ProviderSubscription } from "../../payment-provider.port.js";

describe("FakePaymentProvider", () => {
  let fake: FakePaymentProvider;

  beforeEach(() => {
    fake = new FakePaymentProvider();
    fake._reset();
  });

  afterEach(() => {
    fake._reset();
  });

  paymentProviderContractTests("FakePaymentProvider", () => {
    const p = new FakePaymentProvider();
    p._reset();
    return p;
  });

  billingFoundationProviderContractTests("FakePaymentProvider", () => {
    const provider = new FakePaymentProvider();
    const subscription: ProviderSubscription = { id: "sub_shared", customerId: "cus_shared", status: "active", metadata: {}, priceId: "price_shared", currentPeriodStart: new Date("2026-01-01"), currentPeriodEnd: new Date("2026-02-01"), cancelAtPeriodEnd: false };
    provider.seedSubscription(subscription);
    provider.seedInvoice({ id: "in_shared", customerId: "cus_shared", subscriptionId: "sub_shared", number: "INV", status: "paid", currency: "USD", amountDueMinor: 100, amountPaidMinor: 100, amountRemainingMinor: 0, subtotalMinor: 100, taxMinor: 0, createdAt: new Date(), dueAt: null, paidAt: new Date(), periodStart: null, periodEnd: null, providerVersion: null });
    return { provider, customerId: "cus_shared", subscriptionId: "sub_shared", invoiceId: "in_shared", chargeId: "ch_shared" };
  });
});
