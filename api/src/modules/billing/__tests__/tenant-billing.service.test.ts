import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../config/index.js", () => ({ config: { NODE_ENV: "test", BILLING_PORTAL_ALLOWED_ORIGIN: "https://app.example.test", BILLING_PAST_DUE_GRACE_DAYS: 7, STRIPE_BILLING_PORTAL_GENERAL_CONFIGURATION_ID: "", STRIPE_BILLING_PORTAL_PAYMENT_METHOD_CONFIGURATION_ID: "" } }));
vi.mock("../../../db/models/subscription.model.js", () => ({ default: { findOne: vi.fn() } }));
vi.mock("../../../db/models/refund.model.js", () => ({ default: { findOne: vi.fn(), find: vi.fn() } }));
vi.mock("../../../db/models/invoice.model.js", () => ({ default: { findOne: vi.fn(), find: vi.fn(), countDocuments: vi.fn(), aggregate: vi.fn() } }));
vi.mock("../../../db/models/billingOperation.model.js", () => ({ default: { findOne: vi.fn(), exists: vi.fn() } }));
vi.mock("../../../common/observability/index.js", () => ({
  getAuditWriter: () => ({ write: vi.fn().mockResolvedValue(true) }),
  getMetricRecorder: () => ({ increment: vi.fn(), histogram: vi.fn(), gauge: vi.fn() }),
}));
vi.mock("../../permissions/permissions.operation.js", () => ({ authorizeTenantOperation: vi.fn(async (context: Record<string, unknown>) => ({ ...context, actorKind: "USER" })) }));
vi.mock("../../permissions/permissions.authorization.js", () => ({ authorizePermission: vi.fn().mockResolvedValue({ allowed: true }) }));

import SubscriptionModel from "../../../db/models/subscription.model.js";
import RefundModel from "../../../db/models/refund.model.js";
import InvoiceModel from "../../../db/models/invoice.model.js";
import BillingOperationModel from "../../../db/models/billingOperation.model.js";
import { authorizePermission } from "../../permissions/permissions.authorization.js";
import { FakePaymentProvider } from "../ports/fakes/fake-payment-provider.js";
import { createCompanyPortalSession, getCompanyBillingSummary, getCompanyInvoice, getCompanyInvoiceLinks, getCompanyInvoicePdf, listCompanyInvoices } from "../tenant-billing.service.js";
import { invoiceListSchema, portalSessionSchema } from "../tenant-billing.validator.js";

const tenantId = "507f1f77bcf86cd799439011";
const otherTenantId = "507f1f77bcf86cd799439099";
const subscriptionId = "507f1f77bcf86cd799439012";
const invoiceId = "507f1f77bcf86cd799439013";
const context = { tenantId, actorId: "507f1f77bcf86cd799439014", actorEmail: "admin@example.test", actorRole: "COMPANY_ADMIN" as const, traceId: "trace", requestId: "request" };

function chain<T>(value: T) {
  const result = { populate: vi.fn(), select: vi.fn(), sort: vi.fn(), skip: vi.fn(), limit: vi.fn(), lean: vi.fn(), exec: vi.fn().mockResolvedValue(value) };
  for (const method of ["populate", "select", "sort", "skip", "limit", "lean"] as const) result[method].mockReturnValue(result);
  return result;
}

const subscription = {
  _id: subscriptionId, tenantId, packageId: { _id: "pkg", name: "Pro", code: "pro", version: 2, providerPriceId: "price_private" },
  packageVersion: 2, status: "ACTIVE", paymentState: "paid", billingInterval: "monthly", cancelAtPeriodEnd: false,
  currentPeriodStart: new Date("2026-07-01"), currentPeriodEnd: new Date("2026-08-01"), provider: "fake",
  providerCustomerId: "cus_owned", providerSubscriptionId: "sub_owned", providerPriceId: "price_private", lastProviderEventId: "evt_private",
};

