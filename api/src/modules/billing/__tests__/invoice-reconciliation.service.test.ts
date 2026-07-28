import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizePlatformOperation: vi.fn(),
  tenantFindById: vi.fn(),
  subscriptionFind: vi.fn(),
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
vi.mock("../../../db/models/billingOperation.model.js", () => ({ default: { findOneAndUpdate: mocks.billingOperationFindOneAndUpdate, deleteOne: mocks.billingOperationDeleteOne } }));
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

  it("continues after one subscription failure and returns safe counts only", async () => {
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
    expect(result).toMatchObject({ examined: 1, failed: 1 });
    expect(JSON.stringify(result)).not.toMatch(/cus_|sub_|in_/);
  });
});
