import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../config/index.js", () => ({ config: { NODE_ENV: "test", BILLING_PAST_DUE_GRACE_DAYS: 7 } }));
import { setAuditWriter, setMetricRecorder } from "../../../common/observability/index.js";
import PackageModel from "../../../db/models/package.model.js";
import SubscriptionModel from "../../../db/models/subscription.model.js";
import UserModel from "../../../db/models/user.model.js";
import DocumentModel from "../../../db/models/document.model.js";
import { QuotaCounterModel } from "../../entitlement/adapters/mongo-quota-counter.js";
import { MongoQuotaCounter } from "../../entitlement/adapters/mongo-quota-counter.js";
import { MongoEntitlementProvider } from "../../entitlement/adapters/mongo-entitlement-provider.js";
import { EntitlementService } from "../../entitlement/entitlement.service.js";
import { ReconciliationService } from "../../entitlement/reconciliation.service.js";
import { ensureFreeFallbackSubscription, resolveCurrentLocalFreePeriod } from "../free-fallback.service.js";

let mongo: MongoMemoryReplSet | null = null;

const FREE_PKG_ID = new Types.ObjectId();
const FREE_ENTITLEMENTS = {
  employees: 5,
  admins: 2,
  documents: 100,
  storageMb: 1024,
  fileSizeMb: 50,
  queriesPerMonth: 1000,
  tokensPerMonth: 100000,
  ocrPagesPerMonth: 100,
};

const DAY = 24 * 60 * 60 * 1000;

function packageRecord() {
  return {
    _id: FREE_PKG_ID, name: "Free", code: "free", description: "Canonical Free plan",
    active: true, version: 1, monthlyPrice: 0, annualPrice: 0, currency: "USD",
    entitlements: FREE_ENTITLEMENTS, trialDays: 0, visibility: "public", supportedModels: ["basic"],
    analyticsLevel: "basic", retentionDays: 90, supportLevel: "community", stripeProductId: "",
    stripePriceId: "", stripeAnnualPriceId: "",
    versions: [{
      version: 1, name: "Free", code: "free", monthlyPrice: 0, annualPrice: 0, currency: "USD",
      entitlements: FREE_ENTITLEMENTS, trialDays: 0, visibility: "public", supportedModels: ["basic"],
      analyticsLevel: "basic", retentionDays: 90, supportLevel: "community", stripeProductId: "",
      stripePriceId: "", stripeAnnualPriceId: "", createdAt: new Date(),
    }],
  };
}

/** Create a local Free subscription with a concrete entitlement period. */
async function createLocalFreeSub(
  tenantId: string,
  periodStart: Date,
  periodEnd: Date,
  overrides: Record<string, unknown> = {},
) {
  return SubscriptionModel.create({
    tenantId: new Types.ObjectId(tenantId),
    packageId: FREE_PKG_ID,
    packageVersion: 1,
    status: "ACTIVE",
    paymentState: "paid",
    provider: "local",
    providerCustomerId: "",
    providerSubscriptionId: "",
    providerPriceId: "",
    billingInterval: "monthly",
    periodStart,
    periodEnd,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    startedAt: periodStart,
    cancelAtPeriodEnd: false,
    providerMetadata: {},
    ...overrides,
  });
}

/** YYYY-MM counter key, mirroring getCounterPeriodKey() (local getters). */
function keyFor(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    instanceOpts: [{ launchTimeout: 60_000 }],
    replSet: { count: 1, storageEngine: "wiredTiger", ip: "127.0.0.1" },
  });
  await mongoose.connect(mongo.getUri(), { dbName: `free-period-rollover-${Date.now()}` });
  setAuditWriter({ write: async () => true });
  setMetricRecorder({ increment() {}, histogram() {}, gauge() {} });
});

afterAll(async () => {
  setAuditWriter(null);
  setMetricRecorder(null);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([
    SubscriptionModel.deleteMany({}),
    PackageModel.deleteMany({}),
    QuotaCounterModel.deleteMany({}),
    UserModel.deleteMany({}),
    DocumentModel.deleteMany({}),
  ]);
  await Promise.all([PackageModel.syncIndexes(), SubscriptionModel.syncIndexes()]);
  await PackageModel.insertMany([packageRecord()]);
});

