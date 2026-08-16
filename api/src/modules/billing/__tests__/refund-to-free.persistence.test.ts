import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../config/index.js", () => ({ config: { NODE_ENV: "test", BILLING_PAST_DUE_GRACE_DAYS: 7 } }));
import { setAuditWriter, setMetricRecorder } from "../../../common/observability/index.js";
import BillingOperationModel from "../../../db/models/billingOperation.model.js";
import InvoiceModel from "../../../db/models/invoice.model.js";
import PackageModel from "../../../db/models/package.model.js";
import RefundModel from "../../../db/models/refund.model.js";
import SubscriptionModel from "../../../db/models/subscription.model.js";
import { migrateSubscriptionHistoryIndex } from "../../../scripts/migrate-subscription-history-index.js";
import { MongoEntitlementProvider } from "../../entitlement/adapters/mongo-entitlement-provider.js";
import { FakePaymentProvider } from "../ports/fakes/fake-payment-provider.js";
import { reconcileSucceededSystemRefundSettlements, refundCapabilitiesForTenant } from "../refund.service.js";
import { assertSystemRefundTransitionReady, completeVoluntaryCancellationLocally } from "../voluntary-cancellation-transition.service.js";

let mongo: MongoMemoryReplSet | null = null;
const tenantId = new Types.ObjectId();
const actorId = new Types.ObjectId();
const paidPackageId = new Types.ObjectId();
const freePackageId = new Types.ObjectId();
const paidSubscriptionId = new Types.ObjectId();
const invoiceId = new Types.ObjectId();
const refundOperationId = new Types.ObjectId();
const refundId = new Types.ObjectId();
const periodStart = new Date("2026-08-01T00:00:00.000Z");
const periodEnd = new Date("2026-09-01T00:00:00.000Z");
const entitlements = { employees: 1, admins: 1, documents: 10, storageMb: 100, fileSizeMb: 10, queriesPerMonth: 100, tokensPerMonth: 0, ocrPagesPerMonth: 0 };

function packageRecord(id: Types.ObjectId, code: string, price: number) {
  return {
    _id: id, name: code === "free" ? "Free" : "Paid", code, description: "Synthetic test package",
    active: true, version: 1, monthlyPrice: price, annualPrice: price * 10, currency: "USD",
    entitlements, trialDays: 0, visibility: "public", supportedModels: ["basic"], analyticsLevel: "basic",
    retentionDays: 30, supportLevel: "community", stripeProductId: "", stripePriceId: "", stripeAnnualPriceId: "",
    versions: [{ version: 1, name: code, code, description: "Synthetic test package", monthlyPrice: price, annualPrice: price * 10, currency: "USD", entitlements, trialDays: 0, visibility: "public", supportedModels: ["basic"], analyticsLevel: "basic", retentionDays: 30, supportLevel: "community", stripeProductId: "", stripePriceId: "", stripeAnnualPriceId: "", createdAt: periodStart }],
  };
}

