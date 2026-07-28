import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { StripePaymentProvider } from "../stripe-payment-provider.js";
import { billingFoundationProviderContractTests, paymentProviderContractTests } from "../../__tests__/payment-provider.contract.suite.js";
import { config } from "../../../../../config/index.js";

vi.mock("../../../../../config/index.js", () => ({ config: { STRIPE_SECRET_KEY: "sk_test_not_real", STRIPE_WEBHOOK_SECRET: "whsec_test_not_real", BILLING_PORTAL_ALLOWED_ORIGIN: "https://example.com", STRIPE_BILLING_PORTAL_GENERAL_CONFIGURATION_ID: "bpc_test_restricted", NODE_ENV: "test" } }));

function stripeSubscription(cancelAtPeriodEnd = false) {
  return { id: "sub_shared", customer: "cus_shared", status: "active", metadata: { tenantId: "tenant-1" }, cancel_at_period_end: cancelAtPeriodEnd, cancel_at: cancelAtPeriodEnd ? 1_769_904_000 : null,
    items: { data: [{ id: "si_1", price: { id: "price_1" }, current_period_start: 1_767_225_600, current_period_end: 1_769_904_000 }] } };
}
function stripeInvoice(customer = "cus_shared") {
  return { id: "in_shared", customer, number: "INV-1", status: "paid", currency: "usd", amount_due: 100, amount_paid: 100, amount_remaining: 0, subtotal: 100, total_taxes: [], created: 1_767_225_600, due_date: null, period_start: 1_767_225_600, period_end: 1_769_904_000, status_transitions: { paid_at: 1_767_225_700 }, hosted_invoice_url: "https://invoice.stripe.com/i/shared", invoice_pdf: "https://pay.stripe.com/i/shared.pdf", parent: { subscription_details: { subscription: "sub_shared" } } };
}
function createMockStripe() {
  let subscription = stripeSubscription();
  const refunds = new Map<string, Record<string, unknown>>();
  const mock = {
    customers: { create: vi.fn(async () => ({ id: "cus_shared" })) },
    checkout: { sessions: {
      create: vi.fn(async (input) => ({ id: "cs_shared", url: "https://checkout.stripe.com/c/shared", status: "open", customer: input.customer, metadata: input.metadata, client_reference_id: input.client_reference_id ?? null, payment_status: "unpaid", subscription: null })),
      retrieve: vi.fn(async () => ({ id: "cs_shared", url: "https://checkout.stripe.com/c/shared", status: "open", customer: "cus_shared", metadata: {}, client_reference_id: null, payment_status: "unpaid", subscription: null })),
    } },
    billingPortal: { sessions: { create: vi.fn(async () => ({ url: "https://billing.stripe.com/p/session" })) } },
    products: { create: vi.fn(async (input) => ({ id: "prod_1", name: input.name })) },
    prices: { create: vi.fn(async (input) => ({ id: "price_1", product: input.product, unit_amount: input.unit_amount, currency: input.currency, recurring: input.recurring })) },
    subscriptions: {
      retrieve: vi.fn(async () => subscription), list: vi.fn(async () => ({ data: [subscription] })),
      update: vi.fn(async (_id, input) => { subscription = { ...subscription, cancel_at_period_end: input.cancel_at_period_end ?? subscription.cancel_at_period_end, cancel_at: input.cancel_at_period_end ? 1_769_904_000 : null }; return subscription; }),
      cancel: vi.fn(async () => ({ ...subscription, status: "canceled", cancel_at_period_end: false, cancel_at: null })),
    },
    invoices: { list: vi.fn(async () => ({ data: [stripeInvoice()], has_more: false })), retrieve: vi.fn(async (_id) => stripeInvoice()), createPreview: vi.fn(async () => stripeInvoice()) },
    invoicePayments: { list: vi.fn(async () => ({ data: [] as Stripe.InvoicePayment[] })) },
    paymentIntents: { retrieve: vi.fn(async () => ({ id: "pi_shared", customer: "cus_shared", latest_charge: "ch_shared" })) },
    charges: { retrieve: vi.fn(async () => ({ id: "ch_shared", customer: "cus_shared", currency: "usd", amount: 1000, amount_refunded: 0, receipt_url: null } as unknown as Stripe.Charge)) },
    refunds: {
      create: vi.fn(async (input) => { const value = { id: "re_shared", charge: input.charge, amount: input.amount, currency: "usd", status: "succeeded", metadata: input.metadata, reason: null, created: 1_767_225_600 }; refunds.set("re_shared", value); return value; }),
      retrieve: vi.fn(async (id) => refunds.get(id) ?? { id, charge: "ch_shared", amount: 100, currency: "usd", status: "succeeded", metadata: {}, reason: null, created: 1_767_225_600 }),
    },
    webhooks: { constructEvent: vi.fn((_body, signature) => { if (signature !== "valid") throw new Error("invalid"); return {}; }) },
  };
  return mock;
}

