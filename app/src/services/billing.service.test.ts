import { describe, expect, it, vi, beforeEach } from "vitest";
import {
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
      data: { totalSubscriptions: 0, mismatched: [] },
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
      data: { totalSubscriptions: 0, mismatched: [] },
    });
    await triggerReconciliation();
    const calledUrl = mockApiClient.mock.calls[0][0];
    expect(calledUrl).not.toBe("/reconciliation/subscriptions");
  });

  it("returns typed reconciliation result", async () => {
    const mockResult = {
      totalSubscriptions: 5,
      mismatched: [{ subscriptionId: "sub_123", status: "active" }],
    };
    mockApiClient.mockResolvedValue({ success: true, data: mockResult });
    const result = await triggerReconciliation();
    expect(result.data).toEqual(mockResult);
  });
});
