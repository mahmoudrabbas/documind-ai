import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentProvider, PaymentProviderEvent, ProviderSubscriptionState } from "../ports/payment-provider.port.js";
import { AppError } from "../../../common/errors/AppError.js";

const mocks = vi.hoisted(() => ({
  findEvent: vi.fn(), createEvent: vi.fn(), synchronize: vi.fn(), resolvePackage: vi.fn(), reconcile: vi.fn(), invoiceSync: vi.fn(),
}));
vi.mock("../../../db/models/paymentEvent.model.js", () => ({ default: { findOne: mocks.findEvent, create: mocks.createEvent } }));
vi.mock("../../../db/models/subscription.model.js", () => ({ default: { findOne: vi.fn(), updateOne: vi.fn() } }));
vi.mock("../../../db/models/checkoutSession.model.js", () => ({ default: { findOne: vi.fn(), find: vi.fn(), updateOne: vi.fn() } }));
vi.mock("../provider-subscription-sync.service.js", () => ({ synchronizeProviderSubscription: mocks.synchronize, resolvePackageVersion: mocks.resolvePackage }));
vi.mock("../billing-operation-reconciliation.service.js", () => ({ reconcileBillingOperation: mocks.reconcile }));
vi.mock("../invoice-synchronization.service.js", () => ({
  BILLING_SUBSCRIPTION_NOT_READY: "BILLING_SUBSCRIPTION_NOT_READY",
  INVOICE_WEBHOOK_EVENTS: new Set(["invoice.created", "invoice.finalized", "invoice.updated", "invoice.paid", "invoice.payment_failed", "invoice.voided", "invoice.marked_uncollectible"]),
  RetryableInvoiceSynchronizationError: class RetryableInvoiceSynchronizationError extends Error { code: string; constructor(code: string) { super(code); this.code = code; } },
  synchronizeInvoiceFromReference: mocks.invoiceSync,
}));
vi.mock("../subscription.service.js", () => ({ transitionSubscription: vi.fn(), LEGAL_TRANSITIONS: {} }));
vi.mock("../../permissions/permissions.operation.js", () => ({ authorizePlatformOperation: vi.fn() }));
vi.mock("../../../common/observability/index.js", () => ({ getAuditWriter: () => ({ write: vi.fn().mockResolvedValue(true) }) }));

import { handlePaymentEvent } from "../../payment-webhooks/payment-webhooks.service.js";

const tenantId = "507f1f77bcf86cd799439011";
const state: ProviderSubscriptionState = {
  id: "sub_current", customerId: "cus_current", status: "active",
  metadata: { tenantId, packageId: "507f1f77bcf86cd799439012", packageVersion: "1", billingInterval: "monthly", operationReference: "507f1f77bcf86cd799439013" },
  priceId: "price_current", currentPeriodStart: new Date("2026-07-01"), currentPeriodEnd: new Date("2026-08-01"),
  cancelAtPeriodEnd: false, cancellationEffectiveAt: null, observedAt: new Date("2026-07-15"),
};
function event(): PaymentProviderEvent {
  return { id: "evt_authoritative", type: "customer.subscription.updated", timestamp: new Date("2026-07-10"), provider: "stripe", raw: { data: { object: { id: "sub_current", customer: "cus_current", status: "canceled", cancel_at_period_end: true, metadata: { tenantId, operationReference: state.metadata.operationReference } } } } };
}
function record(status: "received" | "failed" = "received") {
  return { _id: "event-record", status, tenantId: null, processedAt: null, processingErrors: status === "failed" ? ["old"] : [], save: vi.fn().mockResolvedValue(undefined) };
}
function provider(read: () => Promise<ProviderSubscriptionState>): PaymentProvider {
  return { retrieveCurrentSubscriptionState: vi.fn(read) } as unknown as PaymentProvider;
}

