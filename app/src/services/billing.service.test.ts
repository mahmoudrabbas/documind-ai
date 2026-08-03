import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createBillingPortalSession,
  getBillingSummary,
  getInvoiceLinks,
  listInvoices,
  syncSubscriptionFromStripe,
  triggerReconciliation,
} from "./billing.service";

const mockApiClient = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiClient: (...args: unknown[]) => mockApiClient(...args),
}));

beforeEach(() => {
  mockApiClient.mockReset();
});

describe("tenant billing API client", () => {
  it("uses version-stable tenant routes and explicit portal flow intent", async () => {
    mockApiClient.mockResolvedValue({ success: true, data: {} });
    await getBillingSummary();
    await createBillingPortalSession("payment_method_update");
    await listInvoices({ page: 2, pageSize: 10, status: "paid" });
    await getInvoiceLinks("local/id");
    expect(mockApiClient.mock.calls.map(([url]) => url)).toEqual([
      "/billing/summary",
      "/billing/portal-sessions",
      "/billing/invoices?page=2&pageSize=10&status=paid",
      "/billing/invoices/local%2Fid/links",
    ]);
    expect(mockApiClient.mock.calls[1][1]).toEqual({ method: "POST", body: { flow: "payment_method_update" } });
  });
});

describe("billing.service syncSubscriptionFromStripe", () => {
  it("calls the provider-backed Super Admin endpoint for one tenant", async () => {
    mockApiClient.mockResolvedValue({ success: true, data: {} });
    await syncSubscriptionFromStripe("tenant/id");
    expect(mockApiClient).toHaveBeenCalledWith(
      "/super-admin/reconciliation/subscriptions/tenant%2Fid/sync-provider",
      { method: "POST" },
    );
  });
});

describe("billing.service triggerReconciliation", () => {
  it("calls /super-admin/reconciliation/subscriptions", async () => {
    mockApiClient.mockResolvedValue({
      success: true,
      data: { subscriptions: { examined: 0, mismatched: [] }, invoices: { examined: 0, created: 0, updated: 0, failed: 0 }, refundSettlements: { examined: 0, eligibleForTransitionRepair: 0, transitionOperationsCreated: 0, transitionsCompleted: 0, transitionsRetryable: 0, failed: 0 }, providerCancellations: { created: 0, confirmed: 0, retryable: 0 } },
    });
    await triggerReconciliation();
    expect(mockApiClient).toHaveBeenCalledWith(
      "/super-admin/reconciliation/subscriptions",
      { method: "POST" },
    );
  });

  it("does not call the old /reconciliation/subscriptions endpoint", async () => {
    mockApiClient.mockResolvedValue({
      success: true,
      data: { subscriptions: { examined: 0, mismatched: [] }, invoices: { examined: 0, created: 0, updated: 0, failed: 0 }, refundSettlements: { examined: 0, eligibleForTransitionRepair: 0, transitionOperationsCreated: 0, transitionsCompleted: 0, transitionsRetryable: 0, failed: 0 }, providerCancellations: { created: 0, confirmed: 0, retryable: 0 } },
    });
    await triggerReconciliation();
    const calledUrl = mockApiClient.mock.calls[0][0];
    expect(calledUrl).not.toBe("/reconciliation/subscriptions");
  });

  it("returns typed reconciliation result", async () => {
    const mockResult = {
      subscriptions: { examined: 5, mismatched: [{ status: "active" }] },
      invoices: { examined: 0, created: 0, updated: 0, failed: 0 },
      refundSettlements: { examined: 1, eligibleForTransitionRepair: 1, transitionOperationsCreated: 1, transitionsCompleted: 1, transitionsRetryable: 0, failed: 0 },
      providerCancellations: { created: 1, confirmed: 1, retryable: 0 },
    };
    mockApiClient.mockResolvedValue({ success: true, data: mockResult });
    const result = await triggerReconciliation();
    expect(result.data).toEqual(mockResult);
  });
});
