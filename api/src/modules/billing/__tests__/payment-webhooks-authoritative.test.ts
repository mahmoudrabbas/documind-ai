import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentProvider, PaymentProviderEvent, ProviderSubscriptionState } from "../ports/payment-provider.port.js";

const mocks = vi.hoisted(() => ({
  findEvent: vi.fn(), createEvent: vi.fn(), synchronize: vi.fn(), resolvePackage: vi.fn(), reconcile: vi.fn(),
}));
vi.mock("../../../db/models/paymentEvent.model.js", () => ({ default: { findOne: mocks.findEvent, create: mocks.createEvent } }));
vi.mock("../../../db/models/subscription.model.js", () => ({ default: { findOne: vi.fn(), updateOne: vi.fn() } }));
vi.mock("../../../db/models/checkoutSession.model.js", () => ({ default: { findOne: vi.fn(), find: vi.fn(), updateOne: vi.fn() } }));
vi.mock("../provider-subscription-sync.service.js", () => ({ synchronizeProviderSubscription: mocks.synchronize, resolvePackageVersion: mocks.resolvePackage }));
vi.mock("../billing-operation-reconciliation.service.js", () => ({ reconcileBillingOperation: mocks.reconcile }));
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
});
