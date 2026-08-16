import { afterEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";
import PackageModel from "../../../db/models/package.model.js";
import SubscriptionModel from "../../../db/models/subscription.model.js";
import { assertSystemRefundTransitionReady, isSystemSettlementRefund } from "../voluntary-cancellation-transition.service.js";

const TENANT_ID = "507f1f77bcf86cd799439011";
const PAID_SUB_ID = "507f1f77bcf86cd799439012";
const FREE_PKG_ID = "507f1f77bcf86cd799439010";
const PAID_PKG_ID = "507f1f77bcf86cd799439013";

const objectId = (hex: string) => new Types.ObjectId(hex);

function mockFindOne(model: unknown, result: unknown | null): void {
  vi.spyOn(model as { findOne: () => unknown }, "findOne").mockReturnValue({
    lean: () => ({ exec: vi.fn().mockResolvedValue(result) }),
  } as never);
}

function mockFind(model: unknown, results: unknown[]): void {
  vi.spyOn(model as { find: () => unknown }, "find").mockReturnValue({
    lean: () => ({ exec: vi.fn().mockResolvedValue(results) }),
  } as never);
}

function mockValidInvariant(): void {
  vi.spyOn(SubscriptionModel.collection, "indexes").mockResolvedValue([{
    name: "uq_tenant_effective_subscription",
    key: { tenantId: 1 },
    unique: true,
    partialFilterExpression: { status: { $in: ["TRIALING", "INCOMPLETE", "ACTIVE", "PAST_DUE", "PAUSED", "CANCEL_AT_PERIOD_END"] } },
  }] as never);
  vi.spyOn(SubscriptionModel.collection, "aggregate").mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) } as never);
}

function mockInvalidInvariant(): void {
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
}

const baseInput = { tenantId: TENANT_ID, subscriptionId: PAID_SUB_ID };
const paidSub = (status: string) => ({ _id: objectId(PAID_SUB_ID), tenantId: objectId(TENANT_ID), status, packageId: objectId(PAID_PKG_ID) });
const freeSub = (overrides: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(),
  tenantId: objectId(TENANT_ID),
  status: "ACTIVE",
  packageId: objectId(FREE_PKG_ID),
  provider: "local",
  providerSubscriptionId: "",
  ...overrides,
});

function seedAlreadyFree(input = baseInput, effective: Record<string, unknown>[] = [freeSub()], invariant: () => void = mockValidInvariant) {
  mockFindOne(PackageModel, { _id: objectId(FREE_PKG_ID) });
  mockFindOne(SubscriptionModel, paidSub("CANCELED"));
  mockFind(SubscriptionModel, effective);
  invariant();
  return input;
}

describe("system settlement transition classification", () => {
  afterEach(() => vi.restoreAllMocks());
  it("recognizes the canonical system settlement", () => {
    expect(isSystemSettlementRefund({ reasonCode: "SYSTEM_REMAINING_BALANCE_REFUND", subscriptionImpact: "NONE", amountMinor: 999, maximumEligibleRefundMinor: 999 })).toBe(true);
  });

  it("repairs the earlier voluntary-cancellation representation only when it is an exact calculated settlement", () => {
    expect(isSystemSettlementRefund({ reasonCode: "VOLUNTARY_CANCELLATION", subscriptionImpact: "CANCEL_AND_MOVE_TO_FREE", amountMinor: 999, maximumEligibleRefundMinor: 999 })).toBe(true);
    expect(isSystemSettlementRefund({ reasonCode: "VOLUNTARY_CANCELLATION", subscriptionImpact: "CANCEL_AND_MOVE_TO_FREE", amountMinor: 500, maximumEligibleRefundMinor: 999 })).toBe(false);
  });
});