async function seedSettlement(invoiceRefundedAmountMinor = 999) {
  await PackageModel.insertMany([packageRecord(paidPackageId, "synthetic-paid", 1000), packageRecord(freePackageId, "free", 0)]);
  await SubscriptionModel.create({
    _id: paidSubscriptionId, tenantId, packageId: paidPackageId, packageVersion: 1, status: "ACTIVE",
    paymentState: "paid", provider: "fake", providerCustomerId: "synthetic-customer", providerSubscriptionId: "synthetic-subscription",
    providerPriceId: "synthetic-price", billingInterval: "monthly", periodStart, periodEnd,
    currentPeriodStart: periodStart, currentPeriodEnd: periodEnd,
  });
  await InvoiceModel.create({
    _id: invoiceId, tenantId, subscriptionId: paidSubscriptionId, provider: "fake", providerInvoiceId: "synthetic-invoice",
    paymentReference: "synthetic-charge", invoiceNumber: "SYNTHETIC-1", status: "paid", currency: "USD",
    amountDueMinor: 1000, amountPaidMinor: 1000, amountRemainingMinor: 0, subtotalMinor: 1000, taxMinor: 0,
    refundedAmountMinor: invoiceRefundedAmountMinor, reservedRefundAmountMinor: 0, retainedConsumedMinor: 1,
    createdAtProvider: periodStart, paidAt: periodStart, periodStart, periodEnd, synchronizedAt: periodStart,
  });
  await BillingOperationModel.create({
    _id: refundOperationId, tenantId, actorId, actorRole: "SUPER_ADMIN", operationType: "REFUND", status: "CONFIRMED",
    subscriptionId: paidSubscriptionId, requestFingerprint: "a".repeat(64), idempotencyKeyHash: "b".repeat(64), provider: "fake",
  });
  return RefundModel.create({
    _id: refundId, tenantId, invoiceId, subscriptionId: paidSubscriptionId, operationId: refundOperationId,
    paymentReference: "synthetic-charge", amountMinor: 999, currency: "USD", reason: "system_remaining_balance",
    requestedBy: actorId, reasonCode: "SYSTEM_REMAINING_BALANCE_REFUND", eligibilityPolicyVersion: "issue29-system-v1",
    eligibilitySnapshotHash: "snapshot", maximumEligibleRefundMinor: 999, retainedConsumedMinor: 1,
    subscriptionImpact: "CANCEL_AND_MOVE_TO_FREE", subscriptionImpactStatus: "PENDING", provider: "fake",
    providerRefundId: "synthetic-refund", providerStatus: "succeeded", status: "SUCCEEDED", confirmedBy: actorId,
    confirmedAt: periodStart,
  });
}

function provider() {
  const fake = new FakePaymentProvider();
  fake.subscriptions.push({
    id: "synthetic-subscription", customerId: "synthetic-customer", status: "active", metadata: { tenantId: String(tenantId) },
    priceId: "synthetic-price", currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false,
  });
  fake.refunds.push({
    id: "synthetic-refund", chargeId: "synthetic-charge", customerId: "synthetic-customer", amountMinor: 999,
    currency: "USD", status: "succeeded", reason: "system_remaining_balance", createdAt: periodStart,
  });
  return fake;
}

async function seedAlreadyFree(): Promise<void> {
  await seedSettlement();
  await SubscriptionModel.updateOne({ _id: paidSubscriptionId }, { $set: { status: "CANCELED", cancelAtPeriodEnd: false } });
  await SubscriptionModel.create({
    _id: new Types.ObjectId(), tenantId, packageId: freePackageId, packageVersion: 1, status: "ACTIVE",
    paymentState: "paid", provider: "local", providerCustomerId: "synthetic-customer", providerSubscriptionId: "",
    providerPriceId: "", billingInterval: "monthly", periodStart, periodEnd,
    currentPeriodStart: periodStart, currentPeriodEnd: periodEnd,
  });
}

const alreadyFreeInput = { tenantId: String(tenantId), subscriptionId: String(paidSubscriptionId) };

const persistence = process.env.DOCUMIND_DISPOSABLE_MONGO === "true" || process.env.RUN_REFUND_TO_FREE_PERSISTENCE === "true"
  ? describe
  : describe.skip;