describe("authoritative webhook reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.findEvent.mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
    mocks.createEvent.mockResolvedValue(record()); mocks.resolvePackage.mockResolvedValue({ packageId: state.metadata.packageId, packageVersionId: "507f1f77bcf86cd799439014", packageVersion: 1, billingInterval: "monthly" });
    mocks.synchronize.mockResolvedValue({ changed: true, subscription: {} }); mocks.reconcile.mockResolvedValue({ matched: true, operationId: state.metadata.operationReference });
    mocks.invoiceSync.mockResolvedValue({ outcome: "created", invoiceId: "local-invoice" });
  });

  it("keeps a current reactivation when an older cancellation event arrives out of order", async () => {
    const currentProvider = provider(async () => state);
    await handlePaymentEvent(event(), "{}", "signature", undefined, currentProvider);
    expect(currentProvider.retrieveCurrentSubscriptionState).toHaveBeenCalledWith({ subscriptionId: "sub_current", expectedCustomerId: "cus_current" });
    expect(mocks.synchronize).toHaveBeenCalledWith(expect.objectContaining({ providerSubscription: state, providerStateObservedAt: state.observedAt }));
    expect(mocks.reconcile).toHaveBeenCalledWith(expect.objectContaining({ operationReference: state.metadata.operationReference, outcome: "CONFIRMED" }));
  });

  it("keeps provider-read failures retryable with only a safe failure code", async () => {
    const eventRecord = record(); mocks.createEvent.mockResolvedValue(eventRecord);
    await handlePaymentEvent(event(), "{}", "signature", undefined, provider(async () => { throw new Error("raw provider secret detail"); }));
    expect(eventRecord).toMatchObject({ status: "failed", processedAt: null, processingErrors: ["BILLING_PROVIDER_UNAVAILABLE"] });
    expect(mocks.synchronize).not.toHaveBeenCalled();
    expect(mocks.reconcile).toHaveBeenCalledWith(expect.objectContaining({ outcome: "RETRY_PENDING", failureCode: "BILLING_PROVIDER_UNAVAILABLE" }));
    expect(JSON.stringify(eventRecord)).not.toContain("raw provider secret detail");
  });

  it("reprocesses a failed duplicate idempotently instead of acknowledging it as complete", async () => {
    const failed = record("failed"); mocks.findEvent.mockReturnValue({ exec: vi.fn().mockResolvedValue(failed) });
    const currentProvider = provider(async () => state);
    await handlePaymentEvent(event(), "{}", "signature", undefined, currentProvider);
    expect(currentProvider.retrieveCurrentSubscriptionState).toHaveBeenCalledOnce();
    expect(failed.status).toBe("processed"); expect(failed.processingErrors).toEqual([]);
  });

  it("treats a verified invoice event as a current-state projection trigger", async () => {
    const eventRecord = record(); mocks.createEvent.mockResolvedValue(eventRecord);
    const invoiceEvent: PaymentProviderEvent = { id: "evt_invoice", type: "invoice.created", timestamp: new Date(), provider: "stripe", raw: { data: { object: { id: "in_current", customer: "cus_current", parent: { subscription_details: { subscription: "sub_current" } } } } } };
    await handlePaymentEvent(invoiceEvent, "{}", "signature", undefined, {} as PaymentProvider);
    expect(mocks.invoiceSync).toHaveBeenCalledWith({ provider: expect.anything(), providerName: "stripe", providerInvoiceId: "in_current", providerCustomerId: "cus_current", providerSubscriptionId: "sub_current", sourceEventId: "evt_invoice" });
    expect(eventRecord).toMatchObject({ status: "processed" });
  });

  it("leaves invoice events retryable when the current provider invoice cannot be read", async () => {
    const eventRecord = record(); mocks.createEvent.mockResolvedValue(eventRecord);
    mocks.invoiceSync.mockRejectedValueOnce(new AppError(503, "BILLING_PROVIDER_UNAVAILABLE", "Billing provider is temporarily unavailable"));
    const invoiceEvent: PaymentProviderEvent = { id: "evt_invoice_retry", type: "invoice.updated", timestamp: new Date(), provider: "stripe", raw: { data: { object: { id: "in_current", customer: "cus_current", parent: { subscription_details: { subscription: "sub_current" } } } } } };
    await handlePaymentEvent(invoiceEvent, "{}", "signature", undefined, {} as PaymentProvider);
    expect(eventRecord.status).toBe("failed"); expect(eventRecord.processedAt).toBeNull();
    expect(eventRecord.processingErrors).toContain("BILLING_PROVIDER_UNAVAILABLE");
    expect(mocks.synchronize).not.toHaveBeenCalled();
  });

  it("keeps invoice-before-subscription delivery retryable until local subscription synchronization exists", async () => {
    const eventRecord = record();
    mocks.createEvent.mockResolvedValue(eventRecord);
    mocks.invoiceSync.mockRejectedValueOnce(Object.assign(new Error("not ready"), { code: "BILLING_SUBSCRIPTION_NOT_READY" }));
    const invoiceEvent: PaymentProviderEvent = { id: "evt_invoice_before_subscription", type: "invoice.updated", timestamp: new Date(), provider: "stripe", raw: { data: { object: { id: "in_current", customer: "cus_current", parent: { subscription_details: { subscription: "sub_current" } }, metadata: { tenantId } } } } };
    await handlePaymentEvent(invoiceEvent, "{}", "signature", undefined, {} as PaymentProvider);
    expect(eventRecord).toMatchObject({ status: "failed", processedAt: null, processingErrors: ["BILLING_SUBSCRIPTION_NOT_READY"] });

    mocks.invoiceSync.mockResolvedValueOnce({ outcome: "created", invoiceId: "local-invoice" });
    await handlePaymentEvent(invoiceEvent, "{}", "signature", eventRecord as never, {} as PaymentProvider);
    expect(eventRecord.status).toBe("processed");
    expect(eventRecord.processingErrors).toEqual([]);
  });

  it("keeps invoice projection replay-safe when subscription synchronization fails after invoice sync succeeds", async () => {
    const eventRecord = record();
    mocks.createEvent.mockResolvedValue(eventRecord);
    mocks.synchronize.mockRejectedValueOnce(new Error("subscription projection failed"));
    const invoiceEvent: PaymentProviderEvent = { id: "evt_invoice_paid_partial_failure", type: "invoice.paid", timestamp: new Date(), provider: "stripe", raw: { data: { object: { id: "in_current", customer: "cus_current", subscription: "sub_current", metadata: { tenantId } } } } };
    await handlePaymentEvent(invoiceEvent, "{}", "signature", undefined, provider(async () => state));
    expect(mocks.invoiceSync).toHaveBeenCalledTimes(1);
    expect(eventRecord).toMatchObject({ status: "failed", processedAt: null });

    mocks.synchronize.mockResolvedValueOnce({ changed: true, subscription: {} });
    await handlePaymentEvent(invoiceEvent, "{}", "signature", eventRecord as never, provider(async () => state));
    expect(mocks.invoiceSync).toHaveBeenCalledTimes(2);
    expect(eventRecord.status).toBe("processed");
  });
});
