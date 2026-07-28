import mongoose, { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setAuditWriter, setMetricRecorder } from "../../../common/observability/index.js";
import InvoiceModel from "../../../db/models/invoice.model.js";
import { FakePaymentProvider } from "../ports/fakes/fake-payment-provider.js";
import { BILLING_SUBSCRIPTION_NOT_READY, projectProviderInvoice, reconcileTenantInvoices, synchronizeInvoiceFromReference } from "../invoice-synchronization.service.js";

const tenantId = new Types.ObjectId();
const subscriptionId = new Types.ObjectId();
const otherTenantId = new Types.ObjectId();
const baseInvoice = {
  id: "in_phase2", customerId: "cus_phase2", subscriptionId: "sub_phase2", number: "INV-P2", status: "open" as const,
  currency: "USD", amountDueMinor: 1200, amountPaidMinor: 0, amountRemainingMinor: 1200, subtotalMinor: 1000, taxMinor: 200,
  createdAt: new Date("2026-07-01"), dueAt: new Date("2026-07-15"), paidAt: null, periodStart: new Date("2026-07-01"),
  periodEnd: new Date("2026-08-01"), providerVersion: "v1", observedAt: new Date("2026-07-02"), hostedInvoiceAvailable: true,
  invoicePdfAvailable: true, receiptAvailable: false,
};

