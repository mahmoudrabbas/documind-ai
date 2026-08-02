import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reconcileAll: vi.fn(),
  getProvider: vi.fn(),
  reconcileSettlements: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../reconciliation.service.js", () => ({
  getReconciliationService: () => ({ reconcileAll: mocks.reconcileAll }),
}));
vi.mock("../../checkout/payment-provider-loader.js", () => ({
  getPaymentProvider: mocks.getProvider,
}));
vi.mock("../../billing/refund.service.js", () => ({
  reconcileSucceededSystemRefundSettlements: mocks.reconcileSettlements,
}));
vi.mock("../../../common/logger/logger.js", () => ({
  logger: { info: mocks.info, error: mocks.error },
}));

import { startEntitlementReconciliation } from "../reconciliation.scheduler.js";

describe("entitlement and billing reconciliation scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    delete process.env.ENTITLEMENT_RECONCILE_ENABLED;
    delete process.env.BILLING_REFUND_RECONCILE_ENABLED;
    mocks.reconcileAll.mockResolvedValue({ totalTenants: 1, totalDiscrepancies: 0, totalFixed: 0 });
    mocks.getProvider.mockResolvedValue({ provider: "fake" });
    mocks.reconcileSettlements.mockResolvedValue({
      examined: 1,
      eligibleForTransitionRepair: 1,
      transitionsCompleted: 1,
      transitionsRetryable: 0,
      failed: 0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("invokes the same bounded succeeded-settlement repair used by Payment Diagnostics", async () => {
    const timer = startEntitlementReconciliation({ intervalMs: 100, mode: "execute" });
    await vi.advanceTimersByTimeAsync(100);
    clearInterval(timer);

    expect(mocks.reconcileAll).toHaveBeenCalledWith("execute");
    expect(mocks.reconcileSettlements).toHaveBeenCalledWith({
      provider: { provider: "fake" },
      maxRecords: 200,
    });
  });
});
