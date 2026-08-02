import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizePlatformOperation: vi.fn(),
  tenantFindById: vi.fn(),
  subscriptionFind: vi.fn(),
  billingOperationUpdateOne: vi.fn(),
  billingOperationFindOneAndUpdate: vi.fn(),
  billingOperationDeleteOne: vi.fn(),
  invoiceFindOne: vi.fn(),
  invoiceCreate: vi.fn(),
  invoiceUpdateOne: vi.fn(),
  auditWrite: vi.fn(),
  metricIncrement: vi.fn(),
  metricHistogram: vi.fn(),
  metricGauge: vi.fn(),
}));

vi.mock("../../permissions/permissions.operation.js", () => ({ authorizePlatformOperation: mocks.authorizePlatformOperation }));
vi.mock("../../../db/models/tenant.model.js", () => ({ default: { findById: mocks.tenantFindById } }));
vi.mock("../../../db/models/subscription.model.js", () => ({ default: { find: mocks.subscriptionFind } }));
vi.mock("../../../db/models/billingOperation.model.js", () => ({ default: { updateOne: mocks.billingOperationUpdateOne, findOneAndUpdate: mocks.billingOperationFindOneAndUpdate, deleteOne: mocks.billingOperationDeleteOne } }));
vi.mock("../../../db/models/invoice.model.js", () => ({ default: { findOne: mocks.invoiceFindOne, create: mocks.invoiceCreate, updateOne: mocks.invoiceUpdateOne } }));
vi.mock("../../../common/observability/index.js", () => ({
  getAuditWriter: () => ({ write: mocks.auditWrite }),
  getMetricRecorder: () => ({ increment: mocks.metricIncrement, histogram: mocks.metricHistogram, gauge: mocks.metricGauge }),
}));

import { reconcileTenantInvoices } from "../invoice-synchronization.service.js";

function chain<T>(value: T) {
  return { select: vi.fn().mockReturnThis(), lean: vi.fn().mockReturnThis(), exec: vi.fn().mockResolvedValue(value) };
}

