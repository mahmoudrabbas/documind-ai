import { beforeEach, describe, expect, it, vi } from "vitest";

const { auditWrite } = vi.hoisted(() => ({ auditWrite: vi.fn() }));

vi.mock("../../../db/models/subscription.model.js", () => ({
  default: { find: vi.fn(), findOne: vi.fn(), exists: vi.fn(), updateOne: vi.fn() },
}));
vi.mock("../../../db/models/package.model.js", () => ({
  default: { findById: vi.fn(), find: vi.fn() },
}));
vi.mock("../../../common/observability/index.js", () => ({
  getAuditWriter: () => ({ write: auditWrite }),
}));

import SubscriptionModel from "../../../db/models/subscription.model.js";
import PackageModel from "../../../db/models/package.model.js";
import { synchronizeProviderSubscription } from "../provider-subscription-sync.service.js";

const TENANT_ID = "507f1f77bcf86cd799439011";
const PACKAGE_ID = "507f1f77bcf86cd799439012";
const VERSION_ID = "507f1f77bcf86cd799439013";

function leanQuery<T>(result: T) {
  return { lean: () => ({ exec: async () => result }) };
}

function selectQuery<T>(result: T) {
  return { select: () => ({ lean: () => ({ exec: async () => result }) }) };
}

function candidateQuery<T>(result: T) {
  return { limit: () => ({ lean: () => ({ exec: async () => result }) }) };
}

let projectionResults: Array<Record<string, unknown>[]> = [];

const providerSubscription = {
  id: "sub_sync_1",
  customerId: "cus_sync_1",
  status: "active",
  metadata: {
    tenantId: TENANT_ID,
    packageId: PACKAGE_ID,
    packageVersionId: VERSION_ID,
    packageVersion: "2",
    billingInterval: "monthly",
  },
  priceId: "price_sync_1",
  currentPeriodStart: new Date("2026-07-01T00:00:00Z"),
  currentPeriodEnd: new Date("2026-08-01T00:00:00Z"),
  cancelAtPeriodEnd: false,
};

function synchronizedState() {
  return {
    _id: "507f1f77bcf86cd799439014",
    tenantId: TENANT_ID,
    packageId: PACKAGE_ID,
    packageVersionId: VERSION_ID,
    packageVersion: 2,
    status: "ACTIVE",
    paymentState: "paid",
    providerCustomerId: "cus_sync_1",
    providerSubscriptionId: "sub_sync_1",
    providerPriceId: "price_sync_1",
    provider: "stripe",
    billingInterval: "monthly",
    currentPeriodStart: providerSubscription.currentPeriodStart,
    currentPeriodEnd: providerSubscription.currentPeriodEnd,
    cancelAtPeriodEnd: false,
    revision: 4,
  };
}

