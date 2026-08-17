import mongoose, { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setAuditWriter, setMetricRecorder } from "../../../common/observability/index.js";
import {
  assertDisposableMongoConnection,
  connectToDisposableMongoDatabase,
} from "../../../common/testing/disposableMongo.js";
import BillingOperationModel from "../../../db/models/billingOperation.model.js";
import InvoiceModel from "../../../db/models/invoice.model.js";
import RefundModel from "../../../db/models/refund.model.js";
import { resetPermissionEvaluator, setPermissionEvaluator } from "../../permissions/permissions.evaluator.js";
import { FakePaymentProvider } from "../ports/fakes/fake-payment-provider.js";
import {
  confirmRefundRequest,
  createRefundRequest,
  getTenantRefundRequest,
  rejectRefundRequest,
  retryRefundRequest,
  synchronizeRefundFromProvider,
} from "../refund.service.js";

const tenantId = new Types.ObjectId();
const platformTenantId = new Types.ObjectId();
const subscriptionId = new Types.ObjectId();
const invoiceId = new Types.ObjectId();
const companyAdminId = new Types.ObjectId();
const superAdminId = new Types.ObjectId();

const requestProvider = new FakePaymentProvider();

const tenantContext = {
  tenantId: String(tenantId),
  actorId: String(companyAdminId),
  actorEmail: "billing-admin@example.test",
  actorRole: "COMPANY_ADMIN" as const,
};

const platformContext = {
  tenantId: String(platformTenantId),
  actorId: String(superAdminId),
  actorEmail: "super-admin@example.test",
  actorRole: "SUPER_ADMIN" as const,
};

const foreignTenantId = new Types.ObjectId();
const foreignAdminId = new Types.ObjectId();

const foreignTenantContext = {
  tenantId: String(foreignTenantId),
  actorId: String(foreignAdminId),
  actorEmail: "foreign-admin@example.test",
  actorRole: "COMPANY_ADMIN" as const,
};

function seededProvider() {
  const provider = new FakePaymentProvider();
  provider.seedSubscription({
    id: "sub_refund",
    customerId: "cus_refund",
    status: "active",
    metadata: { tenantId: String(tenantId) },
    priceId: "price_refund",
    currentPeriodStart: new Date("2026-07-01T00:00:00.000Z"),
    currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
    cancelAtPeriodEnd: false,
  });
  provider.seedInvoice({
    id: "in_refund",
    customerId: "cus_refund",
    subscriptionId: "sub_refund",
    paymentReference: "ch_refund",
    number: "INV-REFUND-1",
    status: "paid",
    currency: "USD",
    amountDueMinor: 1000,
    amountPaidMinor: 1000,
    amountRemainingMinor: 0,
    refundedAmountMinor: 0,
    subtotalMinor: 1000,
    taxMinor: 0,
    createdAt: new Date("2026-07-02T00:00:00.000Z"),
    dueAt: null,
    paidAt: new Date("2026-07-02T00:00:00.000Z"),
    periodStart: new Date("2026-07-01T00:00:00.000Z"),
    periodEnd: new Date("2026-08-01T00:00:00.000Z"),
    providerVersion: "v1",
  });
  return provider;
}

const refundPersistence = process.env.MONGODB_URI ? describe : describe.skip;