describe("invoice reconciliation service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizePlatformOperation.mockResolvedValue({ tenantId: "507f1f77bcf86cd799439001", actorId: "507f1f77bcf86cd799439002", actorEmail: "platform@example.test", actorRole: "SUPER_ADMIN" });
    mocks.tenantFindById.mockReturnValue(chain({ _id: "507f1f77bcf86cd799439010", slug: "tenant-a", status: "active", isSystemTenant: false }));
    mocks.subscriptionFind.mockReturnValue(chain([{ _id: "507f1f77bcf86cd799439011", tenantId: "507f1f77bcf86cd799439010", provider: "fake", providerCustomerId: "cus_a", providerSubscriptionId: "sub_a" }]));
    mocks.billingOperationUpdateOne.mockImplementation(async (filter: { status?: string }) => ({ modifiedCount: filter.status === "REQUESTED" ? 1 : 0 }));
    mocks.billingOperationFindOneAndUpdate.mockResolvedValue({ lastErrorObject: { updatedExisting: false } });
    mocks.billingOperationDeleteOne.mockResolvedValue({ acknowledged: true });
    mocks.invoiceFindOne.mockReturnValue(chain(null));
    mocks.invoiceCreate.mockImplementation(async (value: Record<string, unknown>) => ({ _id: "local-invoice", ...value }));
    mocks.invoiceUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    mocks.auditWrite.mockResolvedValue(true);
  });

  it("rejects nonexistent or inactive target tenants", async () => {
    mocks.tenantFindById.mockReturnValueOnce(chain(null));
    await expect(reconcileTenantInvoices({ tenantId: "507f1f77bcf86cd799439010", provider: { listInvoices: vi.fn() } as never, context: { tenantId: "507f1f77bcf86cd799439001", actorId: "507f1f77bcf86cd799439002", actorEmail: "platform@example.test", actorRole: "SUPER_ADMIN" } })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejects the platform tenant target", async () => {
    mocks.tenantFindById.mockReturnValueOnce(chain({ _id: "507f1f77bcf86cd799439010", slug: "documind-ai", status: "active", isSystemTenant: true }));
    await expect(reconcileTenantInvoices({ tenantId: "507f1f77bcf86cd799439010", provider: { listInvoices: vi.fn() } as never, context: { tenantId: "507f1f77bcf86cd799439001", actorId: "507f1f77bcf86cd799439002", actorEmail: "platform@example.test", actorRole: "SUPER_ADMIN" } })).rejects.toMatchObject({ code: "BILLING_OPERATION_NOT_ALLOWED" });
  });

  it("rejects duplicate concurrent invocations with a stable pending error", async () => {
    mocks.billingOperationFindOneAndUpdate.mockResolvedValueOnce({ lastErrorObject: { updatedExisting: true } });
    await expect(reconcileTenantInvoices({ tenantId: "507f1f77bcf86cd799439010", provider: { listInvoices: vi.fn() } as never, context: { tenantId: "507f1f77bcf86cd799439001", actorId: "507f1f77bcf86cd799439002", actorEmail: "platform@example.test", actorRole: "SUPER_ADMIN" } })).rejects.toMatchObject({ code: "BILLING_OPERATION_ALREADY_PENDING" });
  });

  it("continues after one subscription failure and returns bounded safe diagnostics", async () => {
    mocks.subscriptionFind.mockReturnValueOnce(chain([
      { _id: "507f1f77bcf86cd799439011", tenantId: "507f1f77bcf86cd799439010", provider: "fake", providerCustomerId: "cus_a", providerSubscriptionId: "sub_a" },
      { _id: "507f1f77bcf86cd799439012", tenantId: "507f1f77bcf86cd799439010", provider: "fake", providerCustomerId: "cus_b", providerSubscriptionId: "sub_b" },
    ]));
    const provider = {
      listInvoices: vi.fn(async ({ customerId }: { customerId: string }) => {
        if (customerId === "cus_b") throw new Error("provider down");
        return {
          invoices: [{
            id: "in_a",
            customerId: "cus_a",
            subscriptionId: "sub_a",
            number: "INV-A",
            status: "paid",
            currency: "USD",
            amountDueMinor: 100,
            amountPaidMinor: 100,
            amountRemainingMinor: 0,
            subtotalMinor: 100,
            taxMinor: 0,
            createdAt: new Date("2026-07-01"),
            dueAt: null,
            paidAt: new Date("2026-07-01"),
            periodStart: null,
            periodEnd: null,
            providerVersion: "v1",
            observedAt: new Date("2026-07-01"),
          }],
          hasMore: false,
          nextCursor: null,
        };
      }),
    };
    const result = await reconcileTenantInvoices({ tenantId: "507f1f77bcf86cd799439010", provider: provider as never, context: { tenantId: "507f1f77bcf86cd799439001", actorId: "507f1f77bcf86cd799439002", actorEmail: "platform@example.test", actorRole: "SUPER_ADMIN" } });
    expect(result).toMatchObject({
      examined: 1,
      failed: 1,
      failures: [{ code: "BILLING_INVOICE_PROVIDER_UNAVAILABLE", count: 1, classification: "RETRYABLE_PROVIDER_FAILURE", retryable: true }],
      retry: { status: "RETRY_PENDING", retryableFailureCount: 1 },
    });
    expect(mocks.billingOperationUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({ operationType: "INVOICE_SYNCHRONIZATION", status: "REQUESTED" }),
      expect.objectContaining({ $set: expect.objectContaining({ status: "RETRY_PENDING", failureCode: "BILLING_INVOICE_PROVIDER_UNAVAILABLE" }) }),
    );
    expect(mocks.billingOperationDeleteOne).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/cus_|sub_|in_|provider down/);
  });

  it("classifies unavailable historical invoices without scheduling retries or blocking local access", async () => {
    mocks.subscriptionFind.mockReturnValueOnce(chain([
      { _id: "507f1f77bcf86cd799439011", tenantId: "507f1f77bcf86cd799439010", provider: "fake", providerCustomerId: "customer", providerSubscriptionId: "subscription", status: "CANCELED", paymentState: "paid" },
    ]));
    const result = await reconcileTenantInvoices({
      tenantId: "507f1f77bcf86cd799439010",
      provider: { listInvoices: vi.fn().mockRejectedValue(new Error("unavailable")) } as never,
      context: { tenantId: "507f1f77bcf86cd799439001", actorId: "507f1f77bcf86cd799439002", actorEmail: "platform@example.test", actorRole: "SUPER_ADMIN" as const },
    });
    expect(result).toMatchObject({
      failed: 1,
      failures: [{ classification: "EXPECTED_HISTORICAL_PROVIDER_UNAVAILABLE", retryable: false, count: 1 }],
      retry: { status: "NONE", retryableFailureCount: 0 },
    });
    expect(mocks.billingOperationDeleteOne).toHaveBeenCalledTimes(1);
    expect(mocks.subscriptionFind).toHaveBeenCalledTimes(1);
  });

  it("persists provider failures and safely resumes the same reconciliation operation", async () => {
    const provider = { listInvoices: vi.fn()
      .mockRejectedValueOnce(new Error("temporary outage"))
      .mockResolvedValueOnce({ invoices: [], hasMore: false, nextCursor: null }) };
    mocks.billingOperationUpdateOne
      .mockResolvedValueOnce({ modifiedCount: 0 })
      .mockResolvedValueOnce({ modifiedCount: 1 })
      .mockResolvedValueOnce({ modifiedCount: 1 });

    const input = {
      tenantId: "507f1f77bcf86cd799439010",
      provider: provider as never,
      context: { tenantId: "507f1f77bcf86cd799439001", actorId: "507f1f77bcf86cd799439002", actorEmail: "platform@example.test", actorRole: "SUPER_ADMIN" as const },
    };
    const first = await reconcileTenantInvoices(input);
    const second = await reconcileTenantInvoices(input);

    expect(first.retry).toEqual({ status: "RETRY_PENDING", retryableFailureCount: 1 });
    expect(second.retry).toEqual({ status: "NONE", retryableFailureCount: 0 });
    expect(mocks.billingOperationFindOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.billingOperationDeleteOne).toHaveBeenCalledTimes(1);
    expect(provider.listInvoices).toHaveBeenCalledTimes(2);
  });

  it("clamps direct reconciliation requests to the documented 200-record maximum", async () => {
    const invoices = Array.from({ length: 250 }, (_, index) => ({
      id: `invoice-${index}`, customerId: "customer-a", subscriptionId: "subscription-a", number: `INV-${index}`,
      status: "paid" as const, currency: "USD", amountDueMinor: 100, amountPaidMinor: 100, amountRemainingMinor: 0,
      subtotalMinor: 100, taxMinor: 0, createdAt: new Date("2026-07-01"), dueAt: null, paidAt: new Date("2026-07-01"),
      periodStart: null, periodEnd: null, providerVersion: "v1", observedAt: new Date("2026-07-01"),
    }));
    const provider = { listInvoices: vi.fn().mockResolvedValue({ invoices, hasMore: false, nextCursor: null }) };
    for (const [requested, expected] of [[1, 1], [200, 200], [201, 200], [500, 200]]) {
      const result = await reconcileTenantInvoices({ tenantId: "507f1f77bcf86cd799439010", provider: provider as never, maxRecords: requested });
      expect(result.examined).toBe(expected);
    }
  });
});
