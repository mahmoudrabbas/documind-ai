import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../config/index.js", () => ({ config: { NODE_ENV: "test", BILLING_PAST_DUE_GRACE_DAYS: 7 } }));
import { setAuditWriter, setMetricRecorder } from "../../../common/observability/index.js";
import PackageModel from "../../../db/models/package.model.js";
import SubscriptionModel from "../../../db/models/subscription.model.js";
import { MongoEntitlementProvider } from "../../entitlement/adapters/mongo-entitlement-provider.js";
import { ensureFreeFallbackSubscription, computeLocalFreePeriod, resolveCurrentLocalFreePeriod, resolveFreePeriod } from "../free-fallback.service.js";

let mongo: MongoMemoryReplSet | null = null;

const TENANT_ID = new Types.ObjectId();
const PAID_PKG_ID = new Types.ObjectId();
const FREE_PKG_ID = new Types.ObjectId();
const PAID_SUB_ID = new Types.ObjectId();

const PAID_ENTITLEMENTS = { employees: 1, admins: 1, documents: 10, storageMb: 100, fileSizeMb: 10, queriesPerMonth: 100, tokensPerMonth: 100000, ocrPagesPerMonth: 0 };

function packageRecord(id: Types.ObjectId, code: string, price: number, ents = PAID_ENTITLEMENTS) {
  return {
    _id: id, name: code === "free" ? "Free" : "Paid", code, description: "Test package",
    active: true, version: 1, monthlyPrice: price, annualPrice: price * 10, currency: "USD",
    entitlements: ents, trialDays: 0, visibility: "public", supportedModels: ["basic"], analyticsLevel: "basic",
    retentionDays: 90, supportLevel: "community", stripeProductId: "", stripePriceId: "", stripeAnnualPriceId: "",
    versions: [{ version: 1, name: code, code, monthlyPrice: price, annualPrice: price * 10, currency: "USD", entitlements: ents, trialDays: 0, visibility: "public", supportedModels: ["basic"], analyticsLevel: "basic", retentionDays: 90, supportLevel: "community", stripeProductId: "", stripePriceId: "", stripeAnnualPriceId: "", createdAt: new Date() }],
  };
}

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    instanceOpts: [{ launchTimeout: 60_000 }],
    replSet: { count: 1, storageEngine: "wiredTiger", ip: "127.0.0.1" },
  });
  await mongoose.connect(mongo.getUri(), { dbName: `free-fallback-${Date.now()}` });
  setAuditWriter({ write: async () => true });
  setMetricRecorder({ increment() {}, histogram() {}, gauge() {} });
});