describe("invoice synchronization persistence", () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) await mongoose.connect(process.env.MONGODB_URI!);
    setAuditWriter({ write: async () => true });
    setMetricRecorder({ increment() {}, histogram() {}, gauge() {} });
    await InvoiceModel.syncIndexes();
  });
  beforeEach(async () => {
    await Promise.all([
      InvoiceModel.deleteMany({ tenantId: { $in: [tenantId, otherTenantId] } }),
      mongoose.connection.collection("subscriptions").deleteMany({ _id: subscriptionId }),
      mongoose.connection.collection("tenants").deleteMany({ _id: tenantId }),
    ]);
    await mongoose.connection.collection("tenants").insertOne({ _id: tenantId, name: "Tenant A", slug: "tenant-a", status: "active", plan: "pro", isSystemTenant: false });
    await mongoose.connection.collection("subscriptions").insertOne({ _id: subscriptionId, tenantId, provider: "fake", providerCustomerId: "cus_phase2", providerSubscriptionId: "sub_phase2", status: "ACTIVE" });
  });
  afterAll(async () => {
    await Promise.all([InvoiceModel.deleteMany({ tenantId: { $in: [tenantId, otherTenantId] } }), mongoose.connection.collection("subscriptions").deleteMany({ _id: subscriptionId }), mongoose.connection.collection("tenants").deleteMany({ _id: tenantId })]);
    setAuditWriter(null); setMetricRecorder(null);
  });

  it("idempotently creates, updates, and rejects a known stale observation", async () => {
    const fake = new FakePaymentProvider();
    fake.seedInvoice(baseInvoice);
    expect(await synchronizeInvoiceFromReference({ provider: fake, providerName: "fake", providerInvoiceId: baseInvoice.id, providerCustomerId: baseInvoice.customerId, providerSubscriptionId: "sub_phase2", sourceEventId: "evt-create" })).toMatchObject({ outcome: "created" });
    expect(await synchronizeInvoiceFromReference({ provider: fake, providerName: "fake", providerInvoiceId: baseInvoice.id, providerCustomerId: baseInvoice.customerId, providerSubscriptionId: "sub_phase2", sourceEventId: "evt-duplicate" })).toMatchObject({ outcome: "unchanged" });

    const owned = { _id: subscriptionId, tenantId, provider: "fake", providerCustomerId: "cus_phase2", providerSubscriptionId: "sub_phase2" };
    expect(await projectProviderInvoice({ subscription: owned, providerName: "fake", providerInvoice: { ...baseInvoice, status: "paid", amountPaidMinor: 1200, amountRemainingMinor: 0, paidAt: new Date("2026-07-03"), providerVersion: "v2", observedAt: new Date("2026-07-03") }, sourceEventId: "evt-update" })).toMatchObject({ outcome: "updated" });
    expect(await projectProviderInvoice({ subscription: owned, providerName: "fake", providerInvoice: { ...baseInvoice, observedAt: new Date("2026-07-01") }, sourceEventId: "evt-stale" })).toMatchObject({ outcome: "unchanged" });
    expect(await InvoiceModel.countDocuments({ tenantId })).toBe(1);
    expect(await InvoiceModel.findOne({ tenantId }).lean()).toMatchObject({ status: "paid", amountPaidMinor: 1200, lastProviderEventId: "evt-update" });
  });

  it("prevents reassignment of a provider invoice across tenants", async () => {
    await InvoiceModel.create({ tenantId: otherTenantId, subscriptionId: null, provider: "fake", providerInvoiceId: baseInvoice.id, invoiceNumber: "FOREIGN", status: "open", currency: "USD", amountDueMinor: 1, amountPaidMinor: 0, amountRemainingMinor: 1, subtotalMinor: 1, taxMinor: null, createdAtProvider: new Date(), synchronizedAt: new Date() });
    await expect(projectProviderInvoice({ subscription: { _id: subscriptionId, tenantId, provider: "fake", providerCustomerId: "cus_phase2", providerSubscriptionId: "sub_phase2" }, providerName: "fake", providerInvoice: baseInvoice, sourceEventId: "evt-foreign" })).rejects.toMatchObject({ code: "BILLING_PROVIDER_OWNERSHIP_MISMATCH" });
  });

  it("converges concurrent duplicate projections to one local invoice", async () => {
    const owned = { _id: subscriptionId, tenantId, provider: "fake", providerCustomerId: "cus_phase2", providerSubscriptionId: "sub_phase2" };
    const results = await Promise.all([
      projectProviderInvoice({ subscription: owned, providerName: "fake", providerInvoice: baseInvoice, sourceEventId: "evt-concurrent-a" }),
      projectProviderInvoice({ subscription: owned, providerName: "fake", providerInvoice: baseInvoice, sourceEventId: "evt-concurrent-b" }),
    ]);
    expect(results.map((result) => result.outcome).sort()).toEqual(["created", "unchanged"]);
    expect(await InvoiceModel.countDocuments({ tenantId, providerInvoiceId: baseInvoice.id })).toBe(1);
  });

  it("performs a bounded reconciliation and preserves local history on provider failure", async () => {
    const fake = new FakePaymentProvider(); fake.seedInvoice(baseInvoice);
    expect(await reconcileTenantInvoices({ tenantId: String(tenantId), provider: fake, maxRecords: 1 })).toEqual({ examined: 1, created: 1, updated: 0, unchanged: 0, failed: 0 });
    fake.shouldFailNextInvoiceRead = true;
    expect(await reconcileTenantInvoices({ tenantId: String(tenantId), provider: fake, maxRecords: 1 })).toEqual({ examined: 0, created: 0, updated: 0, unchanged: 0, failed: 1 });
    expect(await InvoiceModel.countDocuments({ tenantId })).toBe(1);
  });

  it("retries invoice-before-subscription delivery and projects exactly once after subscription recovery", async () => {
    const fake = new FakePaymentProvider();
    fake.seedInvoice(baseInvoice);
    await mongoose.connection.collection("subscriptions").deleteMany({ _id: subscriptionId });

    await expect(synchronizeInvoiceFromReference({
      provider: fake,
      providerName: "fake",
      providerInvoiceId: baseInvoice.id,
      providerCustomerId: baseInvoice.customerId,
      providerSubscriptionId: "sub_phase2",
      sourceEventId: "evt-before-subscription",
    })).rejects.toMatchObject({ code: BILLING_SUBSCRIPTION_NOT_READY });

    await mongoose.connection.collection("subscriptions").insertOne({ _id: subscriptionId, tenantId, provider: "fake", providerCustomerId: "cus_phase2", providerSubscriptionId: "sub_phase2", status: "ACTIVE" });
    expect(await synchronizeInvoiceFromReference({
      provider: fake,
      providerName: "fake",
      providerInvoiceId: baseInvoice.id,
      providerCustomerId: baseInvoice.customerId,
      providerSubscriptionId: "sub_phase2",
      sourceEventId: "evt-after-subscription",
    })).toMatchObject({ outcome: "created" });
    expect(await synchronizeInvoiceFromReference({
      provider: fake,
      providerName: "fake",
      providerInvoiceId: baseInvoice.id,
      providerCustomerId: baseInvoice.customerId,
      providerSubscriptionId: "sub_phase2",
      sourceEventId: "evt-after-subscription-replay",
    })).toMatchObject({ outcome: "unchanged" });
    expect(await InvoiceModel.countDocuments({ tenantId, providerInvoiceId: baseInvoice.id })).toBe(1);
  });
});