billingFoundationProviderContractTests("StripePaymentProvider mocked", () => ({
  provider: new StripePaymentProvider(createMockStripe() as unknown as Stripe), customerId: "cus_shared", subscriptionId: "sub_shared", invoiceId: "in_shared", chargeId: "ch_shared",
}));

paymentProviderContractTests("StripePaymentProvider mocked", () => new StripePaymentProvider(createMockStripe() as unknown as Stripe));

describe("StripePaymentProvider Issue 29 security boundary", () => {
  it("passes mutation idempotency keys via Stripe request options", async () => {
    const stripe = createMockStripe(); const provider = new StripePaymentProvider(stripe as unknown as Stripe);
    await provider.scheduleCancellation({ subscriptionId: "sub_shared", expectedCustomerId: "cus_shared", operationContext: { idempotencyKey: "idem-safe", requestFingerprint: "fp", tenantReference: "tenant", operationReference: "operation" } });
    expect(stripe.subscriptions.update).toHaveBeenCalledWith("sub_shared", expect.anything(), { idempotencyKey: "idem-safe" });
  });
  it("keeps payment-method portal configuration and idempotency inside the adapter", async () => {
    const stripe = createMockStripe(); const provider = new StripePaymentProvider(stripe as unknown as Stripe);
    await provider.createBillingPortalSession({ customerId: "cus_shared", returnUrl: "https://example.com/dashboard/settings/billing", flow: "payment_method_update", operationContext: { idempotencyKey: "portal-idem", requestFingerprint: "portal-fp", tenantReference: "tenant", operationReference: "request" } });
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_shared", flow_data: { type: "payment_method_update" } }), { idempotencyKey: "portal-idem" });
  });
  it("requires a restricted Stripe configuration for the general Phase 2 portal flow", async () => {
    const previous = config.STRIPE_BILLING_PORTAL_GENERAL_CONFIGURATION_ID;
    config.STRIPE_BILLING_PORTAL_GENERAL_CONFIGURATION_ID = "";
    const stripe = createMockStripe();
    const provider = new StripePaymentProvider(stripe as unknown as Stripe);
    await expect(provider.createBillingPortalSession({ customerId: "cus_shared", returnUrl: "https://example.com/dashboard/settings/billing", flow: "general", operationContext: { idempotencyKey: "portal-general", requestFingerprint: "portal-general", tenantReference: "tenant", operationReference: "request" } })).rejects.toMatchObject({ code: "BILLING_PROVIDER_CONFIGURATION_INVALID" });
    config.STRIPE_BILLING_PORTAL_GENERAL_CONFIGURATION_ID = previous;
  });
  it("rejects an invoice returned under another customer during listing", async () => {
    const stripe = createMockStripe();
    stripe.invoices.list.mockResolvedValue({ data: [stripeInvoice("cus_foreign")], has_more: false });
    await expect(new StripePaymentProvider(stripe as unknown as Stripe).listInvoices({ customerId: "cus_shared", limit: 10 })).rejects.toThrow(/ownership/i);
  });
  it("rejects invalid signatures and accepts verifier-confirmed signatures", () => {
    const provider = new StripePaymentProvider(createMockStripe() as unknown as Stripe);
    expect(provider.verifyWebhookSignature("{}", "invalid")).toBe(false);
    expect(provider.verifyWebhookSignature("{}", "valid")).toBe(true);
  });
  it("drops non-Stripe and insecure invoice links", async () => {
    const stripe = createMockStripe(); stripe.invoices.retrieve.mockResolvedValue({ ...stripeInvoice(), hosted_invoice_url: "https://evil.example/i", invoice_pdf: "http://invoice.stripe.com/i.pdf" });
    const links = await new StripePaymentProvider(stripe as unknown as Stripe).getSecureInvoiceLinks({ invoiceId: "in_shared", expectedCustomerId: "cus_shared" });
    expect(links).toEqual({ hostedInvoiceUrl: null, invoicePdfUrl: null, receiptUrl: null });
  });
  it("returns an allowlisted receipt after invoice-payment and charge ownership checks", async () => {
    const stripe = createMockStripe();
    stripe.invoicePayments.list.mockResolvedValue({ data: [{ payment: { type: "charge", charge: "ch_shared" } } as Stripe.InvoicePayment] });
    stripe.charges.retrieve.mockResolvedValue({ id: "ch_shared", customer: "cus_shared", currency: "usd", amount: 1000, amount_refunded: 0, receipt_url: "https://pay.stripe.com/receipts/shared" } as unknown as Stripe.Charge);
    const links = await new StripePaymentProvider(stripe as unknown as Stripe).getSecureInvoiceLinks({ invoiceId: "in_shared", expectedCustomerId: "cus_shared" });
    expect(links.receiptUrl).toBe("https://pay.stripe.com/receipts/shared");
  });
});