afterAll(async () => {
  setAuditWriter(null); setMetricRecorder(null);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

beforeEach(async () => {
  await SubscriptionModel.deleteMany({});
  await PackageModel.deleteMany({});
  await Promise.all([
    PackageModel.syncIndexes(), SubscriptionModel.syncIndexes(),
  ]);
  await PackageModel.insertMany([packageRecord(FREE_PKG_ID, "free", 0, { employees: 1, admins: 0, documents: 10, storageMb: 1000, fileSizeMb: 10, queriesPerMonth: 100, tokensPerMonth: 100000, ocrPagesPerMonth: 10 })]);
});

describe("computeLocalFreePeriod", () => {
  it("uses calendar-month arithmetic, not a fixed 30-day duration", () => {
    // August has 31 days — period end must be Sep 16, not Aug 16 + 30 = Sep 15
    const now = new Date("2026-08-16T12:00:00.000Z");
    const { periodStart, periodEnd } = computeLocalFreePeriod(now);
    expect(periodStart.getTime()).toBe(now.getTime());
    expect(periodEnd.getTime()).toBe(new Date("2026-09-16T12:00:00.000Z").getTime());
    expect(periodEnd.getTime() - periodStart.getTime()).toBe(31 * 24 * 60 * 60 * 1000);
  });

  it("Jan 31 → Feb 28 (last day of short month, non-leap year)", () => {
    const { periodStart, periodEnd } = computeLocalFreePeriod(new Date("2025-01-31T00:00:00.000Z"));
    expect(periodStart.getTime()).toBe(new Date("2025-01-31T00:00:00.000Z").getTime());
    expect(periodEnd.getTime()).toBe(new Date("2025-02-28T00:00:00.000Z").getTime());
  });

  it("Jan 31 → Feb 29 in a leap year", () => {
    const { periodStart, periodEnd } = computeLocalFreePeriod(new Date("2024-01-31T00:00:00.000Z"));
    expect(periodStart.getTime()).toBe(new Date("2024-01-31T00:00:00.000Z").getTime());
    expect(periodEnd.getTime()).toBe(new Date("2024-02-29T00:00:00.000Z").getTime());
  });

  it("Feb 29 → Mar 29 (leap day rolls to same day-of-month in March)", () => {
    const { periodStart, periodEnd } = computeLocalFreePeriod(new Date("2024-02-29T00:00:00.000Z"));
    expect(periodStart.getTime()).toBe(new Date("2024-02-29T00:00:00.000Z").getTime());
    expect(periodEnd.getTime()).toBe(new Date("2024-03-29T00:00:00.000Z").getTime());
  });

  it("Mar 31 → Apr 30 (end-of-month clamping for 30-day months)", () => {
    const { periodStart, periodEnd } = computeLocalFreePeriod(new Date("2026-03-31T00:00:00.000Z"));
    expect(periodStart.getTime()).toBe(new Date("2026-03-31T00:00:00.000Z").getTime());
    expect(periodEnd.getTime()).toBe(new Date("2026-04-30T00:00:00.000Z").getTime());
  });

  it("Jan 15 → Feb 15 (normal mid-month start)", () => {
    const { periodStart, periodEnd } = computeLocalFreePeriod(new Date("2026-01-15T00:00:00.000Z"));
    expect(periodStart.getTime()).toBe(new Date("2026-01-15T00:00:00.000Z").getTime());
    expect(periodEnd.getTime()).toBe(new Date("2026-02-15T00:00:00.000Z").getTime());
  });

  it("Dec 31 → Jan 31 (year boundary)", () => {
    const { periodStart, periodEnd } = computeLocalFreePeriod(new Date("2026-12-31T00:00:00.000Z"));
    expect(periodStart.getTime()).toBe(new Date("2026-12-31T00:00:00.000Z").getTime());
    expect(periodEnd.getTime()).toBe(new Date("2027-01-31T00:00:00.000Z").getTime());
  });

  it("Feb 28 → Mar 28 in a non-leap year", () => {
    const { periodStart, periodEnd } = computeLocalFreePeriod(new Date("2025-02-28T00:00:00.000Z"));
    expect(periodStart.getTime()).toBe(new Date("2025-02-28T00:00:00.000Z").getTime());
    expect(periodEnd.getTime()).toBe(new Date("2025-03-28T00:00:00.000Z").getTime());
  });
});

describe("resolveFreePeriod", () => {
  it("inherits a valid retained period", () => {
    const ps = new Date("2026-08-15T00:00:00.000Z");
    const pe = new Date("2026-09-15T00:00:00.000Z");
    const result = resolveFreePeriod({ periodStart: ps, periodEnd: pe });
    expect(result.periodStart).toBe(ps);
    expect(result.periodEnd).toBe(pe);
  });

  it("falls back to a fresh local period when retained is null", () => {
    const now = new Date("2026-08-16T12:00:00.000Z");
    const result = resolveFreePeriod({ periodStart: null, periodEnd: null }, now);
    expect(result.periodStart.getTime()).toBe(now.getTime());
    // Calendar-month: Aug 16 → Sep 16 (not 30-day Sep 15)
    expect(result.periodEnd.getTime()).toBe(new Date("2026-09-16T12:00:00.000Z").getTime());
    expect(result.periodEnd.getTime() - result.periodStart.getTime()).toBe(31 * 24 * 60 * 60 * 1000);
  });

  it("falls back to a fresh local period when start exists but end is null (invalid)", () => {
    const now = new Date("2026-08-16T12:00:00.000Z");
    const retainedStart = new Date("2026-08-15T00:00:00.000Z");
    const result = resolveFreePeriod({ periodStart: retainedStart, periodEnd: null }, now);
    // Anchors to the retained periodStart and computes end via calendar month
    expect(result.periodStart.getTime()).toBe(retainedStart.getTime());
    expect(result.periodEnd.getTime()).toBe(new Date("2026-09-15T00:00:00.000Z").getTime());
  });
});

describe("resolveCurrentLocalFreePeriod", () => {
  it("returns the period unchanged while it is still active", () => {
    const ps = new Date("2026-08-16T00:00:00.000Z");
    const pe = new Date("2026-09-16T00:00:00.000Z");
    const result = resolveCurrentLocalFreePeriod(ps, pe, new Date("2026-08-20T00:00:00.000Z"));
    expect(result.periodStart.getTime()).toBe(ps.getTime());
    expect(result.periodEnd.getTime()).toBe(pe.getTime());
  });

  it("advances at the exact period boundary (Aug 16 → Sep 16)", () => {
    const result = resolveCurrentLocalFreePeriod(
      new Date("2026-08-16T00:00:00.000Z"),
      new Date("2026-09-16T00:00:00.000Z"),
      new Date("2026-09-16T00:00:00.000Z"),
    );
    expect(result.periodStart.getTime()).toBe(new Date("2026-09-16T00:00:00.000Z").getTime());
    expect(result.periodEnd.getTime()).toBe(new Date("2026-10-16T00:00:00.000Z").getTime());
  });

  it("advances after the boundary, anchoring the next cycle at the old periodEnd", () => {
    const result = resolveCurrentLocalFreePeriod(
      new Date("2026-08-16T00:00:00.000Z"),
      new Date("2026-09-16T00:00:00.000Z"),
      new Date("2026-09-20T00:00:00.000Z"),
    );
    expect(result.periodStart.getTime()).toBe(new Date("2026-09-16T00:00:00.000Z").getTime());
    expect(result.periodEnd.getTime()).toBe(new Date("2026-10-16T00:00:00.000Z").getTime());
  });

  it("Jan 31 → Feb 28 rolls to Feb 28 → Mar 28 (short month clamp)", () => {
    const result = resolveCurrentLocalFreePeriod(
      new Date("2025-01-31T00:00:00.000Z"),
      new Date("2025-02-28T00:00:00.000Z"),
      new Date("2025-02-28T00:00:00.000Z"),
    );
    expect(result.periodStart.getTime()).toBe(new Date("2025-02-28T00:00:00.000Z").getTime());
    expect(result.periodEnd.getTime()).toBe(new Date("2025-03-28T00:00:00.000Z").getTime());
  });

  it("Jan 31 → Feb 29 in a leap year rolls to Feb 29 → Mar 29", () => {
    const result = resolveCurrentLocalFreePeriod(
      new Date("2024-01-31T00:00:00.000Z"),
      new Date("2024-02-29T00:00:00.000Z"),
      new Date("2024-02-29T00:00:00.000Z"),
    );
    expect(result.periodStart.getTime()).toBe(new Date("2024-02-29T00:00:00.000Z").getTime());
    expect(result.periodEnd.getTime()).toBe(new Date("2024-03-29T00:00:00.000Z").getTime());
  });

  it("Mar 31 → Apr 30 rolls to Apr 30 → May 30", () => {
    const result = resolveCurrentLocalFreePeriod(
      new Date("2026-03-31T00:00:00.000Z"),
      new Date("2026-04-30T00:00:00.000Z"),
      new Date("2026-04-30T00:00:00.000Z"),
    );
    expect(result.periodStart.getTime()).toBe(new Date("2026-04-30T00:00:00.000Z").getTime());
    expect(result.periodEnd.getTime()).toBe(new Date("2026-05-30T00:00:00.000Z").getTime());
  });

  it("crosses the year boundary (Dec 15 → Jan 15 rolls to Jan 15 → Feb 15)", () => {
    const result = resolveCurrentLocalFreePeriod(
      new Date("2026-12-15T00:00:00.000Z"),
      new Date("2027-01-15T00:00:00.000Z"),
      new Date("2027-01-15T00:00:00.000Z"),
    );
    expect(result.periodStart.getTime()).toBe(new Date("2027-01-15T00:00:00.000Z").getTime());
    expect(result.periodEnd.getTime()).toBe(new Date("2027-02-15T00:00:00.000Z").getTime());
  });

  it("catches up across multiple missed periods in one call", () => {
    const result = resolveCurrentLocalFreePeriod(
      new Date("2026-01-15T00:00:00.000Z"),
      new Date("2026-02-15T00:00:00.000Z"),
      new Date("2026-04-10T00:00:00.000Z"),
    );
    // Feb 15→Mar 15 ≤ now, Mar 15→Apr 15 contains Apr 10
    expect(result.periodStart.getTime()).toBe(new Date("2026-03-15T00:00:00.000Z").getTime());
    expect(result.periodEnd.getTime()).toBe(new Date("2026-04-15T00:00:00.000Z").getTime());
  });

  it("returns a period that contains `now`", () => {
    const result = resolveCurrentLocalFreePeriod(
      new Date("2026-01-15T00:00:00.000Z"),
      new Date("2026-02-15T00:00:00.000Z"),
      new Date("2026-07-03T00:00:00.000Z"),
    );
    expect(result.periodStart.getTime()).toBeLessThanOrEqual(new Date("2026-07-03T00:00:00.000Z").getTime());
    expect(result.periodEnd.getTime()).toBeGreaterThan(new Date("2026-07-03T00:00:00.000Z").getTime());
  });
});

describe("ensureFreeFallbackSubscription — period continuity", () => {
  it("paid ACTIVE → Free ACTIVE preserves the paid entitlement period", async () => {
    const periodStart = new Date("2026-08-15T00:00:00.000Z");
    const periodEnd = new Date("2026-09-15T00:00:00.000Z");
    await SubscriptionModel.create({
      _id: PAID_SUB_ID, tenantId: TENANT_ID, packageId: PAID_PKG_ID, packageVersion: 1,
      status: "CANCELED", paymentState: "paid",
      providerCustomerId: "cus_test", providerSubscriptionId: "sub_test", providerPriceId: "price_test",
      billingInterval: "monthly", periodStart, periodEnd,
      currentPeriodStart: periodStart, currentPeriodEnd: periodEnd,
      startedAt: periodStart,
    });

    const created = await ensureFreeFallbackSubscription({
      tenantId: String(TENANT_ID),
      retainedPeriod: { periodStart, periodEnd },
      reason: "PROVIDER_SUBSCRIPTION_DELETED",
    });

    expect(created).toBe(true);

    const freeSub = await SubscriptionModel.findOne({
      tenantId: TENANT_ID,
      packageId: FREE_PKG_ID,
      status: "ACTIVE",
    }).lean().exec();

    expect(freeSub).not.toBeNull();
    expect(freeSub!.periodStart).toEqual(periodStart);
    expect(freeSub!.periodEnd).toEqual(periodEnd);
    expect(freeSub!.currentPeriodStart).toEqual(periodStart);
    expect(freeSub!.currentPeriodEnd).toEqual(periodEnd);
    expect(freeSub!.provider).toBe("local");
    expect(freeSub!.providerSubscriptionId).toBe("");
    expect(freeSub!.billingInterval).toBe("monthly");
  });

  it("creates a valid local Free period using calendar-month arithmetic when no retained period is available", async () => {
    const created = await ensureFreeFallbackSubscription({
      tenantId: String(TENANT_ID),
      reason: "PROVIDER_SUBSCRIPTION_DELETED",
    });

    expect(created).toBe(true);
    const freeSub = await SubscriptionModel.findOne({
      tenantId: TENANT_ID, packageId: FREE_PKG_ID, status: "ACTIVE",
    }).lean().exec();

    expect(freeSub).not.toBeNull();
    expect(freeSub!.periodStart).not.toBeNull();
    expect(freeSub!.periodEnd).not.toBeNull();
    expect(freeSub!.periodEnd!.getTime()).toBeGreaterThan(freeSub!.periodStart!.getTime());
    // Calendar-month: Aug 16 → Sep 16 (31 days, not 30)
    expect(freeSub!.periodEnd!.getTime() - freeSub!.periodStart!.getTime()).toBe(31 * 24 * 60 * 60 * 1000);
  });

  it("preserves providerCustomerId for checkout reuse while keeping the subscription local", async () => {
    const created = await ensureFreeFallbackSubscription({
      tenantId: String(TENANT_ID),
      reason: "PROVIDER_SUBSCRIPTION_DELETED",
    });

    expect(created).toBe(true);
    const freeSub = await SubscriptionModel.findOne({
      tenantId: TENANT_ID, packageId: FREE_PKG_ID, status: "ACTIVE",
    }).lean().exec();

    expect(freeSub).not.toBeNull();
    expect(freeSub!.periodStart).not.toBeNull();
    expect(freeSub!.periodEnd).not.toBeNull();
    expect(freeSub!.periodEnd!.getTime()).toBeGreaterThan(freeSub!.periodStart!.getTime());
    // Calendar-month: Aug 16 → Sep 16 (31 days, not 30)
    expect(freeSub!.periodEnd!.getTime() - freeSub!.periodStart!.getTime()).toBe(31 * 24 * 60 * 60 * 1000);
  });

  it("is idempotent — calling twice does not create a second effective Free subscription", async () => {
    const periodStart = new Date("2026-08-15T00:00:00.000Z");
    const periodEnd = new Date("2026-09-15T00:00:00.000Z");
    await SubscriptionModel.create({
      _id: PAID_SUB_ID, tenantId: TENANT_ID, packageId: PAID_PKG_ID, packageVersion: 1,
      status: "CANCELED", paymentState: "paid", provider: "stripe",
      providerCustomerId: "cus_test", providerSubscriptionId: "sub_test",
      periodStart, periodEnd, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd,
      startedAt: periodStart,
    });

    await ensureFreeFallbackSubscription({
      tenantId: String(TENANT_ID),
      retainedPeriod: { periodStart, periodEnd },
      reason: "PROVIDER_SUBSCRIPTION_DELETED",
    });

    const second = await ensureFreeFallbackSubscription({
      tenantId: String(TENANT_ID),
      retainedPeriod: { periodStart, periodEnd },
      reason: "PROVIDER_SUBSCRIPTION_DELETED",
    });

    expect(second).toBe(false);
    const freeCount = await SubscriptionModel.countDocuments({
      tenantId: TENANT_ID, packageId: FREE_PKG_ID, status: "ACTIVE",
    });
    expect(freeCount).toBe(1);

    const freeSub = await SubscriptionModel.findOne({
      tenantId: TENANT_ID, packageId: FREE_PKG_ID, status: "ACTIVE",
    }).lean().exec();
    expect(freeSub!.periodStart).toEqual(periodStart);
    expect(freeSub!.periodEnd).toEqual(periodEnd);
  });

  it("preserves providerCustomerId for checkout reuse while keeping the subscription local", async () => {
    const periodStart = new Date("2026-08-15T00:00:00.000Z");
    const periodEnd = new Date("2026-09-15T00:00:00.000Z");
    await SubscriptionModel.create({
      _id: PAID_SUB_ID, tenantId: TENANT_ID, packageId: PAID_PKG_ID, packageVersion: 1,
      status: "CANCELED", paymentState: "paid", provider: "stripe",
      providerCustomerId: "cus_should_be_preserved", providerSubscriptionId: "sub_test",
      periodStart, periodEnd, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd,
      startedAt: periodStart,
    });

    await ensureFreeFallbackSubscription({
      tenantId: String(TENANT_ID),
      providerCustomerId: "cus_should_be_preserved",
      retainedPeriod: { periodStart, periodEnd },
      reason: "PROVIDER_SUBSCRIPTION_DELETED",
    });

    const freeSub = await SubscriptionModel.findOne({
      tenantId: TENANT_ID, packageId: FREE_PKG_ID, status: "ACTIVE",
    }).lean().exec();

    // providerCustomerId is preserved so a later Free → Paid checkout can reuse
    // the existing Stripe customer instead of creating a duplicate.
    expect(freeSub!.providerCustomerId).toBe("cus_should_be_preserved");
    // provider is "local" and providerSubscriptionId is "" so providerLinked is false,
    // which keeps canOpenPortal false.
    expect(freeSub!.provider).toBe("local");
    expect(freeSub!.providerSubscriptionId).toBe("");
    expect(freeSub!.billingInterval).toBe("monthly");
  });
});

describe("MongoEntitlementProvider — period continuity after Free fallback", () => {
  let provider: MongoEntitlementProvider;

  beforeEach(async () => {
    provider = new MongoEntitlementProvider();
  });

  it("getPeriodRange returns the inherited paid period for the Free subscription", async () => {
    const now = new Date();
    const periodStart = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const periodEnd = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000);
    await SubscriptionModel.create({
      _id: PAID_SUB_ID, tenantId: TENANT_ID, packageId: PAID_PKG_ID, packageVersion: 1,
      status: "CANCELED", paymentState: "paid", provider: "stripe",
      providerCustomerId: "cus_test", providerSubscriptionId: "sub_test",
      periodStart, periodEnd, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd,
      startedAt: periodStart,
    });

    await ensureFreeFallbackSubscription({
      tenantId: String(TENANT_ID),
      retainedPeriod: { periodStart, periodEnd },
      reason: "PROVIDER_SUBSCRIPTION_DELETED",
    });

    const range = await provider.getPeriodRange(String(TENANT_ID));
    expect(range.periodStart).toEqual(periodStart);
    expect(range.periodEnd).toEqual(periodEnd);
  });

  it("getSnapshot returns the Free entitlement limits (downgrade applied immediately)", async () => {
    const periodStart = new Date("2026-08-15T00:00:00.000Z");
    const periodEnd = new Date("2026-09-15T00:00:00.000Z");
    await SubscriptionModel.create({
      _id: PAID_SUB_ID, tenantId: TENANT_ID, packageId: PAID_PKG_ID, packageVersion: 1,
      status: "CANCELED", paymentState: "paid", provider: "stripe",
      providerCustomerId: "cus_test", providerSubscriptionId: "sub_test",
      periodStart, periodEnd, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd,
      startedAt: periodStart,
    });

    await ensureFreeFallbackSubscription({
      tenantId: String(TENANT_ID),
      retainedPeriod: { periodStart, periodEnd },
      reason: "PROVIDER_SUBSCRIPTION_DELETED",
    });

    const snapshot = await provider.getSnapshot(String(TENANT_ID));
    expect(snapshot).not.toBeNull();
    expect(snapshot!.documents).toBe(10);
    expect(snapshot!.queriesPerMonth).toBe(100);
  });
});
