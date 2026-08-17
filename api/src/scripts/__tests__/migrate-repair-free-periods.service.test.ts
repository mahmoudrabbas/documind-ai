import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/index.js", () => ({ config: { NODE_ENV: "test", BILLING_PAST_DUE_GRACE_DAYS: 7 } }));
import { setAuditWriter, setMetricRecorder } from "../../common/observability/index.js";
import PackageModel from "../../db/models/package.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";
import UsageLogModel from "../../db/models/usageLog.model.js";
import OcrUsageRecordModel from "../../db/models/ocrUsageRecord.model.js";
import { QuotaCounterModel } from "../../modules/entitlement/adapters/mongo-quota-counter.js";
import { MongoQuotaCounter } from "../../modules/entitlement/adapters/mongo-quota-counter.js";
import { MongoEntitlementProvider } from "../../modules/entitlement/adapters/mongo-entitlement-provider.js";
import {
  addCalendarMonths,
  computeLocalFreePeriod,
  resolveCurrentLocalFreePeriod,
} from "../../modules/billing/free-fallback.service.js";
import { toCompanyBillingSummary } from "../../modules/billing/company-billing-summary.js";
import {
  repairLegacyFreePeriods,
  resolvePaidLineage,
} from "../migrate-repair-free-periods.service.js";

let mongo: MongoMemoryReplSet | null = null;

const DAY = 24 * 60 * 60 * 1000;
const FIXED_NOW = new Date("2026-08-16T12:00:00.000Z");

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

function packageRecord(id: Types.ObjectId, code: string, price: number) {
  return {
    _id: id,
    name: code === "free" ? "Free" : "Paid",
    code,
    description: "Migration test package",
    active: true,
    version: 1,
    monthlyPrice: price,
    annualPrice: price * 10,
    currency: "USD",
    entitlements: FREE_ENTITLEMENTS,
    trialDays: 0,
    visibility: "public",
    supportedModels: ["basic"],
    analyticsLevel: "basic",
    retentionDays: 90,
    supportLevel: "community",
    stripeProductId: "",
    stripePriceId: "",
    stripeAnnualPriceId: "",
    versions: [
      {
        version: 1,
        name: code,
        code,
        monthlyPrice: price,
        annualPrice: price * 10,
        currency: "USD",
        entitlements: FREE_ENTITLEMENTS,
        trialDays: 0,
        visibility: "public",
        supportedModels: ["basic"],
        analyticsLevel: "basic",
        retentionDays: 90,
        supportLevel: "community",
        stripeProductId: "",
        stripePriceId: "",
        stripeAnnualPriceId: "",
        createdAt: new Date(),
      },
    ],
  };
}

function keyFor(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

async function seedCanonicalFreePackage(): Promise<Types.ObjectId> {
  const freePackageId = new Types.ObjectId();
  await PackageModel.insertMany([packageRecord(freePackageId, "free", 0)]);
  return freePackageId;
}

async function seedPaidPackage(): Promise<Types.ObjectId> {
  const paidPackageId = new Types.ObjectId();
  await PackageModel.insertMany([packageRecord(paidPackageId, "synthetic-paid", 1000)]);
  return paidPackageId;
}

async function createSubscription(
  tenantId: string,
  packageId: Types.ObjectId,
  overrides: Record<string, unknown> = {},
) {
  return SubscriptionModel.create({
    tenantId: new Types.ObjectId(tenantId),
    packageId,
    packageVersion: 1,
    status: "ACTIVE",
    paymentState: "paid",
    provider: "local",
    providerCustomerId: "",
    providerSubscriptionId: "",
    providerPriceId: "",
    billingInterval: "monthly",
    startedAt: new Date(),
    cancelAtPeriodEnd: false,
    providerMetadata: {},
    ...overrides,
  });
}

function legacyFreeSubscription(tenantId: string, packageId: Types.ObjectId, overrides: Record<string, unknown> = {}) {
  return createSubscription(tenantId, packageId, {
    periodStart: null,
    periodEnd: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    ...overrides,
  });
}

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    instanceOpts: [{ launchTimeout: 60_000 }],
    replSet: { count: 1, storageEngine: "wiredTiger", ip: "127.0.0.1" },
  });
  await mongoose.connect(mongo.getUri(), { dbName: `repair-free-periods-${Date.now()}` });
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
    UsageLogModel.deleteMany({}),
    OcrUsageRecordModel.deleteMany({}),
  ]);
  await Promise.all([PackageModel.syncIndexes(), SubscriptionModel.syncIndexes()]);
});

