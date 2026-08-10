import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { setAuditWriter, setMetricRecorder } from "../../../common/observability/index.js";
import BillingOperationModel from "../../../db/models/billingOperation.model.js";
import BillingPreviewModel from "../../../db/models/billingPreview.model.js";
import InvoiceModel from "../../../db/models/invoice.model.js";
import PackageModel from "../../../db/models/package.model.js";
import RefundModel from "../../../db/models/refund.model.js";
import SubscriptionModel from "../../../db/models/subscription.model.js";
import { reconcileProviderPendingOperations, reconcileBillingOperation } from "../billing-operation-reconciliation.service.js";
import type { SubscriptionStatus } from "../billing.types.js";
import { reconcilePendingRefundSettlements } from "../refund.service.js";
import { FakePaymentProvider } from "../ports/fakes/fake-payment-provider.js";

let mongo: MongoMemoryReplSet | null = null;
const tenantId = new Types.ObjectId();
const actorId = new Types.ObjectId();
const subscriptionId = new Types.ObjectId();
const currentPackageId = new Types.ObjectId();
const targetPackageId = new Types.ObjectId();
const currentVersionId = new Types.ObjectId();
const targetVersionId = new Types.ObjectId();
const unrelatedVersionId = new Types.ObjectId();
const periodStart = new Date("2026-08-01T00:00:00.000Z");
const periodEnd = new Date("2026-09-01T00:00:00.000Z");
const requestedAt = new Date(Date.now() - 60 * 60 * 1000);
const entitlements = { employees: 1, admins: 1, documents: 10, storageMb: 100, fileSizeMb: 10, queriesPerMonth: 100, tokensPerMonth: 0, ocrPagesPerMonth: 0 };

function packageRecord(pkgId: Types.ObjectId, code: string, price: number, versionId: Types.ObjectId, priceId: string) {
  return {
    _id: pkgId, name: code, code, description: "Synthetic test package",
    active: true, version: 1, monthlyPrice: price, annualPrice: price * 10, currency: "USD",
    entitlements, trialDays: 0, visibility: "public", supportedModels: ["basic"], analyticsLevel: "basic",
    retentionDays: 30, supportLevel: "community", stripeProductId: "", stripePriceId: "", stripeAnnualPriceId: "",
    versions: [{ _id: versionId, version: 1, name: code, code, description: "Synthetic test package", monthlyPrice: price, annualPrice: price * 10, currency: "USD", entitlements, trialDays: 0, visibility: "public", supportedModels: ["basic"], analyticsLevel: "basic", retentionDays: 30, supportLevel: "community", stripeProductId: "", stripePriceId: priceId, stripeAnnualPriceId: "", createdAt: periodStart }],
  };
}

async function seedPackages() {
  await PackageModel.insertMany([
    packageRecord(currentPackageId, "synthetic-basic", 1000, currentVersionId, "price-current"),
    packageRecord(targetPackageId, "synthetic-pro", 2000, targetVersionId, "price-target"),
  ]);
}

async function seedSubscription(providerSubscriptionId: string, providerCustomerId: string, packageVersionId: Types.ObjectId, billingInterval: "monthly" | "annual", status: SubscriptionStatus = "ACTIVE") {
  return SubscriptionModel.create({
    _id: subscriptionId, tenantId, packageId: currentPackageId, packageVersionId, packageVersion: 1, status,
    paymentState: "paid", provider: "fake", providerCustomerId, providerSubscriptionId,
    providerPriceId: "price-current", billingInterval, periodStart, periodEnd,
    currentPeriodStart: periodStart, currentPeriodEnd: periodEnd,
  });
}

async function seedOperation(operationType: "PLAN_CHANGE" | "CANCEL_PERIOD_END" | "CANCEL_IMMEDIATELY" | "REACTIVATE", overrides: Record<string, unknown> = {}) {
  return BillingOperationModel.create({
    tenantId, actorId, actorRole: "COMPANY_ADMIN", operationType, status: "PROVIDER_PENDING",
    subscriptionId, requestFingerprint: "a".repeat(64), idempotencyKeyHash: "b".repeat(64), provider: "fake",
    targetPackageId: operationType === "PLAN_CHANGE" ? targetPackageId : null,
    packageVersionId: operationType === "PLAN_CHANGE" ? targetVersionId : null,
    effectiveAt: operationType === "CANCEL_IMMEDIATELY" ? periodEnd : null,
    requestedAt,
    ...overrides,
  });
}

function previewRecord() {
  return {
    tenantId, subscriptionId, currentPackageId, currentPackageVersionId: currentVersionId,
    currentPackageVersion: 1, currentBillingInterval: "monthly" as const,
    targetPackageId, targetPackageVersionId: targetVersionId, targetPackageVersion: 2,
    targetBillingInterval: "annual" as const, currency: "USD", amountDueMinor: 1500, amountCreditMinor: 0,
    effectiveAt: new Date(), nextBillingDate: new Date(Date.now() + 24 * 60 * 60_000),
    expiresAt: new Date(Date.now() + 10 * 60_000), subscriptionRevision: 4, provider: "fake",
    currentProviderPriceReference: "price-current", targetProviderPriceReference: "price-target",
    entitlementImpact: [], createdBy: actorId,
  };
}