describe("MongoEntitlementProvider — local Free period rollover", () => {
  let provider: MongoEntitlementProvider;

  beforeEach(() => {
    provider = new MongoEntitlementProvider();
  });

  it("does not move the period while it is still active", async () => {
    const now = new Date();
    const periodStart = new Date(now.getTime() - 10 * DAY);
    const periodEnd = new Date(now.getTime() + 20 * DAY);
    const tenantId = new Types.ObjectId().toString();
    await createLocalFreeSub(tenantId, periodStart, periodEnd);

    const range = await provider.getPeriodRange(tenantId);

    expect(range.periodStart.getTime()).toBe(periodStart.getTime());
    expect(range.periodEnd!.getTime()).toBe(periodEnd.getTime());

    const stored = await SubscriptionModel.findOne({ tenantId: new Types.ObjectId(tenantId) }).lean().exec();
    expect(stored!.periodStart!.getTime()).toBe(periodStart.getTime());
    expect(stored!.periodEnd!.getTime()).toBe(periodEnd.getTime());
  });

  it("rolls over at the exact boundary (Aug 16 → Sep 16 analogue)", async () => {
    const now = new Date();
    const periodStart = new Date(now.getTime() - 30 * DAY);
    const periodEnd = new Date(now.getTime());
    const tenantId = new Types.ObjectId().toString();
    await createLocalFreeSub(tenantId, periodStart, periodEnd);

    const expected = resolveCurrentLocalFreePeriod(periodStart, periodEnd, now);
    const range = await provider.getPeriodRange(tenantId);

    expect(range.periodStart.getTime()).toBe(expected.periodStart.getTime());
    expect(range.periodEnd!.getTime()).toBe(expected.periodEnd.getTime());
    // Anchored at the old periodEnd, not reset to "now"/created-at.
    expect(range.periodStart.getTime()).toBe(periodEnd.getTime());
    expect(range.periodEnd!.getTime()).toBeGreaterThan(now.getTime());

    const stored = await SubscriptionModel.findOne({ tenantId: new Types.ObjectId(tenantId) }).lean().exec();
    expect(stored!.periodStart!.getTime()).toBe(expected.periodStart.getTime());
    expect(stored!.periodEnd!.getTime()).toBe(expected.periodEnd.getTime());
    expect(stored!.currentPeriodStart!.getTime()).toBe(expected.periodStart.getTime());
    expect(stored!.currentPeriodEnd!.getTime()).toBe(expected.periodEnd.getTime());
  });

  it("rolls over after the boundary, catching up multiple missed months in one call", async () => {
    const now = new Date();
    const periodStart = new Date(now.getTime() - 200 * DAY);
    const periodEnd = new Date(now.getTime() - 170 * DAY);
    const tenantId = new Types.ObjectId().toString();
    await createLocalFreeSub(tenantId, periodStart, periodEnd);

    const expected = resolveCurrentLocalFreePeriod(periodStart, periodEnd, now);
    const range = await provider.getPeriodRange(tenantId);

    expect(range.periodStart.getTime()).toBe(expected.periodStart.getTime());
    expect(range.periodEnd!.getTime()).toBe(expected.periodEnd.getTime());
    expect(range.periodStart.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(range.periodEnd!.getTime()).toBeGreaterThan(now.getTime());
  });

  it("returns a future periodReset and the advanced periodStart after rollover", async () => {
    const now = new Date();
    const periodStart = new Date(now.getTime() - 60 * DAY);
    const periodEnd = new Date(now.getTime() - 30 * DAY);
    const tenantId = new Types.ObjectId().toString();
    await createLocalFreeSub(tenantId, periodStart, periodEnd);

    const service = new EntitlementService(new MongoQuotaCounter(), provider);

    const reset = await service.getPeriodReset(tenantId);
    const start = await service.getPeriodStart(tenantId);

    expect(new Date(reset).getTime()).toBeGreaterThan(now.getTime());
    expect(start).toBe(new Date(periodEnd.getTime()).toISOString());
  });

  it("never rolls over paid (provider-linked) subscriptions", async () => {
    const now = new Date();
    const periodStart = new Date(now.getTime() - 90 * DAY);
    const periodEnd = new Date(now.getTime() - 60 * DAY);
    const tenantId = new Types.ObjectId().toString();
    await SubscriptionModel.create({
      tenantId: new Types.ObjectId(tenantId),
      packageId: FREE_PKG_ID,
      packageVersion: 1,
      status: "ACTIVE",
      paymentState: "paid",
      provider: "stripe",
      providerCustomerId: "cus_A",
      providerSubscriptionId: "sub_paid",
      providerPriceId: "price_paid",
      billingInterval: "monthly",
      periodStart,
      periodEnd,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      startedAt: periodStart,
      cancelAtPeriodEnd: false,
      providerMetadata: {},
    });

    const range = await provider.getPeriodRange(tenantId);

    // A paid subscription has no local renewal — the period is reported as-is.
    expect(range.periodStart.getTime()).toBe(periodStart.getTime());
    expect(range.periodEnd!.getTime()).toBe(periodEnd.getTime());
  });

  it("is idempotent — repeated calls after rollover are no-ops", async () => {
    const now = new Date();
    const periodStart = new Date(now.getTime() - 60 * DAY);
    const periodEnd = new Date(now.getTime() - 30 * DAY);
    const tenantId = new Types.ObjectId().toString();
    await createLocalFreeSub(tenantId, periodStart, periodEnd);

    const first = await provider.getPeriodRange(tenantId);
    const second = await provider.getPeriodRange(tenantId);
    const third = await provider.getPeriodRange(tenantId);

    expect(second.periodStart.getTime()).toBe(first.periodStart.getTime());
    expect(second.periodEnd!.getTime()).toBe(first.periodEnd!.getTime());
    expect(third.periodStart.getTime()).toBe(first.periodStart.getTime());
    expect(third.periodEnd!.getTime()).toBe(first.periodEnd!.getTime());

    const stored = await SubscriptionModel.findOne({ tenantId: new Types.ObjectId(tenantId) }).lean().exec();
    expect(stored!.periodEnd!.getTime()).toBe(first.periodEnd!.getTime());
  });

  it("concurrent rollover advances exactly once", async () => {
    const now = new Date();
    const periodStart = new Date(now.getTime() - 60 * DAY);
    const periodEnd = new Date(now.getTime() - 30 * DAY);
    const tenantId = new Types.ObjectId().toString();
    await createLocalFreeSub(tenantId, periodStart, periodEnd);

    const expected = resolveCurrentLocalFreePeriod(periodStart, periodEnd, now);
    const results = await Promise.all(
      Array.from({ length: 12 }, () => provider.getPeriodRange(tenantId)),
    );

    for (const range of results) {
      expect(range.periodStart.getTime()).toBe(expected.periodStart.getTime());
      expect(range.periodEnd!.getTime()).toBe(expected.periodEnd!.getTime());
    }

    const stored = await SubscriptionModel.findOne({ tenantId: new Types.ObjectId(tenantId) }).lean().exec();
    expect(stored!.periodStart!.getTime()).toBe(expected.periodStart.getTime());
    expect(stored!.periodEnd!.getTime()).toBe(expected.periodEnd.getTime());
  });
});

describe("monthly quota counters advance with the period", () => {
  let provider: MongoEntitlementProvider;
  let counter: MongoQuotaCounter;

  beforeEach(() => {
    provider = new MongoEntitlementProvider();
    counter = new MongoQuotaCounter();
  });

  it("new-period monthly usage starts fresh and old-period usage is preserved", async () => {
    const now = new Date();
    const periodStart = new Date(now.getTime() - 120 * DAY);
    const periodEnd = new Date(now.getTime() - 90 * DAY);
    const tenantId = new Types.ObjectId().toString();
    await createLocalFreeSub(tenantId, periodStart, periodEnd);

    const oldKey = keyFor(periodStart);
    await counter.set(tenantId, "queriesPerMonth", oldKey, 30);
    await counter.set(tenantId, "tokensPerMonth", oldKey, 5000);
    await counter.set(tenantId, "ocrPagesPerMonth", oldKey, 3);

    const service = new EntitlementService(counter, provider);
    const usage = await service.getUsage(tenantId);

    // The counter key already moved to the new period — fresh, empty counters.
    expect(usage.queriesPerMonth ?? 0).toBe(0);
    expect(usage.tokensPerMonth ?? 0).toBe(0);
    expect(usage.ocrPagesPerMonth ?? 0).toBe(0);

    // Historical rows are never deleted.
    expect(await counter.getUsage(tenantId, "queriesPerMonth", oldKey)).toBe(30);
    expect(await counter.getUsage(tenantId, "tokensPerMonth", oldKey)).toBe(5000);
    expect(await counter.getUsage(tenantId, "ocrPagesPerMonth", oldKey)).toBe(3);
    expect(await QuotaCounterModel.countDocuments({ tenantId: new Types.ObjectId(tenantId) })).toBe(3);
  });

  it("snapshot dimensions are re-derived from authoritative sources after rollover", async () => {
    const now = new Date();
    const periodStart = new Date(now.getTime() - 120 * DAY);
    const periodEnd = new Date(now.getTime() - 90 * DAY);
    const tenantId = new Types.ObjectId().toString();
    await createLocalFreeSub(tenantId, periodStart, periodEnd);

    const actorId = new Types.ObjectId();
    await UserModel.create({
      _id: actorId, tenantId: new Types.ObjectId(tenantId), name: "Admin", email: "a@example.test",
      passwordHash: "hash", role: "COMPANY_ADMIN", status: "active", emailVerified: true,
    });
    await UserModel.create({
      tenantId: new Types.ObjectId(tenantId), name: "E1", email: "e1@example.test",
      passwordHash: "hash", role: "EMPLOYEE", status: "active", emailVerified: true,
    });
    await UserModel.create({
      tenantId: new Types.ObjectId(tenantId), name: "E2", email: "e2@example.test",
      passwordHash: "hash", role: "EMPLOYEE", status: "active", emailVerified: true,
    });
    await UserModel.create({
      tenantId: new Types.ObjectId(tenantId), name: "Disabled", email: "d@example.test",
      passwordHash: "hash", role: "EMPLOYEE", status: "disabled", emailVerified: true,
    });
    for (let i = 0; i < 2; i += 1) {
      await DocumentModel.create({
        tenantId: new Types.ObjectId(tenantId), fileName: `doc-${i}.pdf`, originalFileName: `doc-${i}.pdf`,
        fileSize: 1024 * 1024, mimeType: "application/pdf", storageKey: `key-${i}`, checksum: `sum-${i}`,
        status: "uploaded", metadata: { title: null, description: null, tags: [] },
        classification: "restricted", owner: actorId, uploadedBy: actorId,
      });
    }

    const reconciliation = new ReconciliationService(counter, provider);
    await reconciliation.reconcileAtLeast(tenantId, "employees");
    await reconciliation.reconcileAtLeast(tenantId, "admins");
    await reconciliation.reconcileAtLeast(tenantId, "documents");
    await reconciliation.reconcileAtLeast(tenantId, "storageMb");

    const expected = resolveCurrentLocalFreePeriod(periodStart, periodEnd, now);
    const newKey = keyFor(expected.periodStart);
    const usage = await counter.getAllUsage(tenantId, newKey);

    // Snapshot dimensions are preserved — re-derived from the authoritative
    // resources into the new period, not reset or copied from the old period.
    expect(usage.employees).toBe(2);
    expect(usage.admins).toBe(1);
    expect(usage.documents).toBe(2);
    expect(usage.storageMb).toBe(2);
  });
});

describe("paid → Free continuity is preserved", () => {
  let provider: MongoEntitlementProvider;

  beforeEach(() => {
    provider = new MongoEntitlementProvider();
  });

  it("cancellation does not reset the inherited period or its quota", async () => {
    const now = new Date();
    const periodStart = new Date(now.getTime() - 10 * DAY);
    const periodEnd = new Date(now.getTime() + 20 * DAY);
    const tenantId = new Types.ObjectId().toString();

    await SubscriptionModel.create({
      _id: new Types.ObjectId(),
      tenantId: new Types.ObjectId(tenantId),
      packageId: FREE_PKG_ID,
      packageVersion: 1,
      status: "CANCELED",
      paymentState: "paid",
      provider: "stripe",
      providerCustomerId: "cus_A",
      providerSubscriptionId: "sub_paid",
      periodStart,
      periodEnd,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      startedAt: periodStart,
    });

    await ensureFreeFallbackSubscription({
      tenantId,
      retainedPeriod: { periodStart, periodEnd },
      reason: "PROVIDER_SUBSCRIPTION_DELETED",
    });

    const counter = new MongoQuotaCounter();
    const oldKey = keyFor(periodStart);
    await counter.set(tenantId, "queriesPerMonth", oldKey, 30);

    const service = new EntitlementService(counter, provider);
    const range = await provider.getPeriodRange(tenantId);
    const usage = await service.getUsage(tenantId);

    // Inherited period is intact (not yet expired) → no rollover, same key.
    expect(range.periodStart.getTime()).toBe(periodStart.getTime());
    expect(range.periodEnd!.getTime()).toBe(periodEnd.getTime());
    expect(usage.queriesPerMonth).toBe(30);

    const freeSub = await SubscriptionModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      packageId: FREE_PKG_ID,
      status: "ACTIVE",
    }).lean().exec();
    expect(freeSub).not.toBeNull();
    expect(freeSub!.periodStart!.getTime()).toBe(periodStart.getTime());
    expect(freeSub!.periodEnd!.getTime()).toBe(periodEnd.getTime());
  });

  it("the Free period advances only once the retained period expires", async () => {
    const now = new Date();
    const periodStart = new Date(now.getTime() - 20 * DAY);
    const periodEnd = new Date(now.getTime() - 5 * DAY);
    const tenantId = new Types.ObjectId().toString();

    await SubscriptionModel.create({
      _id: new Types.ObjectId(),
      tenantId: new Types.ObjectId(tenantId),
      packageId: FREE_PKG_ID,
      packageVersion: 1,
      status: "CANCELED",
      paymentState: "paid",
      provider: "stripe",
      providerCustomerId: "cus_A",
      providerSubscriptionId: "sub_paid",
      periodStart,
      periodEnd,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      startedAt: periodStart,
    });

    await ensureFreeFallbackSubscription({
      tenantId,
      retainedPeriod: { periodStart, periodEnd },
      reason: "PROVIDER_SUBSCRIPTION_DELETED",
    });

    const expected = resolveCurrentLocalFreePeriod(periodStart, periodEnd, now);
    const range = await provider.getPeriodRange(tenantId);

    // Advance starts at the retained periodEnd — usage before that boundary
    // is never charged a fresh quota period.
    expect(range.periodStart.getTime()).toBe(periodEnd.getTime());
    expect(range.periodEnd!.getTime()).toBe(expected.periodEnd!.getTime());
    expect(range.periodEnd!.getTime()).toBeGreaterThan(now.getTime());
  });
});

