import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ subscriptionFindOne: vi.fn(), refundExists: vi.fn(), packageFindById: vi.fn() }));
vi.mock("../../../db/models/subscription.model.js", () => ({ default: { findOne: mocks.subscriptionFindOne } }));
vi.mock("../../../db/models/refund.model.js", () => ({ default: { exists: mocks.refundExists } }));
vi.mock("../../../db/models/package.model.js", () => ({ default: { findById: mocks.packageFindById } }));
vi.mock("../../../config/index.js", () => ({ config: { BILLING_PAST_DUE_GRACE_DAYS: 7 } }));
import { MongoEntitlementProvider } from "../adapters/mongo-entitlement-provider.js";

const query = <T>(value: T) => ({ sort: () => query(value), then: (resolve: (result: T) => unknown) => Promise.resolve(resolve(value)) });
const entitlement = { employees: 1, admins: 1, documents: 10, storageMb: 100, fileSizeMb: 10, queriesPerMonth: 100, tokensPerMonth: 1000, ocrPagesPerMonth: 100 };
describe("Mongo entitlement lifecycle enforcement", () => {
  beforeEach(() => {
    mocks.subscriptionFindOne.mockReset();
    mocks.refundExists.mockReset().mockResolvedValue(null);
    mocks.packageFindById.mockReset();
  });
  it.each(["PAUSED", "UNPAID", "CANCELED", "EXPIRED", "INCOMPLETE"])("fails closed for %s", async (status) => {
    mocks.subscriptionFindOne.mockReturnValue(query({ status, periodEnd: null, currentPeriodEnd: null, trialEnd: null, cancelAtPeriodEnd: false, lastProviderEventTimestamp: new Date(), updatedAt: new Date(), packageId: "pkg", packageVersion: 1 }));
    await expect(new MongoEntitlementProvider().getSnapshot("507f1f77bcf86cd799439011")).resolves.toBeNull();
    expect(mocks.packageFindById).not.toHaveBeenCalled();
  });
  it("preserves active access and package quotas", async () => {
    mocks.subscriptionFindOne.mockReturnValue(query({ status: "ACTIVE", paymentState: "paid", periodEnd: null, currentPeriodEnd: null, trialEnd: null, cancelAtPeriodEnd: false, lastProviderEventTimestamp: new Date(), updatedAt: new Date(), packageId: "pkg", packageVersion: 1 }));
    mocks.packageFindById.mockReturnValue(query({ active: true, versions: [{ version: 1, entitlements: entitlement, supportedModels: [], analyticsLevel: "basic", retentionDays: 30, supportLevel: "community" }] }));
    await expect(new MongoEntitlementProvider().getSnapshot("507f1f77bcf86cd799439011")).resolves.toMatchObject({ employees: 1, documents: 10 });
  });
  it("fails closed while a succeeded system refund is still moving paid access to Free", async () => {
    mocks.subscriptionFindOne.mockReturnValue(query({ _id: "subscription", tenantId: "507f1f77bcf86cd799439011", status: "ACTIVE", paymentState: "paid", periodEnd: null, currentPeriodEnd: null, trialEnd: null, cancelAtPeriodEnd: false, lastProviderEventTimestamp: new Date(), updatedAt: new Date(), packageId: "pkg", packageVersion: 1 }));
    mocks.refundExists.mockResolvedValue({ _id: "refund" });
    await expect(new MongoEntitlementProvider().getSnapshot("507f1f77bcf86cd799439011")).resolves.toBeNull();
    expect(mocks.packageFindById).not.toHaveBeenCalled();
  });
  it.each([
    ["refunded payment state", { paymentState: "refunded" }],
    ["missing payment state", {}],
  ])("fails closed for ACTIVE subscription with %s", async (_label, overrides) => {
    mocks.subscriptionFindOne.mockReturnValue(query({ status: "ACTIVE", periodEnd: null, currentPeriodEnd: null, trialEnd: null, cancelAtPeriodEnd: false, lastProviderEventTimestamp: new Date(), updatedAt: new Date(), packageId: "pkg", packageVersion: 1, ...overrides }));
    mocks.packageFindById.mockReturnValue(query({ active: true, versions: [{ version: 1, entitlements: entitlement }] }));
    await expect(new MongoEntitlementProvider().getSnapshot("507f1f77bcf86cd799439011")).resolves.toBeNull();
  });
  it.each([
    ["an inactive package", { active: false, versions: [{ version: 1, entitlements: entitlement }] }],
    ["a missing package version", { active: true, versions: [{ version: 2, entitlements: entitlement }] }],
    ["missing entitlements", { active: true, versions: [{ version: 1 }] }],
  ])("fails closed for ACTIVE subscription with %s", async (_label, pkg) => {
    mocks.subscriptionFindOne.mockReturnValue(query({ status: "ACTIVE", paymentState: "paid", periodEnd: null, currentPeriodEnd: null, trialEnd: null, cancelAtPeriodEnd: false, lastProviderEventTimestamp: new Date(), updatedAt: new Date(), packageId: "pkg", packageVersion: 1 }));
    mocks.packageFindById.mockReturnValue(query(pkg));
    await expect(new MongoEntitlementProvider().getSnapshot("507f1f77bcf86cd799439011")).resolves.toBeNull();
  });
  it("fails closed when the ACTIVE subscription package is missing", async () => {
    mocks.subscriptionFindOne.mockReturnValue(query({ status: "ACTIVE", paymentState: "paid", periodEnd: null, currentPeriodEnd: null, trialEnd: null, cancelAtPeriodEnd: false, lastProviderEventTimestamp: new Date(), updatedAt: new Date(), packageId: "pkg", packageVersion: 1 }));
    mocks.packageFindById.mockReturnValue(query(null));
    await expect(new MongoEntitlementProvider().getSnapshot("507f1f77bcf86cd799439011")).resolves.toBeNull();
  });
  it("fails closed when a past-due timestamp is too old", async () => {
    mocks.subscriptionFindOne.mockReturnValue(query({ status: "PAST_DUE", periodEnd: null, currentPeriodEnd: null, trialEnd: null, cancelAtPeriodEnd: false, lastProviderEventTimestamp: new Date("2020-01-01"), updatedAt: new Date("2020-01-01"), packageId: "pkg", packageVersion: 1 }));
    await expect(new MongoEntitlementProvider().getSnapshot("507f1f77bcf86cd799439011")).resolves.toBeNull();
  });
});
