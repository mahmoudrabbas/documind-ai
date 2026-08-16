import { beforeEach, describe, expect, it } from "vitest";
import { FakePaymentProvider } from "../fake-payment-provider.js";
import type { ProviderOperationContext, ProviderSubscription } from "../../payment-provider.port.js";

const subscription: ProviderSubscription = { id: "sub_1", customerId: "cus_1", status: "active", metadata: { tenantId: "tenant-1" }, priceId: "price_1", currentPeriodStart: new Date("2026-01-01"), currentPeriodEnd: new Date("2026-02-01"), cancelAtPeriodEnd: false };
const context = (key = "key-1", fingerprint = "fp-1"): ProviderOperationContext => ({ idempotencyKey: key, requestFingerprint: fingerprint, tenantReference: "tenant-1", operationReference: "op-1" });

describe("FakePaymentProvider Issue 29 contract", () => {
  let fake: FakePaymentProvider;
  beforeEach(() => { fake = new FakePaymentProvider(); fake.seedSubscription(subscription); fake.seedInvoice({ id: "in_1", customerId: "cus_1", subscriptionId: "sub_1", paymentReference: "ch_1", number: "INV-1", status: "paid", currency: "USD", amountDueMinor: 1000, amountPaidMinor: 1000, amountRemainingMinor: 0, refundedAmountMinor: 0, subtotalMinor: 1000, taxMinor: 0, createdAt: new Date("2026-01-02"), dueAt: null, paidAt: new Date("2026-01-02"), periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-02-01"), providerVersion: "v1" }, { hostedInvoiceUrl: "https://invoice.stripe.com/i/1", invoicePdfUrl: "https://pay.stripe.com/i/1.pdf", receiptUrl: null }); });

  it("paginates and ownership-checks invoices and links", async () => {
    const page = await fake.listInvoices({ customerId: "cus_1", limit: 1 }); expect(page.invoices[0]?.id).toBe("in_1");
    expect(await fake.retrieveInvoice({ invoiceId: "in_1", expectedCustomerId: "cus_1" })).toMatchObject({ amountPaidMinor: 1000, currency: "USD", paymentReference: "ch_1" });
    expect((await fake.getSecureInvoiceLinks({ invoiceId: "in_1", expectedCustomerId: "cus_1" })).invoicePdfUrl).toContain("stripe.com");
    await expect(fake.retrieveInvoice({ invoiceId: "in_1", expectedCustomerId: "cus_other" })).rejects.toThrow(/ownership/);
  });

  it("serves an inline PDF for seeded invoices and enforces ownership", async () => {
    const pdf = await fake.retrieveInvoicePdf({ invoiceId: "in_1", expectedCustomerId: "cus_1" });
    expect(pdf.contentType).toBe("application/pdf");
    expect(pdf.data.toString()).toContain("%PDF");
    await expect(fake.retrieveInvoicePdf({ invoiceId: "in_1", expectedCustomerId: "cus_other" })).rejects.toThrow(/ownership/);
    fake.seedInvoice({ id: "in_2", customerId: "cus_1", subscriptionId: "sub_1", number: "INV-2", status: "paid", currency: "USD", amountDueMinor: 100, amountPaidMinor: 100, amountRemainingMinor: 0, subtotalMinor: 100, taxMinor: 0, createdAt: new Date("2026-01-03"), dueAt: null, paidAt: new Date("2026-01-03"), periodStart: null, periodEnd: null, providerVersion: "v1" });
    await expect(fake.retrieveInvoicePdf({ invoiceId: "in_2", expectedCustomerId: "cus_1" })).rejects.toThrow(/PDF is unavailable/);
  });

  it("previews, changes, cancels, and reactivates normalized state", async () => {
    const preview = await fake.previewSubscriptionChange({ subscriptionId: "sub_1", expectedCustomerId: "cus_1", targetPriceReference: "price_2", operationContext: context() });
    expect(preview).toMatchObject({ amountDueMinor: 500, currency: "USD" });
    expect((await fake.updateSubscription({ subscriptionId: "sub_1", expectedCustomerId: "cus_1", targetPriceReference: "price_2", operationContext: context() })).state.priceId).toBe("price_2");
    expect((await fake.scheduleCancellation({ subscriptionId: "sub_1", expectedCustomerId: "cus_1", operationContext: context("cancel") })).state.cancelAtPeriodEnd).toBe(true);
    expect((await fake.reactivateSubscription({ subscriptionId: "sub_1", expectedCustomerId: "cus_1", operationContext: context("reactivate") })).state.cancelAtPeriodEnd).toBe(false);
  });

  it("replays same-key mutations and rejects same-key different payload", async () => {
    const params = { subscriptionId: "sub_1", expectedCustomerId: "cus_1", targetPriceReference: "price_2", operationContext: context() };
    expect((await fake.updateSubscription(params)).idempotentReplay).toBe(false);
    expect((await fake.updateSubscription(params)).idempotentReplay).toBe(true);
    expect(fake.mutationCalls.filter((call) => call === "update")).toHaveLength(1);
    await expect(fake.updateSubscription({ ...params, operationContext: context("key-1", "different") })).rejects.toThrow(/idempotency conflict/);
  });

  it("supports multiple partial/full refunds and deterministic failure simulation", async () => {
    const first = await fake.createRefund({ chargeId: "ch_1", expectedCustomerId: "cus_1", amountMinor: 400, currency: "usd", reason: "requested", operationContext: context("refund-1") });
    const second = await fake.createRefund({ chargeId: "ch_1", expectedCustomerId: "cus_1", amountMinor: 600, currency: "USD", reason: "requested", operationContext: context("refund-2") });
    expect(fake.refunds).toHaveLength(2); expect(await fake.retrieveRefund({ refundId: first.refund.id, expectedCustomerId: "cus_1" })).toMatchObject({ amountMinor: 400 }); expect(second.refund.amountMinor).toBe(600);
    expect(await fake.retrieveInvoice({ invoiceId: "in_1", expectedCustomerId: "cus_1" })).toMatchObject({ refundedAmountMinor: 1000 });
    fake.shouldTimeoutNextOperation = true;
    await expect(fake.cancelImmediately({ subscriptionId: "sub_1", expectedCustomerId: "cus_1", operationContext: context("timeout") })).rejects.toThrow(/timeout/);
  });

  it("simulates stale previews and out-of-order events deterministically", async () => {
    fake.shouldReturnStalePreview = true;
    const preview = await fake.previewSubscriptionChange({ subscriptionId: "sub_1", expectedCustomerId: "cus_1", targetPriceReference: "price_2", operationContext: context() });
    expect(preview.expiresAt.getTime()).toBeLessThan(preview.effectiveAt.getTime());
    expect(fake.seedOutOfOrderEvents([{ id: "evt_1", type: "a", timestamp: new Date(), provider: "fake", raw: {} }, { id: "evt_2", type: "b", timestamp: new Date(), provider: "fake", raw: {} }]).map((event) => event.id)).toEqual(["evt_2", "evt_1"]);
  });
});