describe("shared provider subscription synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditWrite.mockResolvedValue(undefined);
    (PackageModel.findById as ReturnType<typeof vi.fn>).mockReturnValue(leanQuery({
      _id: PACKAGE_ID,
      version: 2,
      versions: [{ _id: VERSION_ID, version: 2, stripePriceId: "price_sync_1" }],
    }));
    projectionResults = [];
    (SubscriptionModel.find as ReturnType<typeof vi.fn>).mockImplementation((filter: Record<string, unknown>) =>
      filter.$or ? selectQuery([]) : candidateQuery(projectionResults.shift() ?? []));
    (SubscriptionModel.exists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
  });

  it("persists the complete provider/package snapshot", async () => {
    const oldState = { ...synchronizedState(), providerSubscriptionId: "", paymentState: "pending", revision: 3 };
    projectionResults = [[], [oldState], [synchronizedState()]];
    (SubscriptionModel.updateOne as ReturnType<typeof vi.fn>).mockResolvedValue({ modifiedCount: 1 });

    const result = await synchronizeProviderSubscription({
      providerSubscription,
      tenantId: TENANT_ID,
      provider: "stripe",
      sourceId: "checkout-session-sync:cs_test_1",
      sourceType: "checkout_session_sync",
    });

    expect(result.changed).toBe(true);
    expect(SubscriptionModel.updateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = (SubscriptionModel.updateOne as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(filter._id)).toBe(oldState._id);
    expect(filter.revision).toBe(3);
    expect(update).toEqual({ $set: expect.objectContaining({
        packageId: expect.anything(),
        packageVersionId: expect.anything(),
        packageVersion: 2,
        providerCustomerId: "cus_sync_1",
        providerSubscriptionId: "sub_sync_1",
        providerPriceId: "price_sync_1",
        provider: "stripe",
        billingInterval: "monthly",
        status: "ACTIVE",
        paymentState: "paid",
        currentPeriodStart: providerSubscription.currentPeriodStart,
        currentPeriodEnd: providerSubscription.currentPeriodEnd,
        cancelAtPeriodEnd: false,
      }) });
    expect(auditWrite).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate updates or audits after webhook/session convergence", async () => {
    projectionResults = [[synchronizedState()], [synchronizedState()]];

    const result = await synchronizeProviderSubscription({
      providerSubscription,
      tenantId: TENANT_ID,
      provider: "stripe",
      sourceId: "evt_after_session_sync",
      sourceType: "webhook",
    });

    expect(result.changed).toBe(false);
    expect(SubscriptionModel.updateOne).not.toHaveBeenCalled();
    expect(auditWrite).not.toHaveBeenCalled();
  });

  it("loses a concurrent race safely without a duplicate transition audit", async () => {
    const oldState = { ...synchronizedState(), status: "INCOMPLETE", revision: 3 };
    projectionResults = [[oldState], [synchronizedState()], [synchronizedState()]];
    (SubscriptionModel.updateOne as ReturnType<typeof vi.fn>).mockResolvedValue({ modifiedCount: 0 });

    const result = await synchronizeProviderSubscription({
      providerSubscription,
      tenantId: TENANT_ID,
      provider: "stripe",
      sourceId: "evt_concurrent",
      sourceType: "webhook",
    });
    expect(result.changed).toBe(false);
    expect(auditWrite).not.toHaveBeenCalled();
  });

  it("retries a tenant-unique upsert race and treats the winner as authoritative", async () => {
    projectionResults = [[], [], [synchronizedState()], [synchronizedState()]];
    (SubscriptionModel.updateOne as ReturnType<typeof vi.fn>).mockRejectedValueOnce({ code: 11000 });

    const result = await synchronizeProviderSubscription({
      providerSubscription,
      tenantId: TENANT_ID,
      provider: "stripe",
      sourceId: "checkout-session-sync:cs_concurrent_upsert",
      sourceType: "checkout_session_sync",
    });

    expect(result.changed).toBe(false);
    expect(SubscriptionModel.updateOne).toHaveBeenCalledTimes(1);
    expect(auditWrite).not.toHaveBeenCalled();
  });

  it("keeps session sync after an already-applied webhook idempotent", async () => {
    projectionResults = [[synchronizedState()], [synchronizedState()]];

    const result = await synchronizeProviderSubscription({
      providerSubscription,
      tenantId: TENANT_ID,
      provider: "stripe",
      sourceId: "checkout-session-sync:cs_after_webhook",
      sourceType: "checkout_session_sync",
    });

    expect(result.changed).toBe(false);
    expect(SubscriptionModel.updateOne).not.toHaveBeenCalled();
    expect(auditWrite).not.toHaveBeenCalled();
  });

  it("projects cancel-at-period-end as a lifecycle state while keeping the effective period end", async () => {
    const oldState = { ...synchronizedState(), status: "ACTIVE", cancelAtPeriodEnd: false, revision: 3 };
    projectionResults = [[oldState], [{ ...synchronizedState(), status: "CANCEL_AT_PERIOD_END", cancelAtPeriodEnd: true }]];
    (SubscriptionModel.updateOne as ReturnType<typeof vi.fn>).mockResolvedValue({ modifiedCount: 1 });

    await synchronizeProviderSubscription({
      providerSubscription: { ...providerSubscription, cancelAtPeriodEnd: true },
      tenantId: TENANT_ID,
      provider: "stripe",
      sourceId: "evt_cancel_scheduled",
      sourceType: "webhook",
    });

    const [, update] = (SubscriptionModel.updateOne as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(update).toEqual({ $set: expect.objectContaining({ status: "CANCEL_AT_PERIOD_END", cancelAtPeriodEnd: true, periodEnd: providerSubscription.currentPeriodEnd, currentPeriodEnd: providerSubscription.currentPeriodEnd }) });
  });

  it("updates the exact historical provider subscription and never the provider-less Free subscription", async () => {
    const paid = { ...synchronizedState(), _id: "507f1f77bcf86cd799439020", status: "ACTIVE", paymentState: "paid" };
    projectionResults = [[paid], [{ ...paid, status: "CANCELED" }]];
    await synchronizeProviderSubscription({
      providerSubscription: { ...providerSubscription, status: "canceled" },
      tenantId: TENANT_ID,
      provider: "stripe",
      sourceId: "evt_deleted_after_free",
      sourceType: "webhook",
    });
    const [filter, update] = (SubscriptionModel.updateOne as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(filter._id)).toBe(paid._id);
    expect(update.$set).toMatchObject({ status: "CANCELED", paymentState: "paid" });
  });

  it("fails closed instead of binding a delayed provider event to a provider-less Free subscription", async () => {
    projectionResults = [[], []];
    (SubscriptionModel.exists as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    await expect(synchronizeProviderSubscription({
      providerSubscription: { ...providerSubscription, customerId: "different-customer" },
      tenantId: TENANT_ID,
      provider: "stripe",
      sourceId: "evt_unlinked",
      sourceType: "webhook",
    })).rejects.toThrow("mapping is missing");
    expect(SubscriptionModel.updateOne).not.toHaveBeenCalled();
  });

  it("fails closed when a provider subscription maps to multiple local records", async () => {
    projectionResults = [[synchronizedState(), { ...synchronizedState(), _id: "507f1f77bcf86cd799439021" }]];
    await expect(synchronizeProviderSubscription({
      providerSubscription,
      tenantId: TENANT_ID,
      provider: "stripe",
      sourceId: "evt_ambiguous",
      sourceType: "webhook",
    })).rejects.toThrow("mapping is ambiguous");
    expect(SubscriptionModel.updateOne).not.toHaveBeenCalled();
  });
});