describe("repairLegacyFreePeriods", () => {
  it("repairs a legacy Free subscription with all period fields null", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const tenantId = new Types.ObjectId().toString();
    await legacyFreeSubscription(tenantId, freePackageId);

    const report = await repairLegacyFreePeriods({ apply: true, now: FIXED_NOW });

    expect(report.mode).toBe("apply");
    expect(report.examined).toBe(1);
    expect(report.eligible).toBe(1);
    expect(report.wouldRepair).toBe(0);
    expect(report.repaired).toBe(1);
    expect(report.repairedIds).toHaveLength(1);
    expect(report.alreadyCorrect).toBe(0);

    const stored = await SubscriptionModel.findOne({ tenantId: new Types.ObjectId(tenantId) }).lean().exec();
    const expected = computeLocalFreePeriod(FIXED_NOW);
    expect(stored!.periodStart!.getTime()).toBe(expected.periodStart.getTime());
    expect(stored!.periodEnd!.getTime()).toBe(expected.periodEnd.getTime());
    expect(stored!.currentPeriodStart!.getTime()).toBe(expected.periodStart.getTime());
    expect(stored!.currentPeriodEnd!.getTime()).toBe(expected.periodEnd.getTime());
    // The period end is in the future relative to the migration anchor.
    expect(expected.periodEnd.getTime()).toBeGreaterThan(FIXED_NOW.getTime());
  });

  it("keeps existing current-month usage visible after repair", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const tenantId = new Types.ObjectId().toString();
    await legacyFreeSubscription(tenantId, freePackageId);

    const currentKey = keyFor(FIXED_NOW);
    const counter = new MongoQuotaCounter();
    await counter.set(tenantId, "queriesPerMonth", currentKey, 30);
    await counter.set(tenantId, "tokensPerMonth", currentKey, 5000);
    await counter.set(tenantId, "ocrPagesPerMonth", currentKey, 3);

    await repairLegacyFreePeriods({ apply: true, now: FIXED_NOW });

    const provider = new MongoEntitlementProvider();
    const range = await provider.getPeriodRange(tenantId);
    const repairedKey = keyFor(range.periodStart);

    expect(repairedKey).toBe(currentKey);
    const usage = await counter.getAllUsage(tenantId, repairedKey);
    expect(usage.queriesPerMonth).toBe(30);
    expect(usage.tokensPerMonth).toBe(5000);
    expect(usage.ocrPagesPerMonth).toBe(3);
  });

  it("does not grant a fresh current-month quota and never touches counter rows", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const tenantId = new Types.ObjectId().toString();
    await legacyFreeSubscription(tenantId, freePackageId);

    const currentKey = keyFor(FIXED_NOW);
    const counter = new MongoQuotaCounter();
    await counter.set(tenantId, "queriesPerMonth", currentKey, 30);
    await counter.set(tenantId, "tokensPerMonth", currentKey, 5000);
    await counter.set(tenantId, "ocrPagesPerMonth", currentKey, 3);

    await repairLegacyFreePeriods({ apply: true, now: FIXED_NOW });

    // The repaired periodStart stays inside the current month, so the active
    // bucket is unchanged — the existing consumed quota is still observed.
    const provider = new MongoEntitlementProvider();
    const range = await provider.getPeriodRange(tenantId);
    expect(keyFor(range.periodStart)).toBe("2026-08");

    const rows = await QuotaCounterModel.find({ tenantId: new Types.ObjectId(tenantId) }).lean().exec();
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.periodStart)).toEqual([currentKey, currentKey, currentKey]);
    expect(rows.map((row) => row.value).sort()).toEqual([3, 30, 5000]);
  });

  it("is idempotent — a second run reports nothing to repair", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const tenantId = new Types.ObjectId().toString();
    await legacyFreeSubscription(tenantId, freePackageId);

    const first = await repairLegacyFreePeriods({ apply: true, now: FIXED_NOW });
    const second = await repairLegacyFreePeriods({ apply: true, now: FIXED_NOW });

    expect(first.repaired).toBe(1);
    expect(second.repaired).toBe(0);
    expect(second.eligible).toBe(0);
    expect(second.alreadyCorrect).toBe(1);

    const stored = await SubscriptionModel.findOne({ tenantId: new Types.ObjectId(tenantId) }).lean().exec();
    expect(stored!.periodStart!.getTime()).toBe(computeLocalFreePeriod(FIXED_NOW).periodStart.getTime());
  });

  it("concurrent repair cannot produce conflicting periods", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const tenantId = new Types.ObjectId().toString();
    await legacyFreeSubscription(tenantId, freePackageId);

    const nowA = FIXED_NOW;
    const nowB = new Date(FIXED_NOW.getTime() + 1);
    const [reportA, reportB] = await Promise.all([
      repairLegacyFreePeriods({ apply: true, now: nowA }),
      repairLegacyFreePeriods({ apply: true, now: nowB }),
    ]);

    expect(reportA.repaired + reportB.repaired).toBe(1);
    expect(reportA.repaired + reportA.skippedConcurrentChange).toBe(1);
    expect(reportB.repaired + reportB.skippedConcurrentChange).toBe(1);

    const stored = await SubscriptionModel.findOne({ tenantId: new Types.ObjectId(tenantId) }).lean().exec();
    const winners = [computeLocalFreePeriod(nowA), computeLocalFreePeriod(nowB)];
    const wonBy = winners.find(
      (candidate) => candidate.periodStart.getTime() === stored!.periodStart!.getTime(),
    );
    expect(wonBy).toBeDefined();
    // The stored record is a single consistent period (never a mixed write).
    expect(stored!.periodEnd!.getTime()).toBe(wonBy!.periodEnd.getTime());
    expect(stored!.currentPeriodStart!.getTime()).toBe(wonBy!.periodStart.getTime());
    expect(stored!.currentPeriodEnd!.getTime()).toBe(wonBy!.periodEnd.getTime());
  });

  it("does not repair a paid/provider-backed package with null periods", async () => {
    await seedCanonicalFreePackage();
    const paidPackageId = await seedPaidPackage();
    const tenantId = new Types.ObjectId().toString();
    await createSubscription(tenantId, paidPackageId, {
      provider: "stripe",
      providerCustomerId: "cus_A",
      providerSubscriptionId: "sub_paid",
      periodStart: null,
      periodEnd: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });

    const report = await repairLegacyFreePeriods({ apply: true, now: FIXED_NOW });

    expect(report.repaired).toBe(0);
    expect(report.eligible).toBe(0);
    expect(report.skippedNonFree).toBe(1);

    const stored = await SubscriptionModel.findOne({ tenantId: new Types.ObjectId(tenantId) }).lean().exec();
    expect(stored!.periodStart).toBeNull();
    expect(stored!.periodEnd).toBeNull();
  });

  it("does not mistake a pending paid checkout (empty providerSubscriptionId) for Free", async () => {
    await seedCanonicalFreePackage();
    const paidPackageId = await seedPaidPackage();
    const tenantId = new Types.ObjectId().toString();
    await createSubscription(tenantId, paidPackageId, {
      provider: "stripe",
      providerCustomerId: "cus_A",
      providerSubscriptionId: "",
      periodStart: null,
      periodEnd: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });

    const report = await repairLegacyFreePeriods({ apply: true, now: FIXED_NOW });

    // Identity is established by PACKAGE identity, not providerSubscriptionId.
    expect(report.repaired).toBe(0);
    expect(report.skippedNonFree).toBe(1);

    const stored = await SubscriptionModel.findOne({ tenantId: new Types.ObjectId(tenantId) }).lean().exec();
    expect(stored!.periodStart).toBeNull();
    expect(stored!.periodEnd).toBeNull();
  });

  it("leaves already-correct Free subscriptions untouched", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const tenantId = new Types.ObjectId().toString();
    const expected = computeLocalFreePeriod(new Date(FIXED_NOW.getTime() - 10 * DAY));
    await createSubscription(tenantId, freePackageId, {
      provider: "local",
      periodStart: expected.periodStart,
      periodEnd: expected.periodEnd,
      currentPeriodStart: expected.periodStart,
      currentPeriodEnd: expected.periodEnd,
    });

    const report = await repairLegacyFreePeriods({ apply: true, now: FIXED_NOW });

    expect(report.repaired).toBe(0);
    expect(report.alreadyCorrect).toBe(1);

    const stored = await SubscriptionModel.findOne({ tenantId: new Types.ObjectId(tenantId) }).lean().exec();
    expect(stored!.periodStart!.getTime()).toBe(expected.periodStart.getTime());
    expect(stored!.periodEnd!.getTime()).toBe(expected.periodEnd.getTime());
  });

  it("repaired legacy Free subscriptions roll over normally at periodEnd", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const tenantId = new Types.ObjectId().toString();
    await legacyFreeSubscription(tenantId, freePackageId);

    // Repair anchored ~40 days ago → periodStart past, periodEnd ≈ now - 10d.
    const expiredNow = new Date(new Date().getTime() - 40 * DAY);
    await repairLegacyFreePeriods({ apply: true, now: expiredNow });

    const provider = new MongoEntitlementProvider();
    const range = await provider.getPeriodRange(tenantId);

    // The central rollover path advances the repaired record into the current
    // cycle, anchored at the repaired periodEnd.
    expect(range.periodStart.getTime()).toBe(computeLocalFreePeriod(expiredNow).periodEnd.getTime());
    expect(range.periodEnd!.getTime()).toBeGreaterThan(new Date().getTime());

    const stored = await SubscriptionModel.findOne({ tenantId: new Types.ObjectId(tenantId) }).lean().exec();
    expect(stored!.periodStart!.getTime()).toBe(range.periodStart.getTime());
    expect(stored!.periodEnd!.getTime()).toBe(range.periodEnd!.getTime());
  });

  it("preserves historical quota-counter rows after repair", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const tenantId = new Types.ObjectId().toString();
    await legacyFreeSubscription(tenantId, freePackageId);

    const counter = new MongoQuotaCounter();
    const oldKey = keyFor(new Date(FIXED_NOW.getTime() - 60 * DAY));
    const currentKey = keyFor(FIXED_NOW);
    await counter.set(tenantId, "queriesPerMonth", oldKey, 99);
    await counter.set(tenantId, "queriesPerMonth", currentKey, 5);
    await counter.set(tenantId, "tokensPerMonth", currentKey, 500);

    await repairLegacyFreePeriods({ apply: true, now: FIXED_NOW });

    const rows = await QuotaCounterModel.find({ tenantId: new Types.ObjectId(tenantId) }).lean().exec();
    expect(rows).toHaveLength(3);
    expect(await counter.getUsage(tenantId, "queriesPerMonth", oldKey)).toBe(99);
    expect(await counter.getUsage(tenantId, "queriesPerMonth", currentKey)).toBe(5);
    expect(await counter.getUsage(tenantId, "tokensPerMonth", currentKey)).toBe(500);
  });

  it("dry-run mode reports without mutating anything", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const tenantId = new Types.ObjectId().toString();
    await legacyFreeSubscription(tenantId, freePackageId);

    const report = await repairLegacyFreePeriods({ now: FIXED_NOW });

    expect(report.mode).toBe("dry-run");
    expect(report.eligible).toBe(1);
    expect(report.wouldRepair).toBe(1);
    expect(report.repaired).toBe(0);

    const stored = await SubscriptionModel.findOne({ tenantId: new Types.ObjectId(tenantId) }).lean().exec();
    expect(stored!.periodStart).toBeNull();
    expect(stored!.periodEnd).toBeNull();
  });

  it("honours tenant-scoped filtering", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const tenantA = new Types.ObjectId().toString();
    const tenantB = new Types.ObjectId().toString();
    await legacyFreeSubscription(tenantA, freePackageId);
    await legacyFreeSubscription(tenantB, freePackageId);

    const report = await repairLegacyFreePeriods({
      apply: true,
      tenantId: tenantA,
      now: FIXED_NOW,
    });

    expect(report.tenantFiltered).toBe(true);
    expect(report.examined).toBe(1);
    expect(report.repaired).toBe(1);

    const storedA = await SubscriptionModel.findOne({ tenantId: new Types.ObjectId(tenantA) }).lean().exec();
    const storedB = await SubscriptionModel.findOne({ tenantId: new Types.ObjectId(tenantB) }).lean().exec();
    expect(storedA!.periodEnd).not.toBeNull();
    expect(storedB!.periodStart).toBeNull();
    expect(storedB!.periodEnd).toBeNull();
  });

  it("fails closed when the canonical Free package is missing", async () => {
    await expect(repairLegacyFreePeriods({ apply: true, now: FIXED_NOW })).rejects.toMatchObject({
      name: "RepairLegacyFreePeriodsError",
      code: "CANONICAL_FREE_PACKAGE_NOT_FOUND",
    });
  });

  it("repairs a canonical Free subscription with periodStart present and periodEnd null, preserving periodStart", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const tenantId = new Types.ObjectId().toString();
    const legacyStart = new Date("2026-08-11T04:38:40.718Z");
    await createSubscription(tenantId, freePackageId, {
      provider: "local",
      periodStart: legacyStart,
      periodEnd: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });

    const report = await repairLegacyFreePeriods({ apply: true, now: FIXED_NOW });

    expect(report.eligible).toBe(1);
    expect(report.repaired).toBe(1);
    expect(report.wouldRepair).toBe(0);
    expect(report.skippedPartialPeriod).toBe(0);

    const stored = await SubscriptionModel.findOne({ tenantId: new Types.ObjectId(tenantId) }).lean().exec();
    const expectedEnd = addCalendarMonths(legacyStart, 1);
    // periodStart is preserved exactly; periodEnd is one calendar month later.
    expect(stored!.periodStart!.getTime()).toBe(legacyStart.getTime());
    expect(stored!.periodEnd!.getTime()).toBe(expectedEnd.getTime());
    expect(expectedEnd.getTime()).toBe(new Date("2026-09-11T04:38:40.718Z").getTime());
    // currentPeriod* are synchronized to the repaired boundaries.
    expect(stored!.currentPeriodStart!.getTime()).toBe(legacyStart.getTime());
    expect(stored!.currentPeriodEnd!.getTime()).toBe(expectedEnd.getTime());
  });

  it("keeps existing current YYYY-MM quota counters visible for start-set/end-null repairs", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const tenantId = new Types.ObjectId().toString();
    const legacyStart = new Date("2026-08-11T04:38:40.718Z");
    await createSubscription(tenantId, freePackageId, {
      provider: "local",
      periodStart: legacyStart,
      periodEnd: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });

    const currentKey = keyFor(legacyStart);
    const counter = new MongoQuotaCounter();
    await counter.set(tenantId, "queriesPerMonth", currentKey, 30);
    await counter.set(tenantId, "tokensPerMonth", currentKey, 5000);
    await counter.set(tenantId, "ocrPagesPerMonth", currentKey, 3);

    await repairLegacyFreePeriods({ apply: true, now: FIXED_NOW });

    const provider = new MongoEntitlementProvider();
    const range = await provider.getPeriodRange(tenantId);
    const repairedKey = keyFor(range.periodStart);

    // periodStart is preserved → the 2026-08 bucket stays active and observed.
    expect(repairedKey).toBe(currentKey);
    const usage = await counter.getAllUsage(tenantId, repairedKey);
    expect(usage.queriesPerMonth).toBe(30);
    expect(usage.tokensPerMonth).toBe(5000);
    expect(usage.ocrPagesPerMonth).toBe(3);
    expect(
      await QuotaCounterModel.countDocuments({ tenantId: new Types.ObjectId(tenantId) }),
    ).toBe(3);
  });

  it("is idempotent for start-set/end-null records", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const tenantId = new Types.ObjectId().toString();
    const legacyStart = new Date("2026-08-11T04:38:40.718Z");
    await createSubscription(tenantId, freePackageId, {
      provider: "local",
      periodStart: legacyStart,
      periodEnd: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });

    const first = await repairLegacyFreePeriods({ apply: true, now: FIXED_NOW });
    const second = await repairLegacyFreePeriods({ apply: true, now: FIXED_NOW });

    expect(first.repaired).toBe(1);
    expect(second.repaired).toBe(0);
    expect(second.eligible).toBe(0);
    expect(second.alreadyCorrect).toBe(1);

    const stored = await SubscriptionModel.findOne({ tenantId: new Types.ObjectId(tenantId) }).lean().exec();
    expect(stored!.periodStart!.getTime()).toBe(legacyStart.getTime());
    expect(stored!.periodEnd!.getTime()).toBe(addCalendarMonths(legacyStart, 1).getTime());
  });

  it("concurrent repair of start-set/end-null records cannot produce conflicting boundaries", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const tenantId = new Types.ObjectId().toString();
    const legacyStart = new Date("2026-08-11T04:38:40.718Z");
    await createSubscription(tenantId, freePackageId, {
      provider: "local",
      periodStart: legacyStart,
      periodEnd: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });

    const [reportA, reportB] = await Promise.all([
      repairLegacyFreePeriods({ apply: true, now: new Date(FIXED_NOW.getTime() + 1) }),
      repairLegacyFreePeriods({ apply: true, now: FIXED_NOW }),
    ]);

    // The target is fully deterministic (it depends only on periodStart), so
    // exactly one writer persists it and the other counts a lost race.
    expect(reportA.repaired + reportB.repaired).toBe(1);
    expect(reportA.repaired + reportA.skippedConcurrentChange).toBe(1);
    expect(reportB.repaired + reportB.skippedConcurrentChange).toBe(1);

    const stored = await SubscriptionModel.findOne({ tenantId: new Types.ObjectId(tenantId) }).lean().exec();
    expect(stored!.periodStart!.getTime()).toBe(legacyStart.getTime());
    expect(stored!.periodEnd!.getTime()).toBe(addCalendarMonths(legacyStart, 1).getTime());
    expect(stored!.currentPeriodStart!.getTime()).toBe(legacyStart.getTime());
    expect(stored!.currentPeriodEnd!.getTime()).toBe(addCalendarMonths(legacyStart, 1).getTime());
  });

  it("does not repair paid/non-Free partial-period subscriptions", async () => {
    await seedCanonicalFreePackage();
    const paidPackageId = await seedPaidPackage();
    const tenantId = new Types.ObjectId().toString();
    await createSubscription(tenantId, paidPackageId, {
      provider: "stripe",
      providerSubscriptionId: "",
      periodStart: new Date("2026-08-11T04:38:40.718Z"),
      periodEnd: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });

    const report = await repairLegacyFreePeriods({ apply: true, now: FIXED_NOW });

    expect(report.repaired).toBe(0);
    expect(report.eligible).toBe(0);
    expect(report.skippedNonFree).toBe(1);

    const stored = await SubscriptionModel.findOne({ tenantId: new Types.ObjectId(tenantId) }).lean().exec();
    expect(stored!.periodStart!.getTime()).toBe(new Date("2026-08-11T04:38:40.718Z").getTime());
    expect(stored!.periodEnd).toBeNull();
  });

  it("keeps periodStart null + periodEnd present safely skipped (no invented start)", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const tenantId = new Types.ObjectId().toString();
    await createSubscription(tenantId, freePackageId, {
      provider: "local",
      periodStart: null,
      periodEnd: new Date("2026-09-11T00:00:00.000Z"),
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });

    const report = await repairLegacyFreePeriods({ apply: true, now: FIXED_NOW });

    expect(report.repaired).toBe(0);
    expect(report.eligible).toBe(0);
    expect(report.skippedPartialPeriod).toBe(1);

    const stored = await SubscriptionModel.findOne({ tenantId: new Types.ObjectId(tenantId) }).lean().exec();
    expect(stored!.periodStart).toBeNull();
    expect(stored!.periodEnd!.getTime()).toBe(new Date("2026-09-11T00:00:00.000Z").getTime());
  });
});