describe("system refund transition readiness", () => {
  afterEach(() => vi.restoreAllMocks());

  it("CASE A: still allows a provider refund when the paid subscription is effective and the exact effective-subscription index is ready", async () => {
    mockFindOne(PackageModel, { _id: objectId(FREE_PKG_ID) });
    mockFindOne(SubscriptionModel, paidSub("ACTIVE"));
    mockValidInvariant();

    await expect(assertSystemRefundTransitionReady(baseInput)).resolves.toBeUndefined();
  });

  it("CASE A: still ignores the refund transition-state input (backward compatible)", async () => {
    mockFindOne(PackageModel, { _id: objectId(FREE_PKG_ID) });
    mockFindOne(SubscriptionModel, paidSub("ACTIVE"));
    mockValidInvariant();

    await expect(assertSystemRefundTransitionReady({ ...baseInput, refund: { subscriptionImpactStatus: "PENDING", localTransitionStatus: "PENDING" } })).resolves.toBeUndefined();
  });

  it("fails before a provider refund when an unrestricted tenant index remains", async () => {
    mockFindOne(PackageModel, { _id: objectId(FREE_PKG_ID) });
    mockFindOne(SubscriptionModel, paidSub("ACTIVE"));
    mockInvalidInvariant();

    await expect(assertSystemRefundTransitionReady(baseInput)).rejects.toMatchObject({
      statusCode: 503,
      code: "SUBSCRIPTION_INDEX_MIGRATION_REQUIRED",
      message: "Refund transition is temporarily unavailable",
    });
  });

  it("fails closed when the canonical Free package is unavailable", async () => {
    mockFindOne(PackageModel, null);
    mockFindOne(SubscriptionModel, paidSub("ACTIVE"));

    await expect(assertSystemRefundTransitionReady(baseInput)).rejects.toMatchObject({
      code: "SUBSCRIPTION_INDEX_MIGRATION_REQUIRED",
    });
  });

  it("fails closed when the paid subscription is missing for this tenant", async () => {
    mockFindOne(PackageModel, { _id: objectId(FREE_PKG_ID) });
    mockFindOne(SubscriptionModel, null);

    await expect(assertSystemRefundTransitionReady(baseInput)).rejects.toMatchObject({
      code: "SUBSCRIPTION_INDEX_MIGRATION_REQUIRED",
    });
  });

  it("fails closed when the paid subscription is in a non-CANCELED terminal state (EXPIRED)", async () => {
    mockFindOne(PackageModel, { _id: objectId(FREE_PKG_ID) });
    mockFindOne(SubscriptionModel, paidSub("EXPIRED"));
    mockValidInvariant();

    await expect(assertSystemRefundTransitionReady(baseInput)).rejects.toMatchObject({
      code: "SUBSCRIPTION_INDEX_MIGRATION_REQUIRED",
    });
  });

  it("CASE B: passes when the paid subscription is CANCELED and a single canonical Free is ACTIVE", async () => {
    seedAlreadyFree();

    await expect(assertSystemRefundTransitionReady({
      ...baseInput,
      refund: { subscriptionImpactStatus: "PENDING", localTransitionStatus: "PENDING" },
    })).resolves.toBeUndefined();
  });

  it("CASE B: passes without refund transition-state input (backward compatible)", async () => {
    seedAlreadyFree();

    await expect(assertSystemRefundTransitionReady(baseInput)).resolves.toBeUndefined();
  });

  it("CASE B: fails closed when the paid subscription is CANCELED but the tenant has no effective subscription", async () => {
    seedAlreadyFree(baseInput, []);

    await expect(assertSystemRefundTransitionReady(baseInput)).rejects.toMatchObject({
      code: "SUBSCRIPTION_INDEX_MIGRATION_REQUIRED",
    });
  });

  it("CASE B: fails closed when multiple effective subscriptions are ambiguous", async () => {
    seedAlreadyFree(baseInput, [freeSub(), freeSub({ _id: new Types.ObjectId() })]);

    await expect(assertSystemRefundTransitionReady(baseInput)).rejects.toMatchObject({
      code: "SUBSCRIPTION_INDEX_MIGRATION_REQUIRED",
    });
  });

  it("CASE B: fails closed when the current subscription is not the canonical Free package", async () => {
    seedAlreadyFree(baseInput, [freeSub({ packageId: objectId(PAID_PKG_ID) })]);

    await expect(assertSystemRefundTransitionReady(baseInput)).rejects.toMatchObject({
      code: "SUBSCRIPTION_INDEX_MIGRATION_REQUIRED",
    });
  });

  it("CASE B: fails closed when the current Free subscription is not serviceable (PAST_DUE)", async () => {
    seedAlreadyFree(baseInput, [freeSub({ status: "PAST_DUE" })]);

    await expect(assertSystemRefundTransitionReady(baseInput)).rejects.toMatchObject({
      code: "SUBSCRIPTION_INDEX_MIGRATION_REQUIRED",
    });
  });

  it("CASE B: fails closed when the current Free subscription is provider-linked", async () => {
    seedAlreadyFree(baseInput, [freeSub({ provider: "stripe", providerSubscriptionId: "sub_abc" })]);

    await expect(assertSystemRefundTransitionReady(baseInput)).rejects.toMatchObject({
      code: "SUBSCRIPTION_INDEX_MIGRATION_REQUIRED",
    });
  });

  it("CASE B: fails closed when the subscription impact transition is still retryable", async () => {
    seedAlreadyFree(baseInput);

    await expect(assertSystemRefundTransitionReady({
      ...baseInput,
      refund: { subscriptionImpactStatus: "RETRY_PENDING", localTransitionStatus: "PENDING" },
    })).rejects.toMatchObject({ code: "SUBSCRIPTION_INDEX_MIGRATION_REQUIRED" });
  });

  it("CASE B: fails closed when the local transition is still retryable", async () => {
    seedAlreadyFree(baseInput);

    await expect(assertSystemRefundTransitionReady({
      ...baseInput,
      refund: { subscriptionImpactStatus: "PENDING", localTransitionStatus: "RETRY_PENDING" },
    })).rejects.toMatchObject({ code: "SUBSCRIPTION_INDEX_MIGRATION_REQUIRED" });
  });

  it("CASE B: fails closed when the effective-subscription uniqueness invariant does not hold", async () => {
    seedAlreadyFree(baseInput, [freeSub()], mockInvalidInvariant);

    await expect(assertSystemRefundTransitionReady(baseInput)).rejects.toMatchObject({
      code: "SUBSCRIPTION_INDEX_MIGRATION_REQUIRED",
    });
  });
});