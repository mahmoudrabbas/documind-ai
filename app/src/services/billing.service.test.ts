import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  createBillingPortalSession,
  getBillingSummary,
  getInvoiceLinks,
  getInvoicePdfBlobUrl,
  listInvoices,
  syncSubscriptionFromStripe,
  triggerReconciliation,
} from "./billing.service";

const mockApiClient = vi.fn();
vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return {
    ...actual,
    apiClient: (...args: unknown[]) => mockApiClient(...args),
  };
});

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

describe("billing.service getInvoicePdfBlobUrl", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches the authenticated invoice PDF and returns a blob object URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["%PDF"], { type: "application/pdf" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const url = await getInvoicePdfBlobUrl("local/id");
    expect(url).toMatch(/^blob:/);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/billing/invoices/local%2Fid/pdf"),
      expect.objectContaining({ headers: { Authorization: "Bearer null" } }),
    );
  });

  it("throws an ApiError carrying the backend code when retrieval fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ success: false, error: { code: "BILLING_PROVIDER_UNAVAILABLE", message: "provider down" } }),
      }),
    );
    await expect(getInvoicePdfBlobUrl("local/id")).rejects.toMatchObject({
      status: 503,
      code: "BILLING_PROVIDER_UNAVAILABLE",
    });
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