async function seedPaidPredecessor(
  tenantId: string,
  paidPackageId: Types.ObjectId,
  periodStart: Date,
  periodEnd: Date,
  overrides: Record<string, unknown> = {},
) {
  return createSubscription(tenantId, paidPackageId, {
    provider: "stripe",
    providerCustomerId: "cus_paid_A",
    providerSubscriptionId: "sub_paid_1",
    providerPriceId: "price_paid_1",
    billingInterval: "monthly",
    status: "CANCELED",
    periodStart,
    periodEnd,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    ...overrides,
  });
}

async function seedAuthoritativeUsage(
  tenantId: string,
  periodStart: Date,
  periodEnd: Date,
  queries: number,
  ocrPages: number,
) {
  const docId = new Types.ObjectId();
  const rows = Array.from({ length: queries }, () => ({
    tenantId: new Types.ObjectId(tenantId),
    eventType: "QUESTION_ASKED" as const,
  }));
  await UsageLogModel.insertMany(rows);
  const ocrRows = Array.from({ length: ocrPages }, (_, index) => ({
    tenantId: new Types.ObjectId(tenantId),
    documentId: docId,
    documentVersion: 1,
    pageNumber: index + 1,
    provider: "tesseract",
    providerModel: "tesseract",
    language: "en" as const,
    pagesProcessed: 1,
    durationMs: 100,
    costUsd: 0,
  }));
  await OcrUsageRecordModel.insertMany(ocrRows);
}