describe("tenant billing service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ now: new Date("2026-07-31T12:00:00.000Z") });
    vi.mocked(SubscriptionModel.findOne).mockReturnValue(chain(subscription) as never);
    vi.mocked(RefundModel.findOne).mockReturnValue(chain(null) as never);
    vi.mocked(RefundModel.find).mockReturnValue(chain([]) as never);
    vi.mocked(BillingOperationModel.findOne).mockReturnValue(chain(null) as never);
    vi.mocked(BillingOperationModel.exists).mockResolvedValue(null);
    vi.mocked(InvoiceModel.aggregate).mockResolvedValue([{ _id: "paid", count: 2 }, { _id: "open", count: 1 }]);
    vi.mocked(InvoiceModel.countDocuments).mockResolvedValue(1);
  });

  afterEach(() => vi.useRealTimers());

  it("returns a tenant-safe summary with only Phase 2 capabilities", async () => {
    const result = await getCompanyBillingSummary(tenantId, context);
    expect(result).toMatchObject({ providerLinked: true, canOpenPortal: true, canUpdatePaymentMethod: true, canViewInvoices: true, canChangePlan: true, canCancel: true, canReactivate: false, canRequestRefund: true, invoiceSummary: { total: 3, paid: 2, open: 1 } });
    expect(JSON.stringify(result)).not.toMatch(/cus_owned|sub_owned|price_private|evt_private|providerCustomerId|providerSubscriptionId|providerPriceId/);
  });

  it("returns a fail-closed transition summary instead of 404 when a confirmed settlement is awaiting Free activation", async () => {
    vi.mocked(SubscriptionModel.findOne)
      .mockReturnValueOnce(chain(null) as never)
      .mockReturnValueOnce(chain({ ...subscription, status: "CANCELED" }) as never);
    vi.mocked(RefundModel.findOne).mockReturnValue(chain({
      subscriptionId,
      localTransitionStatus: "RETRY_PENDING",
      subscriptionImpactStatus: "RETRY_PENDING",
    }) as never);

    const result = await getCompanyBillingSummary(tenantId, context);

    expect(result).toMatchObject({
      status: "CANCELED",
      transitionState: "TRANSITION_RETRYABLE",
      canOpenPortal: false,
      canUpdatePaymentMethod: false,
      canChangePlan: false,
      canCancel: false,
      canReactivate: false,
      canRequestRefund: false,
      lifecycle: { eligible: false, reason: "REFUND_TRANSITION_PENDING" },
    });
  });

  it("keeps read-only billing summaries non-actionable for callers without billing:manage", async () => {
    vi.mocked(authorizePermission).mockRejectedValueOnce(new Error("denied"));
    const result = await getCompanyBillingSummary(tenantId, context);
    expect(result).toMatchObject({ canOpenPortal: false, canUpdatePaymentMethod: false, canViewInvoices: true, canChangePlan: false, canCancel: false, canReactivate: false, canRequestRefund: false });
  });

  it("enables reactivation while a cancellation is scheduled and hides further cancellation", async () => {
    vi.mocked(SubscriptionModel.findOne).mockReturnValue(chain({ ...subscription, status: "CANCEL_AT_PERIOD_END", cancelAtPeriodEnd: true }) as never);
    const result = await getCompanyBillingSummary(tenantId, context);
    expect(result).toMatchObject({ canChangePlan: true, canCancel: false, canReactivate: true });
  });

  it("rejects arbitrary portal configuration and unbounded invoice requests", () => {
    expect(() => portalSessionSchema.parse({ flow: "payment_method_update", returnUrl: "https://evil.example" })).toThrow();
    expect(() => invoiceListSchema.parse({ pageSize: 51 })).toThrow();
    expect(invoiceListSchema.parse({ page: "2", pageSize: "10", status: "paid" })).toMatchObject({ page: 2, pageSize: 10, status: "paid" });
  });

  it("creates both portal intents with a server-controlled safe return URL", async () => {
    const provider = new FakePaymentProvider();
    const general = await createCompanyPortalSession({ tenantId, flow: "general", returnUrl: "https://app.example.test/dashboard/settings/billing", provider, context });
    const payment = await createCompanyPortalSession({ tenantId, flow: "payment_method_update", returnUrl: "https://app.example.test/dashboard/settings/billing", provider, context });
    expect(general.url).toContain("flow=general");
    expect(payment.url).toContain("flow=payment_method_update");
    expect(JSON.stringify(payment)).not.toContain("cus_owned");
  });

  it("fails safe for Stripe-backed portal flows until explicit configurations exist", async () => {
    vi.mocked(SubscriptionModel.findOne).mockReturnValue(chain({ ...subscription, provider: "stripe" }) as never);
    const provider = new FakePaymentProvider();
    await expect(createCompanyPortalSession({ tenantId, flow: "general", returnUrl: "https://app.example.test/dashboard/settings/billing", provider, context })).rejects.toMatchObject({ code: "BILLING_PROVIDER_CONFIGURATION_INVALID" });
    await expect(createCompanyPortalSession({ tenantId, flow: "payment_method_update", returnUrl: "https://app.example.test/dashboard/settings/billing", provider, context })).rejects.toMatchObject({ code: "BILLING_PROVIDER_CONFIGURATION_INVALID" });
  });

  it("denies an attempted cross-tenant service call without querying invoices", async () => {
    await expect(listCompanyInvoices({ tenantId: otherTenantId, page: 1, pageSize: 10, context })).rejects.toMatchObject({ statusCode: 404 });
    expect(InvoiceModel.find).not.toHaveBeenCalled();
  });

  it("paginates local tenant invoices without provider identifiers or links", async () => {
    vi.mocked(InvoiceModel.find).mockReturnValue(chain([{ _id: invoiceId, tenantId, subscriptionId, providerInvoiceId: "in_private", invoiceNumber: "INV-1", status: "paid", currency: "USD", amountDueMinor: 1000, amountPaidMinor: 1000, amountRemainingMinor: 0, subtotalMinor: 1000, taxMinor: 0, createdAtProvider: new Date("2026-07-01"), dueAt: null, paidAt: new Date("2026-07-01"), periodStart: null, periodEnd: null, retainedConsumedMinor: 0, refundedAmountMinor: 0, reservedRefundAmountMinor: 0, hostedInvoiceAvailable: true, hostedInvoiceUrl: "https://secret" }]) as never);
    const result = await listCompanyInvoices({ tenantId, page: 1, pageSize: 10, status: "paid", context });
    expect(result.pagination).toEqual({ page: 1, pageSize: 10, totalRecords: 1, totalPages: 1 });
    expect(result.invoices[0]).toMatchObject({ id: invoiceId, amountPaidMinor: 1000, hostedInvoiceAvailable: true, remainingRefundableMinor: 1000, canRequestRefund: true });
    expect(JSON.stringify(result)).not.toMatch(/in_private|hostedInvoiceUrl|https:\/\/secret/);
  });

  it("reports zero remaining refundable balance for an invoice fully consumed by a pending reserved refund", async () => {
    vi.mocked(InvoiceModel.find).mockReturnValue(chain([{ _id: invoiceId, tenantId, subscriptionId, providerInvoiceId: "in_private", invoiceNumber: "INV-1", status: "paid", currency: "USD", amountDueMinor: 500, amountPaidMinor: 500, amountRemainingMinor: 0, subtotalMinor: 500, taxMinor: 0, createdAtProvider: new Date("2026-07-01"), dueAt: null, paidAt: new Date("2026-07-01"), periodStart: null, periodEnd: null, retainedConsumedMinor: 0, refundedAmountMinor: 0, reservedRefundAmountMinor: 488, hostedInvoiceAvailable: true, hostedInvoiceUrl: "https://secret" }]) as never);
    vi.mocked(RefundModel.find).mockReturnValue(chain([{ invoiceId, retainedConsumedMinor: 12 }]) as never);
    const result = await listCompanyInvoices({ tenantId, page: 1, pageSize: 10, status: "paid", context });
    expect(result.invoices[0]).toMatchObject({
      remainingRefundableMinor: 0,
      reservedRefundAmountMinor: 488,
      retainedConsumedMinor: 0,
      grossUnrefundedMinor: 12,
      canRequestRefund: false,
    });
  });

  it("returns a fully-reserved invoice with zero remaining refundable balance via the single-invoice endpoint", async () => {
    vi.mocked(InvoiceModel.findOne).mockReturnValue(chain({ _id: invoiceId, tenantId, subscriptionId, providerInvoiceId: "in_private", invoiceNumber: "INV-1", status: "paid", currency: "USD", amountDueMinor: 500, amountPaidMinor: 500, amountRemainingMinor: 0, subtotalMinor: 500, taxMinor: 0, createdAtProvider: new Date("2026-07-01"), dueAt: null, paidAt: new Date("2026-07-01"), periodStart: null, periodEnd: null, retainedConsumedMinor: 0, refundedAmountMinor: 0, reservedRefundAmountMinor: 488, hostedInvoiceAvailable: true }) as never);
    vi.mocked(RefundModel.find).mockReturnValue(chain([{ retainedConsumedMinor: 12 }]) as never);
    const result = await getCompanyInvoice(invoiceId, tenantId, context);
    expect(result).toMatchObject({
      remainingRefundableMinor: 0,
      reservedRefundAmountMinor: 488,
      canRequestRefund: false,
    });
  });

  it("uses a local tenant invoice ID and revalidates provider ownership for links", async () => {
    vi.mocked(InvoiceModel.findOne).mockReturnValue(chain({ _id: invoiceId, tenantId, subscriptionId, providerInvoiceId: "in_owned" }) as never);
    const provider = new FakePaymentProvider();
    provider.seedInvoice({ id: "in_owned", customerId: "cus_owned", subscriptionId: "sub_owned", number: "INV-1", status: "paid", currency: "USD", amountDueMinor: 100, amountPaidMinor: 100, amountRemainingMinor: 0, subtotalMinor: 100, taxMinor: 0, createdAt: new Date(), dueAt: null, paidAt: new Date(), periodStart: null, periodEnd: null, providerVersion: "v1" }, { hostedInvoiceUrl: "https://invoice.stripe.com/i/owned", invoicePdfUrl: null, receiptUrl: null });
    expect(await getCompanyInvoiceLinks({ invoiceId, tenantId, provider, context })).toEqual({ hostedInvoiceUrl: "https://invoice.stripe.com/i/owned", invoicePdfUrl: null, receiptUrl: null });
    vi.mocked(InvoiceModel.findOne).mockReturnValue(chain(null) as never);
    await expect(getCompanyInvoiceLinks({ invoiceId, tenantId, provider, context })).rejects.toMatchObject({ statusCode: 404, code: "BILLING_INVOICE_NOT_FOUND" });
  });

  it("streams an owned invoice PDF inline without exposing provider URLs", async () => {
    vi.mocked(InvoiceModel.findOne).mockReturnValue(chain({ _id: invoiceId, tenantId, subscriptionId, providerInvoiceId: "in_owned", invoiceNumber: "INV-1" }) as never);
    const provider = new FakePaymentProvider();
    provider.seedInvoice({ id: "in_owned", customerId: "cus_owned", subscriptionId: "sub_owned", number: "INV-1", status: "paid", currency: "USD", amountDueMinor: 100, amountPaidMinor: 100, amountRemainingMinor: 0, subtotalMinor: 100, taxMinor: 0, createdAt: new Date(), dueAt: null, paidAt: new Date(), periodStart: null, periodEnd: null, providerVersion: "v1" }, { hostedInvoiceUrl: "https://invoice.stripe.com/i/owned", invoicePdfUrl: "https://pay.stripe.com/i/owned.pdf", receiptUrl: null });

    const result = await getCompanyInvoicePdf({ invoiceId, tenantId, provider, context });

    expect(result.contentType).toBe("application/pdf");
    expect(result.contentDisposition).toBe('inline; filename="Invoice-INV-1.pdf"');
    expect(result.contentDisposition.startsWith("inline")).toBe(true);
    expect(result.contentDisposition.startsWith("attachment")).toBe(false);
    expect(result.data.toString()).toContain("%PDF");
    expect(JSON.stringify(result)).not.toMatch(/pay\.stripe\.com|invoice\.stripe\.com|cus_owned/);
  });

  it("denies cross-tenant invoice PDF retrieval before touching the provider", async () => {
    vi.mocked(InvoiceModel.findOne).mockReturnValue(chain(null) as never);
    const provider = new FakePaymentProvider();
    await expect(getCompanyInvoicePdf({ invoiceId, tenantId: otherTenantId, provider, context })).rejects.toMatchObject({ statusCode: 404 });
    expect(InvoiceModel.findOne).not.toHaveBeenCalled();
  });

  it("rejects invoice PDF retrieval when the provider cannot serve the document", async () => {
    vi.mocked(InvoiceModel.findOne).mockReturnValue(chain({ _id: invoiceId, tenantId, subscriptionId, providerInvoiceId: "in_owned" }) as never);
    const provider = new FakePaymentProvider();
    provider.seedInvoice({ id: "in_owned", customerId: "cus_owned", subscriptionId: "sub_owned", number: "INV-1", status: "paid", currency: "USD", amountDueMinor: 100, amountPaidMinor: 100, amountRemainingMinor: 0, subtotalMinor: 100, taxMinor: 0, createdAt: new Date(), dueAt: null, paidAt: new Date(), periodStart: null, periodEnd: null, providerVersion: "v1" }, { hostedInvoiceUrl: "https://invoice.stripe.com/i/owned", invoicePdfUrl: null, receiptUrl: null });
    await expect(getCompanyInvoicePdf({ invoiceId, tenantId, provider, context })).rejects.toMatchObject({ statusCode: 503, code: "BILLING_PROVIDER_UNAVAILABLE" });
  });
});