persistence("refund-to-Free persistence", () => {
  beforeAll(async () => {
    if (process.env.DOCUMIND_DISPOSABLE_MONGO === "true" && process.env.MONGODB_URI) {
      await mongoose.connect(process.env.MONGODB_URI, { dbName: `refund_to_free_${Date.now()}` });
    } else {
      mongo = await MongoMemoryReplSet.create({
        instanceOpts: [{ launchTimeout: 60_000 }],
        replSet: { count: 1, storageEngine: "wiredTiger", ip: "127.0.0.1" },
      });
      await mongoose.connect(mongo.getUri(), { dbName: `refund_to_free_${Date.now()}` });
    }
    setAuditWriter({ write: async () => true });
    setMetricRecorder({ increment() {}, histogram() {}, gauge() {} });
  }, 60_000);

  beforeEach(async () => {
    await Promise.all([
      BillingOperationModel.deleteMany({}), InvoiceModel.deleteMany({}), RefundModel.deleteMany({}),
      SubscriptionModel.deleteMany({}), PackageModel.deleteMany({}),
    ]);
    await Promise.all([
      PackageModel.syncIndexes(), SubscriptionModel.syncIndexes(), InvoiceModel.syncIndexes(),
      RefundModel.syncIndexes(), BillingOperationModel.syncIndexes(),
    ]);
  }, 60_000);

  afterAll(async () => {
    setAuditWriter(null); setMetricRecorder(null);
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    if (mongo) await mongo.stop();
  }, 60_000);

  it("does not recreate tenantId_1 across repeated production model index initialization", async () => {
    await SubscriptionModel.createIndexes();
    await SubscriptionModel.createIndexes();
    const indexes = await mongoose.connection.collection("subscriptions").indexes();
    expect(indexes.some((index) => index.name === "tenantId_1" && index.unique === true)).toBe(false);
    expect(indexes).toContainEqual(expect.objectContaining({
      name: "uq_tenant_effective_subscription",
      key: { tenantId: 1 },
      unique: true,
      partialFilterExpression: { status: { $in: ["TRIALING", "INCOMPLETE", "ACTIVE", "PAST_DUE", "PAUSED", "CANCEL_AT_PERIOD_END"] } },
    }));
  });

  it("proves the unrestricted legacy tenant index blocks history plus Free, then the migration permits it", async () => {
    await mongoose.connection.collection("subscriptions").dropIndex("uq_tenant_effective_subscription");
    const indexes = await mongoose.connection.collection("subscriptions").indexes();
    if (indexes.some((index) => index.name === "tenantId_1")) await mongoose.connection.collection("subscriptions").dropIndex("tenantId_1");
    await mongoose.connection.collection("subscriptions").createIndex({ tenantId: 1 }, { unique: true, name: "tenantId_1" });
    const refund = await seedSettlement();
    const session = await mongoose.startSession();
    let blocked = false;
    try {
      await session.withTransaction(() => completeVoluntaryCancellationLocally(refund, session));
    } catch {
      blocked = true;
    } finally {
      await session.endSession();
    }
    expect(blocked).toBe(true);
    expect((await SubscriptionModel.findById(paidSubscriptionId).lean())?.status).toBe("ACTIVE");
    expect(await SubscriptionModel.countDocuments({ tenantId })).toBe(1);

    const report = await migrateSubscriptionHistoryIndex(mongoose.connection.db as never, true);
    expect(report).toMatchObject({ dropped: ["tenantId_1"], businessDocumentsMutated: 0, conflicts: [] });
    const finalIndexes = await mongoose.connection.collection("subscriptions").indexes();
    expect(finalIndexes.filter((index) => index.unique && index.key?.tenantId === 1).map((index) => index.name)).toEqual(["uq_tenant_effective_subscription"]);
  });

  it("persists Paid ACTIVE to Paid CANCELED plus Free ACTIVE and reconciles idempotently", async () => {
    await seedSettlement();
    const fake = provider();

    const first = await reconcileSucceededSystemRefundSettlements({ provider: fake, maxRecords: 10 });
    const paid = await SubscriptionModel.findById(paidSubscriptionId).lean();
    const free = await SubscriptionModel.findOne({ tenantId, packageId: freePackageId, status: "ACTIVE" }).lean();
    const synchronizedRefund = await RefundModel.findById(refundId).lean();
    expect({ first, paidStatus: paid?.status, freeStatus: free?.status, impactStatus: synchronizedRefund?.subscriptionImpactStatus })
      .toMatchObject({ first: { examined: 1, eligibleForTransitionRepair: 1, transitionsCompleted: 1, transitionOperationsCreated: 1, failed: 0 }, paidStatus: "CANCELED", freeStatus: "ACTIVE" });
    expect(paid).toMatchObject({ status: "CANCELED", paymentState: "paid", providerSubscriptionId: "synthetic-subscription" });
    // Free fallback is a local entitlement (provider=local, no providerSubscriptionId)
    // but preserves the paid subscription's providerCustomerId so a later Free → Paid
    // checkout reuses the same Stripe customer instead of creating a duplicate.
    expect(free).toMatchObject({ status: "ACTIVE", paymentState: "paid", provider: "local", providerCustomerId: "synthetic-customer", providerSubscriptionId: "", providerPriceId: "" });
    expect(free).toMatchObject({ periodStart: periodStart, periodEnd: periodEnd, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, billingInterval: "monthly" });
    const range = await new MongoEntitlementProvider().getPeriodRange(String(tenantId));
    expect(range.periodStart).toEqual(periodStart);
    expect(range.periodEnd).toEqual(periodEnd);
    expect(await SubscriptionModel.countDocuments({ tenantId, status: { $in: ["TRIALING", "INCOMPLETE", "ACTIVE", "PAST_DUE", "PAUSED", "CANCEL_AT_PERIOD_END"] } })).toBe(1);
    expect(await new MongoEntitlementProvider().getSnapshot(String(tenantId))).toMatchObject({ documents: 10, storageMb: 100, queriesPerMonth: 100 });
    expect(await InvoiceModel.countDocuments({ _id: invoiceId, refundedAmountMinor: 999, retainedConsumedMinor: 1 })).toBe(1);
    expect(await RefundModel.countDocuments({ _id: refundId, status: "SUCCEEDED", amountMinor: 999 })).toBe(1);
    expect(await refundCapabilitiesForTenant(String(tenantId))).toBe(false);
    expect(fake.refunds).toHaveLength(1);
    expect(fake.mutationCalls.filter((call) => call.startsWith("cancel-now"))).toHaveLength(1);

    const second = await reconcileSucceededSystemRefundSettlements({ provider: fake, maxRecords: 10 });
    expect(second).toMatchObject({ examined: 1, eligibleForTransitionRepair: 1, transitionsCompleted: 1, transitionOperationsCreated: 0, failed: 0 });
    expect(await SubscriptionModel.countDocuments({ tenantId })).toBe(2);
    expect(await BillingOperationModel.countDocuments({ tenantId, operationType: "CANCEL_IMMEDIATELY" })).toBe(1);
    expect(fake.refunds).toHaveLength(1);
    expect(fake.mutationCalls.filter((call) => call.startsWith("cancel-now"))).toHaveLength(1);
  });

  it("rolls paid cancellation back when Free creation fails inside the transaction", async () => {
    const refund = await seedSettlement();
    const create = vi.spyOn(SubscriptionModel, "create").mockRejectedValueOnce(new Error("injected Free creation failure"));
    const session = await mongoose.startSession();
    try {
      await expect(session.withTransaction(() => completeVoluntaryCancellationLocally(refund, session))).rejects.toThrow("injected Free creation failure");
    } finally {
      await session.endSession();
      create.mockRestore();
    }
    expect(await SubscriptionModel.findById(paidSubscriptionId).lean()).toMatchObject({ status: "ACTIVE", paymentState: "paid" });
    expect(await SubscriptionModel.countDocuments({ tenantId, status: { $in: ["TRIALING", "INCOMPLETE", "ACTIVE", "PAST_DUE", "PAUSED", "CANCEL_AT_PERIOD_END"] } })).toBe(1);
    expect(await SubscriptionModel.countDocuments({ tenantId, packageId: freePackageId })).toBe(0);
  });

  it("repairs an already-succeeded 199/1 settlement with a stale zero invoice projection without another refund", async () => {
    await seedSettlement(0);
    const fake = provider();

    const first = await reconcileSucceededSystemRefundSettlements({ provider: fake, maxRecords: 10 });
    expect(first).toMatchObject({
      indexInvariant: { status: "READY" },
      examined: 1,
      eligibleForTransitionRepair: 1,
      transitionsCompleted: 1,
      failed: 0,
    });
    expect(await InvoiceModel.findById(invoiceId).lean()).toMatchObject({
      amountPaidMinor: 1000,
      refundedAmountMinor: 999,
      retainedConsumedMinor: 1,
      reservedRefundAmountMinor: 0,
    });
    expect(await SubscriptionModel.findById(paidSubscriptionId).lean()).toMatchObject({ status: "CANCELED", paymentState: "paid" });
    expect(await SubscriptionModel.countDocuments({ tenantId, packageId: freePackageId, status: "ACTIVE" })).toBe(1);
    expect(fake.refunds).toHaveLength(1);

    await reconcileSucceededSystemRefundSettlements({ provider: fake, maxRecords: 10 });
    expect(await InvoiceModel.countDocuments({ _id: invoiceId, refundedAmountMinor: 999, retainedConsumedMinor: 1 })).toBe(1);
    expect(await SubscriptionModel.countDocuments({ tenantId })).toBe(2);
    expect(await BillingOperationModel.countDocuments({ tenantId, operationType: "CANCEL_IMMEDIATELY" })).toBe(1);
    expect(fake.refunds).toHaveLength(1);
  });

  it("CASE A: readiness still requires an effective paid subscription and the valid index", async () => {
    await seedSettlement();

    await expect(assertSystemRefundTransitionReady(alreadyFreeInput)).resolves.toBeUndefined();
  });

  it("CASE B: readiness passes for an already-Free tenant with a CANCELED paid subscription", async () => {
    await seedAlreadyFree();

    await expect(assertSystemRefundTransitionReady({
      ...alreadyFreeInput,
      refund: { subscriptionImpactStatus: "PENDING", localTransitionStatus: "PENDING" },
    })).resolves.toBeUndefined();
  });

  it("CASE B: readiness passes without refund transition-state input", async () => {
    await seedAlreadyFree();

    await expect(assertSystemRefundTransitionReady(alreadyFreeInput)).resolves.toBeUndefined();
  });

  it("CASE B: fails closed when the paid subscription is CANCELED but the tenant has no Free", async () => {
    await seedSettlement();
    await SubscriptionModel.updateOne({ _id: paidSubscriptionId }, { $set: { status: "CANCELED" } });

    await expect(assertSystemRefundTransitionReady(alreadyFreeInput)).rejects.toMatchObject({ code: "SUBSCRIPTION_INDEX_MIGRATION_REQUIRED" });
  });

  it("CASE B: fails closed when multiple effective subscriptions are ambiguous", async () => {
    await seedAlreadyFree();
    await mongoose.connection.collection("subscriptions").dropIndex("uq_tenant_effective_subscription");
    await SubscriptionModel.create({
      _id: new Types.ObjectId(), tenantId, packageId: paidPackageId, packageVersion: 1, status: "ACTIVE",
      paymentState: "paid", provider: "fake", providerCustomerId: "synthetic-customer", providerSubscriptionId: "second-sub",
      billingInterval: "monthly", periodStart, periodEnd, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd,
    });

    await expect(assertSystemRefundTransitionReady(alreadyFreeInput)).rejects.toMatchObject({ code: "SUBSCRIPTION_INDEX_MIGRATION_REQUIRED" });
  });

  it("CASE B: fails closed when the current subscription is not the canonical Free package", async () => {
    await seedSettlement();
    await SubscriptionModel.updateOne({ _id: paidSubscriptionId }, { $set: { status: "CANCELED" } });
    await SubscriptionModel.create({
      _id: new Types.ObjectId(), tenantId, packageId: paidPackageId, packageVersion: 1, status: "ACTIVE",
      paymentState: "paid", provider: "fake", providerCustomerId: "synthetic-customer", providerSubscriptionId: "",
      billingInterval: "monthly", periodStart, periodEnd, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd,
    });

    await expect(assertSystemRefundTransitionReady(alreadyFreeInput)).rejects.toMatchObject({ code: "SUBSCRIPTION_INDEX_MIGRATION_REQUIRED" });
  });

  it("CASE B: fails closed when the current Free is not serviceable", async () => {
    await seedAlreadyFree();
    await SubscriptionModel.updateOne(
      { tenantId, packageId: freePackageId, status: "ACTIVE" },
      { $set: { status: "PAST_DUE" } },
    );

    await expect(assertSystemRefundTransitionReady(alreadyFreeInput)).rejects.toMatchObject({ code: "SUBSCRIPTION_INDEX_MIGRATION_REQUIRED" });
  });

  it("CASE B: fails closed when the subscription impact transition is unresolved", async () => {
    await seedAlreadyFree();

    await expect(assertSystemRefundTransitionReady({
      ...alreadyFreeInput,
      refund: { subscriptionImpactStatus: "RETRY_PENDING", localTransitionStatus: "PENDING" },
    })).rejects.toMatchObject({ code: "SUBSCRIPTION_INDEX_MIGRATION_REQUIRED" });
  });
});