describe("repairLegacyFreePeriods — paid lineage (Bug 1) and provider normalization (Bug 2)", () => {
  it("restores the EXACT outgoing paid period for a Paid → all-null Free transition, even when the migration runs a day later", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const paidPackageId = await seedPaidPackage();
    const tenantId = new Types.ObjectId().toString();
    const now = new Date();
    const paidStart = new Date(now.getTime() - DAY);
    const paidEnd = new Date(now.getTime() + 30 * DAY);

    await seedPaidPredecessor(tenantId, paidPackageId, paidStart, paidEnd);
    await legacyFreeSubscription(tenantId, freePackageId, {
      provider: "stripe",
      providerSubscriptionId: "",
    });

    // Migration executes one day later — must NOT shift the retained period.
    const report = await repairLegacyFreePeriods({
      apply: true,
      now: new Date(now.getTime() + DAY),
    });

    expect(report.repaired).toBe(1);
    expect(report.repairedFromPaidPeriod).toBe(1);
    expect(report.repairedLocalFree).toBe(0);
    expect(report.normalizedProvider).toBe(1);

    const stored = await SubscriptionModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      packageId: freePackageId,
    }).lean().exec();
    expect(stored!.periodStart!.getTime()).toBe(paidStart.getTime());
    expect(stored!.periodEnd!.getTime()).toBe(paidEnd.getTime());
    expect(stored!.currentPeriodStart!.getTime()).toBe(paidStart.getTime());
    expect(stored!.currentPeriodEnd!.getTime()).toBe(paidEnd.getTime());
    expect(stored!.provider).toBe("local");
    expect(stored!.providerSubscriptionId).toBe("");
    expect(stored!.billingInterval).toBe("monthly");
  });

  it("does NOT inherit an unrelated historical subscription for a native Free with no paid lineage", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const paidPackageId = await seedPaidPackage();
    const tenantId = new Types.ObjectId().toString();
    const now = new Date();
    const oldStart = new Date(now.getTime() - 200 * DAY);
    const oldEnd = new Date(now.getTime() - 170 * DAY);
    await seedPaidPredecessor(tenantId, paidPackageId, oldStart, oldEnd, {
      providerSubscriptionId: "sub_old",
    });
    await legacyFreeSubscription(tenantId, freePackageId);

    const nowAnchor = new Date("2026-08-16T12:00:00.000Z");
    const report = await repairLegacyFreePeriods({ apply: true, now: nowAnchor });

    expect(report.repaired).toBe(1);
    expect(report.repairedFromPaidPeriod).toBe(0);
    expect(report.repairedLocalFree).toBe(1);

    const stored = await SubscriptionModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      packageId: freePackageId,
    }).lean().exec();
    const expected = computeLocalFreePeriod(nowAnchor);
    expect(stored!.periodStart!.getTime()).toBe(expected.periodStart.getTime());
    expect(stored!.periodEnd!.getTime()).toBe(expected.periodEnd.getTime());
  });

  it("skips and reports ambiguous predecessor lineage (no guessing)", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const paidPackageId = await seedPaidPackage();
    const tenantId = new Types.ObjectId().toString();
    const now = new Date();
    await seedPaidPredecessor(
      tenantId, paidPackageId,
      new Date(now.getTime() - 2 * DAY),
      new Date(now.getTime() + 31 * DAY),
      { providerSubscriptionId: "sub_overlap_A" },
    );
    await seedPaidPredecessor(
      tenantId, paidPackageId,
      new Date(now.getTime() - DAY),
      new Date(now.getTime() + 30 * DAY),
      { providerSubscriptionId: "sub_overlap_B" },
    );
    await legacyFreeSubscription(tenantId, freePackageId);

    const report = await repairLegacyFreePeriods({ apply: true, now: FIXED_NOW });

    expect(report.skippedAmbiguousLineage).toBe(1);
    expect(report.repaired).toBe(0);

    const stored = await SubscriptionModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      packageId: freePackageId,
    }).lean().exec();
    expect(stored!.periodStart).toBeNull();
    expect(stored!.periodEnd).toBeNull();
  });

  it("does NOT overwrite a start-only legacy Free with paid predecessor recovery", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const paidPackageId = await seedPaidPackage();
    const tenantId = new Types.ObjectId().toString();
    const now = new Date();
    const paidStart = new Date(now.getTime() - DAY);
    const paidEnd = new Date(now.getTime() + 30 * DAY);
    await seedPaidPredecessor(tenantId, paidPackageId, paidStart, paidEnd);

    const originalStart = new Date("2026-08-11T04:38:40.718Z");
    await createSubscription(tenantId, freePackageId, {
      provider: "local",
      periodStart: originalStart,
      periodEnd: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });

    const report = await repairLegacyFreePeriods({ apply: true, now: FIXED_NOW });

    expect(report.repairedStartOnly).toBe(1);
    expect(report.repairedFromPaidPeriod).toBe(0);

    const stored = await SubscriptionModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      packageId: freePackageId,
    }).lean().exec();
    expect(stored!.periodStart!.getTime()).toBe(originalStart.getTime());
    expect(stored!.periodEnd!.getTime()).toBe(addCalendarMonths(originalStart, 1).getTime());
  });

  it("corrects an already-repaired all-null record from deterministic paid lineage only in include-repaired mode", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const paidPackageId = await seedPaidPackage();
    const tenantId = new Types.ObjectId().toString();
    const now = new Date();
    const paidStart = new Date(now.getTime() - DAY);
    const paidEnd = new Date(now.getTime() + 30 * DAY);
    await seedPaidPredecessor(tenantId, paidPackageId, paidStart, paidEnd);

    const repairedStart = new Date(now.getTime() + DAY);
    const repairedEnd = addCalendarMonths(repairedStart, 1);
    await createSubscription(tenantId, freePackageId, {
      provider: "stripe",
      providerSubscriptionId: "",
      providerPriceId: "price_old",
      billingInterval: null,
      periodStart: repairedStart,
      periodEnd: repairedEnd,
      currentPeriodStart: repairedStart,
      currentPeriodEnd: repairedEnd,
    });

    const plain = await repairLegacyFreePeriods({ apply: true, now: FIXED_NOW });
    expect(plain.repaired).toBe(0);
    expect(plain.alreadyCorrect).toBe(1);

    const report = await repairLegacyFreePeriods({
      apply: true,
      now: FIXED_NOW,
      includeRepaired: true,
    });
    expect(report.repaired).toBe(1);
    expect(report.repairedFromPaidPeriod).toBe(1);
    expect(report.normalizedProvider).toBe(1);

    const stored = await SubscriptionModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      packageId: freePackageId,
    }).lean().exec();
    expect(stored!.periodStart!.getTime()).toBe(paidStart.getTime());
    expect(stored!.periodEnd!.getTime()).toBe(paidEnd.getTime());
    expect(stored!.currentPeriodStart!.getTime()).toBe(paidStart.getTime());
    expect(stored!.currentPeriodEnd!.getTime()).toBe(paidEnd.getTime());
    expect(stored!.provider).toBe("local");
    expect(stored!.providerSubscriptionId).toBe("");
    expect(stored!.providerPriceId).toBe("");
    expect(stored!.billingInterval).toBe("monthly");
  });

  it("preserves providerCustomerId while normalizing provider to local", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const tenantId = new Types.ObjectId().toString();
    await legacyFreeSubscription(tenantId, freePackageId, {
      provider: "stripe",
      providerSubscriptionId: "",
      providerCustomerId: "cus_keep_me",
    });

    const report = await repairLegacyFreePeriods({ apply: true, now: FIXED_NOW });

    expect(report.repaired).toBe(1);
    expect(report.normalizedProvider).toBe(1);

    const stored = await SubscriptionModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      packageId: freePackageId,
    }).lean().exec();
    expect(stored!.provider).toBe("local");
    expect(stored!.providerSubscriptionId).toBe("");
    expect(stored!.providerCustomerId).toBe("cus_keep_me");
  });

  it("backfills providerCustomerId from a deterministic paid predecessor when empty", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const paidPackageId = await seedPaidPackage();
    const tenantId = new Types.ObjectId().toString();
    const now = new Date();
    const paidStart = new Date(now.getTime() - DAY);
    const paidEnd = new Date(now.getTime() + 30 * DAY);
    await seedPaidPredecessor(tenantId, paidPackageId, paidStart, paidEnd, {
      providerCustomerId: "cus_predecessor",
    });
    await legacyFreeSubscription(tenantId, freePackageId, {
      provider: "stripe",
      providerSubscriptionId: "",
      providerCustomerId: "",
    });

    const report = await repairLegacyFreePeriods({ apply: true, now: FIXED_NOW });

    expect(report.repaired).toBe(1);
    const stored = await SubscriptionModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      packageId: freePackageId,
    }).lean().exec();
    expect(stored!.providerCustomerId).toBe("cus_predecessor");
    expect(stored!.provider).toBe("local");
  });

  it("never normalizes a provider-linked Paid subscription as Free", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const tenantId = new Types.ObjectId().toString();
    const now = new Date();
    await createSubscription(tenantId, freePackageId, {
      provider: "stripe",
      providerCustomerId: "cus_paid",
      providerSubscriptionId: "sub_paid",
      providerPriceId: "price_paid",
      billingInterval: "monthly",
      periodStart: new Date(now.getTime() - DAY),
      periodEnd: new Date(now.getTime() + 30 * DAY),
      currentPeriodStart: new Date(now.getTime() - DAY),
      currentPeriodEnd: new Date(now.getTime() + 30 * DAY),
    });

    const report = await repairLegacyFreePeriods({ apply: true, now: FIXED_NOW });

    expect(report.skippedNonFree).toBe(1);
    expect(report.repaired).toBe(0);
    expect(report.normalizedProvider).toBe(0);

    const stored = await SubscriptionModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      packageId: freePackageId,
    }).lean().exec();
    expect(stored!.provider).toBe("stripe");
    expect(stored!.providerSubscriptionId).toBe("sub_paid");
  });

  it("normalizes a legacy Free with concrete periods but a missing provider to local, preserving the period", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const tenantId = new Types.ObjectId().toString();
    const periodStart = new Date("2026-08-11T04:38:40.718Z");
    const periodEnd = addCalendarMonths(periodStart, 1);
    // Raw insert WITHOUT the provider field — matches legacy records whose
    // provider field is entirely absent (neither "stripe" nor "local").
    await SubscriptionModel.collection.insertOne({
      tenantId: new Types.ObjectId(tenantId),
      packageId: freePackageId,
      packageVersion: 1,
      status: "ACTIVE",
      periodStart,
      periodEnd,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      providerSubscriptionId: "",
      providerCustomerId: "",
      providerPriceId: "",
      billingInterval: null,
      startedAt: periodStart,
      createdAt: periodStart,
    });

    const plain = await repairLegacyFreePeriods({ apply: true, now: FIXED_NOW });
    expect(plain.alreadyCorrect).toBe(1);
    expect(plain.repaired).toBe(0);

    const report = await repairLegacyFreePeriods({
      apply: true,
      now: FIXED_NOW,
      includeRepaired: true,
    });
    expect(report.repaired).toBe(1);
    expect(report.normalizedProvider).toBe(1);
    expect(report.repairedFromPaidPeriod).toBe(0);
    expect(report.repairedStartOnly).toBe(0);

    const stored = await SubscriptionModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
    }).lean().exec();
    expect(stored!.provider).toBe("local");
    expect(stored!.providerSubscriptionId).toBe("");
    // The retained start is preserved exactly — never overwritten.
    expect(stored!.periodStart!.getTime()).toBe(periodStart.getTime());
    expect(stored!.periodEnd!.getTime()).toBe(periodEnd.getTime());
  });

  it("keeps the corrected Free non-provider-linked (canOpenPortal/canUpdatePaymentMethod stay false)", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const paidPackageId = await seedPaidPackage();
    const tenantId = new Types.ObjectId().toString();
    const now = new Date();
    const paidStart = new Date(now.getTime() - DAY);
    const paidEnd = new Date(now.getTime() + 30 * DAY);
    await seedPaidPredecessor(tenantId, paidPackageId, paidStart, paidEnd, {
      providerCustomerId: "cus_retained",
    });
    await legacyFreeSubscription(tenantId, freePackageId, {
      provider: "stripe",
      providerSubscriptionId: "",
    });

    await repairLegacyFreePeriods({ apply: true, now: FIXED_NOW });

    const stored = await SubscriptionModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      packageId: freePackageId,
    }).lean().exec();
    const summary = toCompanyBillingSummary(stored as unknown as Record<string, unknown>);
    expect(summary.providerLinked).toBe(false);
    expect(summary.canOpenPortal).toBe(false);
    expect(summary.canUpdatePaymentMethod).toBe(false);
    expect(stored!.providerCustomerId).toBe("cus_retained");
  });

  it("does not grant a fresh quota period at repair time — getPeriodRange returns the retained period", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const paidPackageId = await seedPaidPackage();
    const tenantId = new Types.ObjectId().toString();
    const now = new Date();
    const paidStart = new Date(now.getTime() - DAY);
    const paidEnd = new Date(now.getTime() + 30 * DAY);
    await seedPaidPredecessor(tenantId, paidPackageId, paidStart, paidEnd);
    await legacyFreeSubscription(tenantId, freePackageId);

    await repairLegacyFreePeriods({ apply: true, now: FIXED_NOW });

    const provider = new MongoEntitlementProvider();
    const range = await provider.getPeriodRange(tenantId);
    expect(range.periodStart.getTime()).toBe(paidStart.getTime());
    expect(range.periodEnd!.getTime()).toBe(paidEnd.getTime());
  });

  it("corrected Free rolls over only at the retained paid periodEnd", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const paidPackageId = await seedPaidPackage();
    const tenantId = new Types.ObjectId().toString();
    const now = new Date();
    const paidStart = new Date(now.getTime() - 40 * DAY);
    const paidEnd = new Date(now.getTime() - 10 * DAY);
    // The Free was created one day before the paid period ended, so the paid
    // period is a deterministic lineage even though it is already expired at
    // migration time (`now`).
    const freeCreatedAt = new Date(paidEnd.getTime() - DAY);
    await createSubscription(tenantId, paidPackageId, {
      provider: "stripe",
      providerCustomerId: "cus_paid_A",
      providerSubscriptionId: "sub_paid_1",
      providerPriceId: "price_paid_1",
      billingInterval: "monthly",
      status: "CANCELED",
      periodStart: paidStart,
      periodEnd: paidEnd,
      currentPeriodStart: paidStart,
      currentPeriodEnd: paidEnd,
      startedAt: new Date(freeCreatedAt.getTime() - 3600_000),
      createdAt: new Date(freeCreatedAt.getTime() - 3600_000),
    });
    await createSubscription(tenantId, freePackageId, {
      provider: "stripe",
      providerSubscriptionId: "",
      periodStart: null,
      periodEnd: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      startedAt: freeCreatedAt,
      createdAt: freeCreatedAt,
    });

    const report = await repairLegacyFreePeriods({ apply: true, now });
    expect(report.repairedFromPaidPeriod).toBe(1);

    const provider = new MongoEntitlementProvider();
    const range = await provider.getPeriodRange(tenantId);
    const expected = resolveCurrentLocalFreePeriod(paidStart, paidEnd, now);
    expect(range.periodStart.getTime()).toBe(expected.periodStart.getTime());
    expect(range.periodEnd!.getTime()).toBe(expected.periodEnd.getTime());
    // The rollover anchors at the retained paid periodEnd (now - 10d), not at
    // migration time (now) nor at the Free creation time.
    expect(range.periodStart.getTime()).toBe(paidEnd.getTime());
  });

  it("is idempotent for include-repaired corrections", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const paidPackageId = await seedPaidPackage();
    const tenantId = new Types.ObjectId().toString();
    const now = new Date();
    const paidStart = new Date(now.getTime() - DAY);
    const paidEnd = new Date(now.getTime() + 30 * DAY);
    await seedPaidPredecessor(tenantId, paidPackageId, paidStart, paidEnd);
    const repairedStart = new Date(now.getTime() + DAY);
    await createSubscription(tenantId, freePackageId, {
      provider: "stripe",
      providerSubscriptionId: "",
      periodStart: repairedStart,
      periodEnd: addCalendarMonths(repairedStart, 1),
      currentPeriodStart: repairedStart,
      currentPeriodEnd: addCalendarMonths(repairedStart, 1),
    });

    const first = await repairLegacyFreePeriods({
      apply: true,
      now: FIXED_NOW,
      includeRepaired: true,
    });
    const second = await repairLegacyFreePeriods({
      apply: true,
      now: FIXED_NOW,
      includeRepaired: true,
    });

    expect(first.repaired).toBe(1);
    expect(second.repaired).toBe(0);
    expect(second.alreadyCorrect).toBe(1);

    const stored = await SubscriptionModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      packageId: freePackageId,
    }).lean().exec();
    expect(stored!.periodStart!.getTime()).toBe(paidStart.getTime());
    expect(stored!.periodEnd!.getTime()).toBe(paidEnd.getTime());
  });

  it("concurrent include-repaired corrections cannot produce conflicting periods/provider state", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const paidPackageId = await seedPaidPackage();
    const tenantId = new Types.ObjectId().toString();
    const now = new Date();
    const paidStart = new Date(now.getTime() - DAY);
    const paidEnd = new Date(now.getTime() + 30 * DAY);
    await seedPaidPredecessor(tenantId, paidPackageId, paidStart, paidEnd);
    const repairedStart = new Date(now.getTime() + DAY);
    await createSubscription(tenantId, freePackageId, {
      provider: "stripe",
      providerSubscriptionId: "",
      periodStart: repairedStart,
      periodEnd: addCalendarMonths(repairedStart, 1),
      currentPeriodStart: repairedStart,
      currentPeriodEnd: addCalendarMonths(repairedStart, 1),
    });

    const [reportA, reportB] = await Promise.all([
      repairLegacyFreePeriods({ apply: true, now: FIXED_NOW, includeRepaired: true }),
      repairLegacyFreePeriods({ apply: true, now: FIXED_NOW, includeRepaired: true }),
    ]);

    expect(reportA.repaired + reportB.repaired).toBe(1);
    expect(reportA.repaired + reportA.skippedConcurrentChange).toBe(1);
    expect(reportB.repaired + reportB.skippedConcurrentChange).toBe(1);

    const stored = await SubscriptionModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      packageId: freePackageId,
    }).lean().exec();
    expect(stored!.periodStart!.getTime()).toBe(paidStart.getTime());
    expect(stored!.periodEnd!.getTime()).toBe(paidEnd.getTime());
    expect(stored!.provider).toBe("local");
    expect(stored!.currentPeriodStart!.getTime()).toBe(paidStart.getTime());
    expect(stored!.currentPeriodEnd!.getTime()).toBe(paidEnd.getTime());
  });
});

