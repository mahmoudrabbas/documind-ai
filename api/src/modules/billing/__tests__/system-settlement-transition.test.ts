import { afterEach, describe, expect, it, vi } from "vitest";
import PackageModel from "../../../db/models/package.model.js";
import SubscriptionModel from "../../../db/models/subscription.model.js";
import { assertSystemRefundTransitionReady, isSystemSettlementRefund } from "../voluntary-cancellation-transition.service.js";

describe("system settlement transition classification", () => {
  afterEach(() => vi.restoreAllMocks());
  it("recognizes the canonical system settlement", () => {
    expect(isSystemSettlementRefund({ reasonCode: "SYSTEM_REMAINING_BALANCE_REFUND", subscriptionImpact: "NONE", amountMinor: 999, maximumEligibleRefundMinor: 999 })).toBe(true);
  });

  it("repairs the earlier voluntary-cancellation representation only when it is an exact calculated settlement", () => {
    expect(isSystemSettlementRefund({ reasonCode: "VOLUNTARY_CANCELLATION", subscriptionImpact: "CANCEL_AND_MOVE_TO_FREE", amountMinor: 999, maximumEligibleRefundMinor: 999 })).toBe(true);
    expect(isSystemSettlementRefund({ reasonCode: "VOLUNTARY_CANCELLATION", subscriptionImpact: "CANCEL_AND_MOVE_TO_FREE", amountMinor: 500, maximumEligibleRefundMinor: 999 })).toBe(false);
  });

  it("allows provider refund execution only when Free and the exact effective-subscription index are ready", async () => {
    vi.spyOn(PackageModel, "exists").mockResolvedValue({ _id: "free" } as never);
    vi.spyOn(SubscriptionModel, "exists").mockResolvedValue({ _id: "paid" } as never);
    vi.spyOn(SubscriptionModel.collection, "indexes").mockResolvedValue([{
      name: "uq_tenant_effective_subscription",
      key: { tenantId: 1 },
      unique: true,
      partialFilterExpression: { status: { $in: ["TRIALING", "INCOMPLETE", "ACTIVE", "PAST_DUE", "PAUSED", "CANCEL_AT_PERIOD_END"] } },
    }] as never);
    vi.spyOn(SubscriptionModel.collection, "aggregate").mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) } as never);

    await expect(assertSystemRefundTransitionReady({ tenantId: "507f1f77bcf86cd799439011", subscriptionId: "507f1f77bcf86cd799439012" })).resolves.toBeUndefined();
  });

  it("fails before a provider refund when an unrestricted tenant index remains", async () => {
    vi.spyOn(PackageModel, "exists").mockResolvedValue({ _id: "free" } as never);
    vi.spyOn(SubscriptionModel, "exists").mockResolvedValue({ _id: "paid" } as never);
    vi.spyOn(SubscriptionModel.collection, "indexes").mockResolvedValue([
      {
        name: "uq_tenant_effective_subscription",
        key: { tenantId: 1 },
        unique: true,
        partialFilterExpression: { status: { $in: ["TRIALING", "INCOMPLETE", "ACTIVE", "PAST_DUE", "PAUSED", "CANCEL_AT_PERIOD_END"] } },
      },
      { name: "tenantId_1", key: { tenantId: 1 }, unique: true },
    ] as never);
    vi.spyOn(SubscriptionModel.collection, "aggregate").mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) } as never);

    await expect(assertSystemRefundTransitionReady({ tenantId: "507f1f77bcf86cd799439011", subscriptionId: "507f1f77bcf86cd799439012" })).rejects.toMatchObject({
      statusCode: 503,
      code: "SUBSCRIPTION_INDEX_MIGRATION_REQUIRED",
      message: "Refund transition is temporarily unavailable",
    });
  });

  it("fails closed when the canonical Free package is unavailable", async () => {
    vi.spyOn(PackageModel, "exists").mockResolvedValue(null);
    vi.spyOn(SubscriptionModel, "exists").mockResolvedValue({ _id: "paid" } as never);

    await expect(assertSystemRefundTransitionReady({ tenantId: "507f1f77bcf86cd799439011", subscriptionId: "507f1f77bcf86cd799439012" })).rejects.toMatchObject({
      code: "SUBSCRIPTION_INDEX_MIGRATION_REQUIRED",
    });
  });
});
