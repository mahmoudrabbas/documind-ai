import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../db/models/checkoutSession.model.js", () => ({
  default: { findOne: vi.fn(), updateOne: vi.fn() },
}));
vi.mock("../../../db/models/paymentEvent.model.js", () => ({
  default: { create: vi.fn() },
}));
vi.mock("../../../db/models/subscription.model.js", () => ({
  default: { findOne: vi.fn(), updateOne: vi.fn() },
}));
vi.mock("../../../db/models/package.model.js", () => ({
  default: { findById: vi.fn(), find: vi.fn() },
}));
vi.mock("../../../common/observability/index.js", () => ({
  getAuditWriter: () => ({ write: vi.fn().mockResolvedValue(undefined) }),
}));
vi.mock("../../permissions/permissions.operation.js", () => ({
  authorizeTenantOperation: vi.fn(async (context: Record<string, unknown>) => ({
    ...context,
    actorKind: "USER",
  })),
}));
vi.mock("../../billing/provider-subscription-sync.service.js", () => ({
  synchronizeProviderSubscription: vi.fn(),
}));

import CheckoutSessionModel from "../../../db/models/checkoutSession.model.js";
import PaymentEventModel from "../../../db/models/paymentEvent.model.js";
import { FakePaymentProvider } from "../../billing/ports/fakes/fake-payment-provider.js";
import { synchronizeProviderSubscription } from "../../billing/provider-subscription-sync.service.js";
import { synchronizeCheckoutSession } from "../checkout.service.js";

const TENANT_ID = "507f1f77bcf86cd799439011";
const OTHER_TENANT_ID = "507f1f77bcf86cd799439099";
const PACKAGE_ID = "507f1f77bcf86cd799439012";
const PACKAGE_VERSION_ID = "507f1f77bcf86cd799439013";
const ACTOR = {
  tenantId: TENANT_ID,
  actorId: "507f1f77bcf86cd799439014",
  actorEmail: "admin@example.com",
  actorRole: "COMPANY_ADMIN" as const,
};

function query<T>(result: T) {
  return { lean: () => ({ exec: async () => result }) };
}

async function completedProviderSession(
  provider: FakePaymentProvider,
  ownership: { clientReferenceId?: string; metadataTenantId?: string } = {
    clientReferenceId: TENANT_ID,
    metadataTenantId: TENANT_ID,
  },
) {
  const customerId = await provider.createCustomer({
    tenantId: ownership.clientReferenceId ?? ownership.metadataTenantId ?? TENANT_ID,
    email: "admin@example.com",
    name: "Tenant",
  });
  const session = await provider.createCheckoutSession({
    customerId,
    priceId: "price_monthly",
    successUrl: "https://app.test/success?session_id={CHECKOUT_SESSION_ID}",
    cancelUrl: "https://app.test/cancel",
    metadata: ownership.metadataTenantId ? { tenantId: ownership.metadataTenantId } : {},
    clientReferenceId: ownership.clientReferenceId,
  });
  provider.attachSubscriptionToSession(session.id, {
    id: "sub_test_sync",
    customerId,
    status: "active",
    metadata: {
      tenantId: ownership.clientReferenceId ?? ownership.metadataTenantId ?? TENANT_ID,
      packageId: PACKAGE_ID,
      packageVersionId: PACKAGE_VERSION_ID,
      packageVersion: "1",
      billingInterval: "monthly",
    },
    priceId: "price_monthly",
    currentPeriodStart: new Date("2026-07-01T00:00:00Z"),
    currentPeriodEnd: new Date("2026-08-01T00:00:00Z"),
    cancelAtPeriodEnd: false,
  });
  return session.id;
}