describe("repairLegacyFreePeriods — period-scoped counter reconciliation", () => {
  it("reconciles authoritative queries and OCR into the corrected period without touching tokens/storage/snapshots/history", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const paidPackageId = await seedPaidPackage();
    const tenantId = new Types.ObjectId().toString();
    const now = new Date();
    const paidStart = new Date(now.getTime() - DAY);
    const paidEnd = new Date(now.getTime() + 30 * DAY);
    await seedPaidPredecessor(tenantId, paidPackageId, paidStart, paidEnd);
    await legacyFreeSubscription(tenantId, freePackageId, {
      provider: "stripe",
      providerSubscriptionId: "",
    });

    await seedAuthoritativeUsage(tenantId, paidStart, paidEnd, 34, 1);

    const counter = new MongoQuotaCounter();
    const key = keyFor(paidStart);
    await counter.set(tenantId, "queriesPerMonth", key, 0);
    await counter.set(tenantId, "ocrPagesPerMonth", key, 0);
    await counter.set(tenantId, "tokensPerMonth", key, 112967);
    await counter.set(tenantId, "storageMb", key, 0.21);
    await counter.set(tenantId, "employees", key, 1);
    await counter.set(tenantId, "admins", key, 0);
    await counter.set(tenantId, "documents", key, 6);
    // Historical counter rows must survive untouched.
    await counter.set(tenantId, "queriesPerMonth", "2026-07", 99);

    const report = await repairLegacyFreePeriods({ apply: true, now: FIXED_NOW });

    expect(report.reconciledQueries).toBe(1);
    expect(report.reconciledOcr).toBe(1);

    expect(await counter.getUsage(tenantId, "queriesPerMonth", key)).toBeGreaterThanOrEqual(34);
    expect(await counter.getUsage(tenantId, "ocrPagesPerMonth", key)).toBeGreaterThanOrEqual(1);
    expect(await counter.getUsage(tenantId, "tokensPerMonth", key)).toBe(112967);
    expect(await counter.getUsage(tenantId, "storageMb", key)).toBe(0.21);
    expect(await counter.getUsage(tenantId, "employees", key)).toBe(1);
    expect(await counter.getUsage(tenantId, "admins", key)).toBe(0);
    expect(await counter.getUsage(tenantId, "documents", key)).toBe(6);
    expect(await counter.getUsage(tenantId, "queriesPerMonth", "2026-07")).toBe(99);
    // Historical counter rows are preserved (not deleted, not zeroed).
    const rows = await QuotaCounterModel.find({ tenantId: new Types.ObjectId(tenantId) }).lean().exec();
    expect(rows.some((row) => row.periodStart === "2026-07" && row.value === 99)).toBe(true);
  });

  it("does NOT lower a counter already higher than the authoritative count (monotonic)", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const paidPackageId = await seedPaidPackage();
    const tenantId = new Types.ObjectId().toString();
    const now = new Date();
    const paidStart = new Date(now.getTime() - DAY);
    const paidEnd = new Date(now.getTime() + 30 * DAY);
    await seedPaidPredecessor(tenantId, paidPackageId, paidStart, paidEnd);
    await legacyFreeSubscription(tenantId, freePackageId, {
      provider: "stripe",
      providerSubscriptionId: "",
    });

    await seedAuthoritativeUsage(tenantId, paidStart, paidEnd, 34, 1);

    const counter = new MongoQuotaCounter();
    const key = keyFor(paidStart);
    await counter.set(tenantId, "queriesPerMonth", key, 50);
    await counter.set(tenantId, "ocrPagesPerMonth", key, 5);

    await repairLegacyFreePeriods({ apply: true, now: FIXED_NOW });

    // ensureAtLeast must never lower concurrent consumption.
    expect(await counter.getUsage(tenantId, "queriesPerMonth", key)).toBe(50);
    expect(await counter.getUsage(tenantId, "ocrPagesPerMonth", key)).toBe(5);
  });

  it("counts authoritative usage earlier in the same calendar month, before the retained period began", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const paidPackageId = await seedPaidPackage();
    const tenantId = new Types.ObjectId().toString();
    // Live-shaped scenario: paid period [2026-08-15T20:40:51, 2026-09-15T20:40:51].
    const paidStart = new Date("2026-08-15T20:40:51.000Z");
    const paidEnd = new Date("2026-09-15T20:40:51.000Z");
    const freeCreatedAt = new Date("2026-08-15T22:58:11.000Z");
    await createSubscription(tenantId, paidPackageId, {
      provider: "stripe",
      providerSubscriptionId: "sub_paid_1",
      status: "CANCELED",
      periodStart: paidStart,
      periodEnd: paidEnd,
      currentPeriodStart: paidStart,
      currentPeriodEnd: paidEnd,
      startedAt: new Date("2026-08-14T12:05:31.000Z"),
      createdAt: new Date("2026-08-14T12:05:31.000Z"),
    });
    await createSubscription(tenantId, freePackageId, {
      provider: "stripe",
      providerSubscriptionId: "",
      periodStart: null,
      periodEnd: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      startedAt: freeCreatedAt,
      createdAt: freeCreatedAt,
    });

    // 34 QUESTION_ASKED + 2 OCR records consumed on Aug 14-15 — BEFORE the
    // retained period began but within the same calendar month ("2026-08").
    const docId = new Types.ObjectId();
    const usageRows = Array.from({ length: 34 }, () => ({
      tenantId: new Types.ObjectId(tenantId),
      eventType: "QUESTION_ASKED" as const,
      createdAt: new Date("2026-08-15T12:00:00.000Z"),
    }));
    await UsageLogModel.insertMany(usageRows);
    const ocrRows = [1, 2].map((pageNumber) => ({
      tenantId: new Types.ObjectId(tenantId),
      documentId: docId,
      documentVersion: 1,
      pageNumber,
      provider: "tesseract",
      providerModel: "tesseract",
      language: "en" as const,
      pagesProcessed: 1,
      durationMs: 100,
      costUsd: 0,
      createdAt: new Date("2026-08-15T00:00:00.000Z"),
    }));
    await OcrUsageRecordModel.insertMany(ocrRows);

    const counter = new MongoQuotaCounter();
    await counter.set(tenantId, "queriesPerMonth", "2026-08", 0);
    await counter.set(tenantId, "ocrPagesPerMonth", "2026-08", 0);

    const report = await repairLegacyFreePeriods({ apply: true, now: FIXED_NOW });

    expect(report.repairedFromPaidPeriod).toBe(1);
    expect(report.reconciledQueries).toBe(1);
    expect(report.reconciledOcr).toBe(1);
    expect(await counter.getUsage(tenantId, "queriesPerMonth", "2026-08")).toBeGreaterThanOrEqual(34);
    expect(await counter.getUsage(tenantId, "ocrPagesPerMonth", "2026-08")).toBeGreaterThanOrEqual(1);

    const detail = report.details.find((d) => d.repairClass === "allNull");
    expect(detail).toBeDefined();
    expect(detail!.queries!.current).toBe(0);
    expect(detail!.queries!.authoritative).toBeGreaterThanOrEqual(34);
    expect(detail!.ocr!.authoritative).toBeGreaterThanOrEqual(1);
  });

  it("reports the exact counter preview in dry-run without mutating anything", async () => {
    const freePackageId = await seedCanonicalFreePackage();
    const paidPackageId = await seedPaidPackage();
    const tenantId = new Types.ObjectId().toString();
    const now = new Date();
    const paidStart = new Date(now.getTime() - DAY);
    const paidEnd = new Date(now.getTime() + 30 * DAY);
    await seedPaidPredecessor(tenantId, paidPackageId, paidStart, paidEnd);
    await legacyFreeSubscription(tenantId, freePackageId, {
      provider: "stripe",
      providerSubscriptionId: "",
    });

    await seedAuthoritativeUsage(tenantId, paidStart, paidEnd, 34, 1);
    const counter = new MongoQuotaCounter();
    const key = keyFor(paidStart);
    await counter.set(tenantId, "queriesPerMonth", key, 0);
    await counter.set(tenantId, "ocrPagesPerMonth", key, 0);
    await counter.set(tenantId, "tokensPerMonth", key, 112967);

    const report = await repairLegacyFreePeriods({ now: FIXED_NOW });

    expect(report.mode).toBe("dry-run");
    expect(report.wouldRepair).toBe(1);
    expect(report.repaired).toBe(0);
    expect(report.reconciledQueries).toBe(1);
    expect(report.reconciledOcr).toBe(1);

    const detail = report.details.find((d) => d.repairClass === "allNull");
    expect(detail).toBeDefined();
    expect(detail!.queries!.current).toBe(0);
    expect(detail!.queries!.authoritative).toBeGreaterThanOrEqual(34);
    expect(detail!.ocr!.current).toBe(0);
    expect(detail!.ocr!.authoritative).toBeGreaterThanOrEqual(1);

    // Dry-run never mutates the subscription or the counters.
    expect(await counter.getUsage(tenantId, "queriesPerMonth", key)).toBe(0);
    expect(await counter.getUsage(tenantId, "tokensPerMonth", key)).toBe(112967);
    const stored = await SubscriptionModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      packageId: freePackageId,
    }).lean().exec();
    expect(stored!.periodStart).toBeNull();
    expect(stored!.provider).toBe("stripe");
  });
});