refundPersistence("refund service persistence", () => {
  const testDatabaseName = "billing-refund-service-persistence-test";
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await connectToDisposableMongoDatabase(
        mongoose,
        process.env.MONGODB_URI!,
        testDatabaseName,
      );
    }
    assertDisposableMongoConnection(mongoose.connection, testDatabaseName);
    setAuditWriter({ write: async () => true });
    setMetricRecorder({ increment() {}, histogram() {}, gauge() {} });
    setPermissionEvaluator({
      resolve: async () => ({ permissions: new Set(), grants: new Map(), baseRole: "COMPANY_ADMIN", customRoleId: null, roleVersion: null, customRoleState: "none" }),
      evaluate: async (input) => ({
        allowed: true,
        permission: typeof input.permission === "string" ? input.permission : String(input.permission),
        source: "platform",
        scope: null,
        denialCode: null,
        reason: null,
        roleId: null,
        roleVersion: null,
      }),
      evict() {},
      evictAllForTenant() {},
    });
    await Promise.all([
      BillingOperationModel.syncIndexes(),
      InvoiceModel.syncIndexes(),
      RefundModel.syncIndexes(),
    ]);
  }, 60_000);

  beforeEach(async () => {
    assertDisposableMongoConnection(mongoose.connection, testDatabaseName);
    await Promise.all([
      mongoose.connection.collection("tenants").deleteMany({ _id: { $in: [tenantId, platformTenantId] } }),
      mongoose.connection.collection("tenants").deleteMany({ _id: foreignTenantId }),
      mongoose.connection.collection("users").deleteMany({
        $or: [
          { _id: { $in: [companyAdminId, superAdminId, foreignAdminId] } },
          { role: "SUPER_ADMIN" },
        ],
      }),
      mongoose.connection.collection("subscriptions").deleteMany({ _id: subscriptionId }),
      InvoiceModel.deleteMany({ _id: invoiceId }),
      RefundModel.deleteMany({ tenantId }),
      BillingOperationModel.deleteMany({ tenantId }),
    ]);

    await mongoose.connection.collection("tenants").insertMany([
      { _id: tenantId, name: "Tenant Refund", slug: "tenant-refund", status: "active", plan: "pro", isSystemTenant: false },
      { _id: platformTenantId, name: "Platform", slug: "platform", status: "active", plan: "pro", isSystemTenant: true },
      { _id: foreignTenantId, name: "Foreign Tenant", slug: "foreign-tenant", status: "active", plan: "pro", isSystemTenant: false },
    ]);
    await mongoose.connection.collection("users").insertMany([
      {
        _id: companyAdminId,
        tenantId,
        name: "Billing Admin",
        email: "billing-admin@example.test",
        passwordHash: "hash",
        role: "COMPANY_ADMIN",
        status: "active",
        emailVerified: true,
        permissionBaseline: "standard",
        roleMigrationState: "complete",
        sessionGuardVersion: 0,
      },
      {
        _id: superAdminId,
        tenantId: platformTenantId,
        name: "Super Admin",
        email: "super-admin@example.test",
        passwordHash: "hash",
        role: "SUPER_ADMIN",
        status: "active",
        emailVerified: true,
        permissionBaseline: "standard",
        roleMigrationState: "complete",
        sessionGuardVersion: 0,
      },
      {
        _id: foreignAdminId,
        tenantId: foreignTenantId,
        name: "Foreign Admin",
        email: "foreign-admin@example.test",
        passwordHash: "hash",
        role: "COMPANY_ADMIN",
        status: "active",
        emailVerified: true,
        permissionBaseline: "standard",
        roleMigrationState: "complete",
        sessionGuardVersion: 0,
      },
    ]);
    await mongoose.connection.collection("subscriptions").insertOne({
      _id: subscriptionId,
      tenantId,
      provider: "fake",
      providerCustomerId: "cus_refund",
      providerSubscriptionId: "sub_refund",
      status: "ACTIVE",
      packageVersion: 2,
    });
    await InvoiceModel.create({
      _id: invoiceId,
      tenantId,
      subscriptionId,
      provider: "fake",
      providerInvoiceId: "in_refund",
      paymentReference: "ch_refund",
      invoiceNumber: "INV-REFUND-1",
      status: "paid",
      currency: "USD",
      amountDueMinor: 1000,
      amountPaidMinor: 1000,
      amountRemainingMinor: 0,
      refundedAmountMinor: 0,
      reservedRefundAmountMinor: 0,
      subtotalMinor: 1000,
      taxMinor: 0,
      createdAtProvider: new Date("2026-07-02T00:00:00.000Z"),
      synchronizedAt: new Date("2026-07-02T00:00:00.000Z"),
    });
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      assertDisposableMongoConnection(mongoose.connection, testDatabaseName);
      await Promise.all([
        mongoose.connection.collection("tenants").deleteMany({ _id: { $in: [tenantId, platformTenantId] } }),
        mongoose.connection.collection("tenants").deleteMany({ _id: foreignTenantId }),
        mongoose.connection.collection("users").deleteMany({
        $or: [
          { _id: { $in: [companyAdminId, superAdminId, foreignAdminId] } },
          { role: "SUPER_ADMIN" },
        ],
      }),
        mongoose.connection.collection("subscriptions").deleteMany({ _id: subscriptionId }),
        InvoiceModel.deleteMany({ _id: invoiceId }),
        RefundModel.deleteMany({ tenantId }),
        BillingOperationModel.deleteMany({ tenantId }),
      ]);
    }
    setAuditWriter(null);
    setMetricRecorder(null);
    resetPermissionEvaluator();
    await mongoose.disconnect();
  }, 60_000);

  it("replays the same refund request for the same idempotency key", async () => {
    const first = await createRefundRequest({
      provider: requestProvider,
      tenantId: String(tenantId),
      invoiceId: String(invoiceId),
      mode: "FULL",
      reason: "customer_request",
      idempotencyKey: "refund-request-key-1",
      context: tenantContext,
    });
    const second = await createRefundRequest({
      provider: requestProvider,
      tenantId: String(tenantId),
      invoiceId: String(invoiceId),
      mode: "FULL",
      reason: "customer_request",
      idempotencyKey: "refund-request-key-1",
      context: tenantContext,
    });

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.refund.id).toBe(first.refund.id);
    expect(await RefundModel.countDocuments({ tenantId })).toBe(1);
    expect((await InvoiceModel.findById(invoiceId).lean())?.reservedRefundAmountMinor).toBe(1000);
  });

  it("rejects same-key requests with a different normalized payload without changing the reservation", async () => {
    await createRefundRequest({
      provider: requestProvider,
      tenantId: String(tenantId),
      invoiceId: String(invoiceId),
      mode: "PARTIAL",
      amountMinor: 300,
      reason: "customer_request",
      idempotencyKey: "refund-request-key-conflict",
      context: tenantContext,
    });

    await expect(createRefundRequest({
      provider: requestProvider,
      tenantId: String(tenantId),
      invoiceId: String(invoiceId),
      mode: "PARTIAL",
      amountMinor: 250,
      reason: "customer_request",
      idempotencyKey: "refund-request-key-conflict",
      context: tenantContext,
    })).rejects.toMatchObject({ code: "BILLING_IDEMPOTENCY_KEY_REUSED" });

    expect(await RefundModel.countDocuments({ tenantId })).toBe(1);
    expect((await InvoiceModel.findById(invoiceId).lean())?.reservedRefundAmountMinor).toBe(300);
  });

  it("prevents concurrent partial refund requests from exceeding the refundable balance", async () => {
    const results = await Promise.allSettled([
      createRefundRequest({
        provider: requestProvider,
        tenantId: String(tenantId),
        invoiceId: String(invoiceId),
        mode: "PARTIAL",
        amountMinor: 700,
        reason: "billing_error",
        idempotencyKey: "refund-request-key-2a",
        context: tenantContext,
      }),
      createRefundRequest({
        provider: requestProvider,
        tenantId: String(tenantId),
        invoiceId: String(invoiceId),
        mode: "PARTIAL",
        amountMinor: 500,
        reason: "service_issue",
        idempotencyKey: "refund-request-key-2b",
        context: tenantContext,
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await RefundModel.countDocuments({ tenantId })).toBe(1);
    expect(await BillingOperationModel.countDocuments({ tenantId, operationType: "REFUND" })).toBe(1);
    const invoice = await InvoiceModel.findById(invoiceId).lean();
    expect(invoice?.reservedRefundAmountMinor).toBeGreaterThan(0);
    expect(invoice?.reservedRefundAmountMinor).toBeLessThanOrEqual(1000);
  });

  it("keeps the refund pending until provider-authoritative synchronization confirms it", async () => {
    const provider = seededProvider();
    const requested = await createRefundRequest({
      provider: requestProvider,
      tenantId: String(tenantId),
      invoiceId: String(invoiceId),
      mode: "PARTIAL",
      amountMinor: 400,
      reason: "customer_request",
      idempotencyKey: "refund-request-key-3",
      context: tenantContext,
    });

    const confirmed = await confirmRefundRequest({
      refundId: requested.refund.id,
      provider,
      context: platformContext,
    });
    expect(confirmed.refund.status).toBe("PROVIDER_PENDING");

    const localPending = await RefundModel.findById(requested.refund.id).lean();
    expect(localPending?.status).toBe("PROVIDER_PENDING");

    await synchronizeRefundFromProvider({
      provider,
      providerRefundId: String(localPending?.providerRefundId),
      operationReference: String(localPending?.operationId),
      sourceEventId: "evt_refund_success",
    });

    const localConfirmed = await RefundModel.findById(requested.refund.id).lean();
    const invoice = await InvoiceModel.findById(invoiceId).lean();
    expect(localConfirmed?.status).toBe("SUCCEEDED");
    expect(invoice?.reservedRefundAmountMinor).toBe(0);
    expect(invoice?.refundedAmountMinor).toBe(400);
    expect((await BillingOperationModel.findById(localConfirmed?.operationId))?.status).toBe("CONFIRMED");
  });

  it("moves reserved balance to refunded exactly once when synchronization is replayed", async () => {
    const provider = seededProvider();
    const requested = await createRefundRequest({
      provider: requestProvider,
      tenantId: String(tenantId),
      invoiceId: String(invoiceId),
      mode: "PARTIAL",
      amountMinor: 250,
      reason: "customer_request",
      idempotencyKey: "refund-request-key-4",
      context: tenantContext,
    });
    await confirmRefundRequest({
      refundId: requested.refund.id,
      provider,
      context: platformContext,
    });
    const pending = await RefundModel.findById(requested.refund.id).lean();
    await synchronizeRefundFromProvider({
      provider,
      providerRefundId: String(pending?.providerRefundId),
      operationReference: String(pending?.operationId),
      sourceEventId: "evt_refund_success_once",
    });
    await synchronizeRefundFromProvider({
      provider,
      providerRefundId: String(pending?.providerRefundId),
      operationReference: String(pending?.operationId),
      sourceEventId: "evt_refund_success_twice",
    });

    const invoice = await InvoiceModel.findById(invoiceId).lean();
    expect(invoice?.reservedRefundAmountMinor).toBe(0);
    expect(invoice?.refundedAmountMinor).toBe(250);
  });

  it("creates one durable cancellation impact under concurrent webhook and reconciliation", async () => {
    const provider = seededProvider();
    const requested = await createRefundRequest({
      provider: requestProvider,
      tenantId: String(tenantId), invoiceId: String(invoiceId), mode: "PARTIAL", amountMinor: 200,
      reason: "service_issue", idempotencyKey: "refund-impact-concurrency", context: tenantContext,
    });
    await RefundModel.updateOne({ _id: requested.refund.id }, {
      $set: { subscriptionImpact: "CANCEL_IMMEDIATELY_AFTER_REFUND", subscriptionImpactStatus: "PENDING" },
    });
    await confirmRefundRequest({ refundId: requested.refund.id, provider, context: platformContext });
    const pending = await RefundModel.findById(requested.refund.id).lean();

    await Promise.all([
      synchronizeRefundFromProvider({ provider, providerRefundId: String(pending?.providerRefundId), operationReference: String(pending?.operationId), sourceEventId: "evt-impact-webhook" }),
      synchronizeRefundFromProvider({ provider, providerRefundId: String(pending?.providerRefundId), operationReference: String(pending?.operationId), sourceEventId: "manual-impact-reconcile" }),
    ]);
    await synchronizeRefundFromProvider({
      provider,
      providerRefundId: String(pending?.providerRefundId),
      operationReference: String(pending?.operationId),
      sourceEventId: "manual-impact-convergence",
    });

    const refund = await RefundModel.findById(requested.refund.id).lean();
    const invoice = await InvoiceModel.findById(invoiceId).lean();
    expect(refund).toMatchObject({ status: "SUCCEEDED", subscriptionImpactStatus: "SUCCEEDED" });
    expect(invoice).toMatchObject({ refundedAmountMinor: 200, reservedRefundAmountMinor: 0 });
    expect(await BillingOperationModel.countDocuments({ tenantId, operationType: "CANCEL_IMMEDIATELY" })).toBe(1);
    expect(provider.mutationCalls.filter((call) => call === "cancel-now")).toHaveLength(1);
  });

  it("preserves a pending refund when provider confirmation returns a mismatched amount", async () => {
    const provider = seededProvider();
    const requested = await createRefundRequest({
      provider: requestProvider,
      tenantId: String(tenantId),
      invoiceId: String(invoiceId),
      mode: "PARTIAL",
      amountMinor: 200,
      reason: "customer_request",
      idempotencyKey: "refund-request-key-mismatch",
      context: tenantContext,
    });
    await confirmRefundRequest({
      refundId: requested.refund.id,
      provider,
      context: platformContext,
    });
    const pending = await RefundModel.findById(requested.refund.id).lean();

    await expect(synchronizeRefundFromProvider({
      provider: {
        retrieveRefund: async () => ({
          id: String(pending?.providerRefundId),
          chargeId: "ch_refund",
          customerId: "cus_refund",
          amountMinor: 199,
          currency: "USD",
          status: "succeeded",
          reason: "customer_request",
          createdAt: new Date("2026-07-02T00:00:00.000Z"),
        }),
      } as unknown as FakePaymentProvider,
      providerRefundId: String(pending?.providerRefundId),
      operationReference: String(pending?.operationId),
      sourceEventId: "evt_refund_mismatch",
    })).rejects.toMatchObject({ code: "BILLING_REFUND_AMOUNT_INVALID" });

    const invoice = await InvoiceModel.findById(invoiceId).lean();
    const localRefund = await RefundModel.findById(requested.refund.id).lean();
    expect(invoice?.reservedRefundAmountMinor).toBe(200);
    expect(invoice?.refundedAmountMinor).toBe(0);
    expect(localRefund?.status).toBe("PROVIDER_PENDING");
  });

  it("tracks multiple partial refunds before the final remaining refund exactly", async () => {
    const provider = seededProvider();
    const first = await createRefundRequest({
      provider: requestProvider,
      tenantId: String(tenantId),
      invoiceId: String(invoiceId),
      mode: "PARTIAL",
      amountMinor: 300,
      reason: "customer_request",
      idempotencyKey: "refund-request-key-multi-1",
      context: tenantContext,
    });
    await confirmRefundRequest({ refundId: first.refund.id, provider, context: platformContext });
    let pending = await RefundModel.findById(first.refund.id).lean();
    await synchronizeRefundFromProvider({
      provider,
      providerRefundId: String(pending?.providerRefundId),
      operationReference: String(pending?.operationId),
      sourceEventId: "evt_refund_multi_1",
    });

    let invoice = await InvoiceModel.findById(invoiceId).lean();
    expect(invoice?.refundedAmountMinor).toBe(300);
    expect(invoice?.reservedRefundAmountMinor).toBe(0);

    const second = await createRefundRequest({
      provider: requestProvider,
      tenantId: String(tenantId),
      invoiceId: String(invoiceId),
      mode: "FULL",
      reason: "customer_request",
      idempotencyKey: "refund-request-key-multi-2",
      context: tenantContext,
    });
    await confirmRefundRequest({ refundId: second.refund.id, provider, context: platformContext });
    pending = await RefundModel.findById(second.refund.id).lean();
    await synchronizeRefundFromProvider({
      provider,
      providerRefundId: String(pending?.providerRefundId),
      operationReference: String(pending?.operationId),
      sourceEventId: "evt_refund_multi_2",
    });

    invoice = await InvoiceModel.findById(invoiceId).lean();
    expect(invoice?.refundedAmountMinor).toBe(1000);
    expect(invoice?.reservedRefundAmountMinor).toBe(0);
    expect(await RefundModel.countDocuments({ tenantId, status: "SUCCEEDED" })).toBe(2);
  });

  it("releases the reservation on rejection without calling the provider", async () => {
    const requested = await createRefundRequest({
      provider: requestProvider,
      tenantId: String(tenantId),
      invoiceId: String(invoiceId),
      mode: "PARTIAL",
      amountMinor: 350,
      reason: "billing_error",
      idempotencyKey: "refund-request-key-reject",
      context: tenantContext,
    });

    const rejected = await rejectRefundRequest({
      refundId: requested.refund.id,
      reason: "policy",
      context: platformContext,
    });

    expect(rejected.status).toBe("REJECTED");
    expect((await InvoiceModel.findById(invoiceId).lean())?.reservedRefundAmountMinor).toBe(0);
    expect((await BillingOperationModel.findById(rejected.operationId).lean())?.status).toBe("FAILED");
  });

  it("keeps the reservation during retryable provider timeouts and reuses the same refund on retry", async () => {
    const requested = await createRefundRequest({
      provider: requestProvider,
      tenantId: String(tenantId),
      invoiceId: String(invoiceId),
      mode: "PARTIAL",
      amountMinor: 500,
      reason: "service_issue",
      idempotencyKey: "refund-request-key-retry",
      context: tenantContext,
    });

    const timeoutProvider = {
      createRefund: async () => { throw new Error("timeout"); },
    } as unknown as FakePaymentProvider;

    await expect(confirmRefundRequest({
      refundId: requested.refund.id,
      provider: timeoutProvider,
      context: platformContext,
    })).rejects.toMatchObject({ code: "BILLING_PROVIDER_UNAVAILABLE" });

    let invoice = await InvoiceModel.findById(invoiceId).lean();
    let refund = await RefundModel.findById(requested.refund.id).lean();
    expect(invoice?.reservedRefundAmountMinor).toBe(500);
    expect(refund?.status).toBe("RETRY_PENDING");

    const provider = seededProvider();
    const retried = await retryRefundRequest({
      refundId: requested.refund.id,
      provider,
      context: platformContext,
    });
    refund = await RefundModel.findById(retried.id).lean();
    invoice = await InvoiceModel.findById(invoiceId).lean();
    expect(refund?.status).toBe("PROVIDER_PENDING");
    expect(invoice?.reservedRefundAmountMinor).toBe(500);
    expect(await RefundModel.countDocuments({ tenantId })).toBe(1);
  });

  it("rolls back reservation and operation creation when refund creation fails after the reservation step", async () => {
    const createSpy = vi.spyOn(RefundModel, "create").mockRejectedValueOnce(new Error("write failed"));
    await expect(createRefundRequest({
      provider: requestProvider,
      tenantId: String(tenantId),
      invoiceId: String(invoiceId),
      mode: "PARTIAL",
      amountMinor: 200,
      reason: "customer_request",
      idempotencyKey: "refund-request-key-write-failure",
      context: tenantContext,
    })).rejects.toThrow("write failed");

    expect((await InvoiceModel.findById(invoiceId).lean())?.reservedRefundAmountMinor).toBe(0);
    expect(await RefundModel.countDocuments({ tenantId })).toBe(0);
    expect(await BillingOperationModel.countDocuments({ tenantId, operationType: "REFUND" })).toBe(0);
    createSpy.mockRestore();
  });

  it("fails safely for foreign tenant refund access", async () => {
    const requested = await createRefundRequest({
      provider: requestProvider,
      tenantId: String(tenantId),
      invoiceId: String(invoiceId),
      mode: "PARTIAL",
      amountMinor: 150,
      reason: "customer_request",
      idempotencyKey: "refund-request-key-foreign",
      context: tenantContext,
    });

    await expect(getTenantRefundRequest({
      tenantId: String(foreignTenantId),
      refundId: requested.refund.id,
      context: foreignTenantContext,
    })).rejects.toMatchObject({ code: "BILLING_REFUND_NOT_FOUND" });
  });
});