describe("Checkout Session recovery synchronization", () => {
  let provider: FakePaymentProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new FakePaymentProvider();
    provider._reset();
    (CheckoutSessionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(query(null));
    (CheckoutSessionModel.updateOne as ReturnType<typeof vi.fn>).mockResolvedValue({ modifiedCount: 1 });
    (PaymentEventModel.create as ReturnType<typeof vi.fn>).mockResolvedValue({ _id: "event-1" });
    (synchronizeProviderSubscription as ReturnType<typeof vi.fn>).mockResolvedValue({
      changed: true,
      subscription: {
        packageId: PACKAGE_ID,
        packageVersionId: PACKAGE_VERSION_ID,
        providerCustomerId: "cus_test",
        providerSubscriptionId: "sub_test_sync",
        provider: "stripe",
        billingInterval: "monthly",
        status: "ACTIVE",
        paymentState: "paid",
      },
    });
  });

  it("synchronizes successfully without a webhook using client_reference_id ownership", async () => {
    const sessionId = await completedProviderSession(provider, { clientReferenceId: TENANT_ID });
    const result = await synchronizeCheckoutSession(sessionId, TENANT_ID, provider, ACTOR);
    expect(result.synchronized).toBe(true);
    expect(synchronizeProviderSubscription).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT_ID, sourceType: "checkout_session_sync" }));
  });

  it("accepts metadata.tenantId ownership and persists linkage/package state through the shared core", async () => {
    const sessionId = await completedProviderSession(provider, { metadataTenantId: TENANT_ID });
    await synchronizeCheckoutSession(sessionId, TENANT_ID, provider, ACTOR);
    expect(synchronizeProviderSubscription).toHaveBeenCalledWith(expect.objectContaining({
      providerSubscription: expect.objectContaining({ id: "sub_test_sync", priceId: "price_monthly" }),
    }));
    expect(CheckoutSessionModel.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ providerSessionId: sessionId }),
      expect.objectContaining({ $set: expect.objectContaining({ status: "completed" }) }),
    );
    expect(PaymentEventModel.create).toHaveBeenCalledWith(expect.objectContaining({
      eventId: `checkout-session-sync:${sessionId}`,
      eventType: "checkout.session.synchronized",
      status: "processed",
    }));
  });

  it("accepts an existing tenant-owned local CheckoutSession association", async () => {
    const sessionId = await completedProviderSession(provider, {});
    (CheckoutSessionModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue(query({
      tenantId: { toString: () => TENANT_ID },
      providerSessionId: sessionId,
    }));
    await expect(synchronizeCheckoutSession(sessionId, TENANT_ID, provider, ACTOR)).resolves.toMatchObject({
      synchronized: true,
    });
  });

  it("rejects a cross-tenant Checkout Session with hidden not-found semantics", async () => {
    const sessionId = await completedProviderSession(provider, {
      clientReferenceId: OTHER_TENANT_ID,
      metadataTenantId: OTHER_TENANT_ID,
    });
    await expect(synchronizeCheckoutSession(sessionId, TENANT_ID, provider, ACTOR)).rejects.toMatchObject({
      statusCode: 404,
      code: "CHECKOUT_SESSION_NOT_FOUND",
    });
    expect(synchronizeProviderSubscription).not.toHaveBeenCalled();
  });

  it("does not activate an incomplete or unpaid Checkout Session", async () => {
    const customerId = await provider.createCustomer({ tenantId: TENANT_ID, email: "a@b.test", name: "Tenant" });
    const session = await provider.createCheckoutSession({
      customerId,
      priceId: "price_monthly",
      successUrl: "https://app.test/success",
      cancelUrl: "https://app.test/cancel",
      metadata: { tenantId: TENANT_ID },
      clientReferenceId: TENANT_ID,
    });
    await expect(synchronizeCheckoutSession(session.id, TENANT_ID, provider, ACTOR)).rejects.toMatchObject({
      code: "CHECKOUT_SESSION_INCOMPLETE",
    });
    expect(synchronizeProviderSubscription).not.toHaveBeenCalled();

    const stored = provider.sessions.find((item) => item.id === session.id);
    if (!stored) throw new Error("Test Checkout Session missing");
    stored.status = "complete";
    stored.paymentStatus = "unpaid";
    await expect(synchronizeCheckoutSession(session.id, TENANT_ID, provider, ACTOR)).rejects.toMatchObject({
      code: "CHECKOUT_PAYMENT_INCOMPLETE",
    });
    expect(synchronizeProviderSubscription).not.toHaveBeenCalled();
  });

  it("is idempotent under Retry and never creates provider billing resources", async () => {
    const sessionId = await completedProviderSession(provider);
    const resourceCounts = {
      customers: provider.customers.length,
      sessions: provider.sessions.length,
      subscriptions: provider.subscriptions.length,
    };
    await synchronizeCheckoutSession(sessionId, TENANT_ID, provider, ACTOR);
    (PaymentEventModel.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce({ code: 11000 });
    await synchronizeCheckoutSession(sessionId, TENANT_ID, provider, ACTOR);
    expect(provider.customers).toHaveLength(resourceCounts.customers);
    expect(provider.sessions).toHaveLength(resourceCounts.sessions);
    expect(provider.subscriptions).toHaveLength(resourceCounts.subscriptions);
  });

  it("maps provider retrieval failures to a retryable 503", async () => {
    provider.shouldFailNextRetrieveSession = true;
    await expect(synchronizeCheckoutSession("cs_test_unavailable", TENANT_ID, provider, ACTOR)).rejects.toMatchObject({
      statusCode: 503,
      code: "CHECKOUT_SYNC_PROVIDER_UNAVAILABLE",
    });
  });

  it("maps provider missing-session errors to hidden not-found semantics", async () => {
    vi.spyOn(provider, "retrieveCheckoutSession").mockRejectedValueOnce({
      statusCode: 404,
      code: "resource_missing",
    });
    await expect(
      synchronizeCheckoutSession("cs_test_missing", TENANT_ID, provider, ACTOR),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "CHECKOUT_SESSION_NOT_FOUND",
    });
  });
});