describe("resolvePaidLineage — deterministic predecessor rule", () => {
  function record(overrides: Partial<Parameters<typeof resolvePaidLineage>[0]> = {}): Parameters<typeof resolvePaidLineage>[0] {
    return {
      _id: new Types.ObjectId(),
      tenantId: new Types.ObjectId(),
      packageId: new Types.ObjectId(),
      status: "ACTIVE",
      periodStart: null,
      periodEnd: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      createdAt: new Date("2026-08-16T09:22:00.000Z"),
      startedAt: new Date("2026-08-16T09:22:00.000Z"),
      provider: "local",
      providerSubscriptionId: "",
      ...overrides,
    };
  }

  it("finds the single non-Free subscription whose period contains the Free creation", () => {
    const freePackageId = new Types.ObjectId();
    const paidPackageId = new Types.ObjectId();
    const free = record({
      _id: new Types.ObjectId(),
      packageId: freePackageId,
      createdAt: new Date("2026-08-16T09:22:00.000Z"),
    });
    const paid = record({
      _id: new Types.ObjectId(),
      packageId: paidPackageId,
      createdAt: new Date("2026-08-15T20:00:00.000Z"),
      periodStart: new Date("2026-08-15T20:40:51.000Z"),
      periodEnd: new Date("2026-09-15T20:40:51.000Z"),
    });

    const lineage = resolvePaidLineage(free, [paid, free], freePackageId);
    expect(lineage.status).toBe("found");
    expect(String(lineage.predecessor!._id)).toBe(String(paid._id));
  });

  it("returns none when no non-Free subscription contains the Free creation", () => {
    const freePackageId = new Types.ObjectId();
    const paidPackageId = new Types.ObjectId();
    const free = record({ _id: new Types.ObjectId(), packageId: freePackageId });
    const unrelated = record({
      _id: new Types.ObjectId(),
      packageId: paidPackageId,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-02-01T00:00:00.000Z"),
    });
    const lineage = resolvePaidLineage(free, [unrelated, free], freePackageId);
    expect(lineage.status).toBe("none");
  });

  it("returns ambiguous when multiple non-Free subscriptions contain the Free creation", () => {
    const freePackageId = new Types.ObjectId();
    const paidPackageId = new Types.ObjectId();
    const free = record({ _id: new Types.ObjectId(), packageId: freePackageId });
    const paidA = record({
      _id: new Types.ObjectId(),
      packageId: paidPackageId,
      periodStart: new Date("2026-08-01T00:00:00.000Z"),
      periodEnd: new Date("2026-09-01T00:00:00.000Z"),
    });
    const paidB = record({
      _id: new Types.ObjectId(),
      packageId: paidPackageId,
      periodStart: new Date("2026-08-10T00:00:00.000Z"),
      periodEnd: new Date("2026-09-10T00:00:00.000Z"),
    });
    const lineage = resolvePaidLineage(free, [paidA, paidB, free], freePackageId);
    expect(lineage.status).toBe("ambiguous");
  });

  it("returns ambiguous when the candidate was created after the Free", () => {
    const freePackageId = new Types.ObjectId();
    const paidPackageId = new Types.ObjectId();
    const free = record({
      _id: new Types.ObjectId(),
      packageId: freePackageId,
      createdAt: new Date("2026-08-16T09:22:00.000Z"),
    });
    const paid = record({
      _id: new Types.ObjectId(),
      packageId: paidPackageId,
      createdAt: new Date("2026-08-17T00:00:00.000Z"),
      periodStart: new Date("2026-08-15T20:40:51.000Z"),
      periodEnd: new Date("2026-09-15T20:40:51.000Z"),
    });
    const lineage = resolvePaidLineage(free, [paid, free], freePackageId);
    expect(lineage.status).toBe("ambiguous");
  });
});