function seedProviderSubscription(fake: FakePaymentProvider, providerSubscriptionId: string, providerCustomerId: string, priceId: string, metadata: Record<string, string>, status = "active", cancelAtPeriodEnd = false) {
  fake.subscriptions.push({
    id: providerSubscriptionId, customerId: providerCustomerId, status, metadata,
    priceId, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, cancelAtPeriodEnd,
  });
}

function providerMetadata(packageId: Types.ObjectId, versionId: Types.ObjectId, version: number, interval: "monthly" | "annual") {
  return {
    tenantId: String(tenantId), packageId: String(packageId), packageVersionId: String(versionId),
    packageVersion: String(version), billingInterval: interval,
  };
}

const persistence = process.env.DOCUMIND_DISPOSABLE_MONGO === "true" || process.env.RUN_BILLING_RECONCILIATION_SWEEP === "true"
  ? describe
  : describe.skip;

persistence("provider-pending billing operation reconciliation sweep", () => {
  beforeAll(async () => {
    if (process.env.DOCUMIND_DISPOSABLE_MONGO === "true" && process.env.MONGODB_URI) {
      await mongoose.connect(process.env.MONGODB_URI, { dbName: `billing_reconciliation_sweep_${Date.now()}` });
    } else {
      mongo = await MongoMemoryReplSet.create({
        instanceOpts: [{ launchTimeout: 60_000 }],
        replSet: { count: 1, storageEngine: "wiredTiger", ip: "127.0.0.1" },
      });
      await mongoose.connect(mongo.getUri(), { dbName: `billing_reconciliation_sweep_${Date.now()}` });
    }
    setAuditWriter({ write: async () => true });
    setMetricRecorder({ increment() {}, histogram() {}, gauge() {} });
  }, 60_000);

  beforeEach(async () => {
    await Promise.all([
      BillingOperationModel.deleteMany({}), BillingPreviewModel.deleteMany({}), InvoiceModel.deleteMany({}),
      RefundModel.deleteMany({}), SubscriptionModel.deleteMany({}), PackageModel.deleteMany({}),
    ]);
    await Promise.all([
      BillingOperationModel.syncIndexes(), BillingPreviewModel.syncIndexes(), InvoiceModel.syncIndexes(),
      RefundModel.syncIndexes(), SubscriptionModel.syncIndexes(), PackageModel.syncIndexes(),
    ]);
  }, 60_000);

  afterAll(async () => {
    setAuditWriter(null); setMetricRecorder(null);
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    if (mongo) await mongo.stop();
  }, 60_000);

  it("repairs a stuck plan change whose provider metadata was never updated", async () => {
    await seedPackages();
    await seedSubscription("sub-plan-change", "cust-plan-change", currentVersionId, "monthly");
    const preview = await BillingPreviewModel.create(previewRecord());
    const operation = await seedOperation("PLAN_CHANGE", { previewReference: String(preview._id) });
    const fake = new FakePaymentProvider();
    seedProviderSubscription(fake, "sub-plan-change", "cust-plan-change", "price-current", providerMetadata(currentPackageId, currentVersionId, 1, "monthly"));

    const result = await reconcileProviderPendingOperations({ provider: fake });

    expect(result.repaired).toBe(1);
    expect(result.confirmed).toBe(1);
    const persisted = await BillingOperationModel.findById(operation._id).lean().exec();
    expect(persisted?.status).toBe("CONFIRMED");
    const providerSubscription = fake.subscriptions[0];
    expect(providerSubscription.priceId).toBe("price-target");
    expect(providerSubscription.metadata.packageVersionId).toBe(String(targetVersionId));
    const local = await SubscriptionModel.findById(subscriptionId).lean().exec();
    expect(String(local?.packageVersionId)).toBe(String(targetVersionId));
    expect(local?.billingInterval).toBe("annual");
  });

  it("confirms a pending plan change that already reached the provider without re-issuing", async () => {
    await seedPackages();
    await seedSubscription("sub-already-applied", "cust-already-applied", targetVersionId, "annual");
    const preview = await BillingPreviewModel.create(previewRecord());
    const operation = await seedOperation("PLAN_CHANGE", { previewReference: String(preview._id) });
    const fake = new FakePaymentProvider();
    seedProviderSubscription(fake, "sub-already-applied", "cust-already-applied", "price-target", providerMetadata(targetPackageId, targetVersionId, 2, "annual"));

    const result = await reconcileProviderPendingOperations({ provider: fake });

    expect(result.repaired).toBe(0);
    expect(result.confirmed).toBe(1);
    expect((await BillingOperationModel.findById(operation._id).lean().exec())?.status).toBe("CONFIRMED");
  });

  it("confirms a cancel-immediate op whose provider subscription no longer exists", async () => {
    await seedPackages();
    await seedSubscription("sub-deleted", "cust-deleted", currentVersionId, "monthly");
    const operation = await seedOperation("CANCEL_IMMEDIATELY");
    const fake = new FakePaymentProvider();

    const result = await reconcileProviderPendingOperations({ provider: fake });

    expect(result.confirmed).toBe(1);
    expect((await BillingOperationModel.findById(operation._id).lean().exec())?.status).toBe("CONFIRMED");
    expect((await SubscriptionModel.findById(subscriptionId).lean().exec())?.status).toBe("CANCELED");
  });

  it("fails a plan change whose subscription is already canceled and never applied", async () => {
    await seedPackages();
    await seedSubscription("sub-canceled", "cust-canceled", unrelatedVersionId, "monthly", "CANCELED");
    const preview = await BillingPreviewModel.create(previewRecord());
    const operation = await seedOperation("PLAN_CHANGE", { previewReference: String(preview._id) });
    const fake = new FakePaymentProvider();
    seedProviderSubscription(fake, "sub-canceled", "cust-canceled", "price-current", providerMetadata(currentPackageId, currentVersionId, 1, "monthly"), "canceled");

    const result = await reconcileProviderPendingOperations({ provider: fake });

    expect(result.failed).toBe(1);
    const persisted = await BillingOperationModel.findById(operation._id).lean().exec();
    expect(persisted?.status).toBe("FAILED");
    expect(persisted?.failureCode).toBe("BILLING_SUBSCRIPTION_CHANGED");
  });

  it("fails a plan change against a terminal authoritative subscription", async () => {
    await seedPackages();
    await seedSubscription("sub-terminal", "cust-terminal", currentVersionId, "monthly");
    await BillingPreviewModel.create(previewRecord());
    const operation = await seedOperation("PLAN_CHANGE");

    await reconcileBillingOperation({
      tenantId: String(tenantId),
      operationReference: String(operation._id),
      providerEventId: "reconcile-test",
      outcome: "CONFIRMED",
      authoritativeSubscription: {
        status: "CANCELED",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
        periodEnd: null,
        billingInterval: "monthly",
        packageVersionId: String(unrelatedVersionId),
      },
    });

    const persisted = await BillingOperationModel.findById(operation._id).lean().exec();
    expect(persisted?.status).toBe("FAILED");
    expect(persisted?.failureCode).toBe("BILLING_SUBSCRIPTION_CHANGED");
  });

  it("confirms a pending refund that already succeeded at the provider", async () => {
    await seedPackages();
    await seedSubscription("sub-refund", "cust-refund", currentVersionId, "monthly");
    const invoiceId = new Types.ObjectId();
    await InvoiceModel.create({
      _id: invoiceId, tenantId, subscriptionId, provider: "fake", providerInvoiceId: "inv-1",
      paymentReference: "charge-1", invoiceNumber: "REFUND-1", status: "paid", currency: "USD",
      amountDueMinor: 1000, amountPaidMinor: 1000, amountRemainingMinor: 0, subtotalMinor: 1000, taxMinor: 0,
      refundedAmountMinor: 0, reservedRefundAmountMinor: 0, retainedConsumedMinor: 0,
      createdAtProvider: periodStart, paidAt: periodStart, periodStart, periodEnd, synchronizedAt: periodStart,
    });
    const operation = await BillingOperationModel.create({
      tenantId, actorId, actorRole: "COMPANY_ADMIN", operationType: "REFUND", status: "PROVIDER_PENDING",
      subscriptionId, requestFingerprint: "a".repeat(64), idempotencyKeyHash: "b".repeat(64), provider: "fake",
      requestedAt,
    });
    await RefundModel.create({
      tenantId, invoiceId, subscriptionId, operationId: operation._id, paymentReference: "charge-1",
      amountMinor: 999, currency: "USD", reason: "billing_error", reasonCode: "BILLING_ERROR",
      eligibilityPolicyVersion: "legacy", eligibilitySnapshotHash: "snapshot", maximumEligibleRefundMinor: 999,
      retainedConsumedMinor: 0, subscriptionImpact: "NONE", subscriptionImpactStatus: "NOT_REQUIRED",
      requestedBy: actorId, provider: "fake", providerRefundId: "refund-1", providerStatus: "pending",
      status: "PROVIDER_PENDING", createdAt: requestedAt,
    });
    const fake = new FakePaymentProvider();
    fake.refunds.push({
      id: "refund-1", chargeId: "charge-1", customerId: "cust-refund", amountMinor: 999,
      currency: "USD", status: "succeeded", reason: "billing_error", createdAt: periodStart,
    });

    const result = await reconcilePendingRefundSettlements({ provider: fake });

    expect(result.confirmed).toBe(1);
    const refund = await RefundModel.findOne({ operationId: operation._id }).lean().exec();
    expect(refund?.status).toBe("SUCCEEDED");
    expect((await BillingOperationModel.findById(operation._id).lean().exec())?.status).toBe("CONFIRMED");
  });
});