describe("refund → Free rollover", () => {
  it("uses the same local-Free mechanism and preserves the Stripe customer id", async () => {
    const now = new Date();
    const periodStart = new Date(now.getTime() - 20 * DAY);
    const periodEnd = new Date(now.getTime() - 5 * DAY);
    const tenantId = new Types.ObjectId().toString();

    // Shape exactly as voluntary-cancellation-transition creates it: local
    // provider, preserved providerCustomerId, inherited (expired) period.
    await createLocalFreeSub(tenantId, periodStart, periodEnd, {
      providerCustomerId: "cus_A",
    });

    const provider = new MongoEntitlementProvider();
    const expected = resolveCurrentLocalFreePeriod(periodStart, periodEnd, now);
    const range = await provider.getPeriodRange(tenantId);

    expect(range.periodStart.getTime()).toBe(expected.periodStart.getTime());
    expect(range.periodStart.getTime()).toBe(periodEnd.getTime());
    expect(range.periodEnd!.getTime()).toBeGreaterThan(now.getTime());

    const stored = await SubscriptionModel.findOne({ tenantId: new Types.ObjectId(tenantId) }).lean().exec();
    expect(stored!.providerCustomerId).toBe("cus_A");
    expect(stored!.provider).toBe("local");
    expect(stored!.providerSubscriptionId).toBe("");
  });
});