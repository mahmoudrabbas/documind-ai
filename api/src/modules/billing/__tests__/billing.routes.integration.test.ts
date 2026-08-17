import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose, { Types } from "mongoose";
import {
  assertDisposableMongoConnection,
  connectToDisposableMongoDatabase,
} from "../../../common/testing/disposableMongo.js";

process.env.NODE_ENV = "test";

import app from "../../../app.js";
import { setAuditWriter, setMetricRecorder } from "../../../common/observability/index.js";
import { PLATFORM_TENANT_SLUG } from "../../../common/auth/platformTenant.js";
import { config } from "../../../config/index.js";
import BillingOperationModel from "../../../db/models/billingOperation.model.js";
import BillingPreviewModel from "../../../db/models/billingPreview.model.js";
import InvoiceModel from "../../../db/models/invoice.model.js";
import PackageModel from "../../../db/models/package.model.js";
import RefundModel from "../../../db/models/refund.model.js";
import RefundEligibilityPreviewModel from "../../../db/models/refundEligibilityPreview.model.js";
import RoleModel from "../../../db/models/role.model.js";
import SubscriptionModel from "../../../db/models/subscription.model.js";
import TenantModel from "../../../db/models/tenant.model.js";
import UserModel from "../../../db/models/user.model.js";
import { disconnectRedis } from "../../../db/redis.js";
import { signJwt } from "../../auth/jwtTokens.js";
import { resetPaymentProvider, setPaymentProvider } from "../../checkout/payment-provider-loader.js";
import { Permission, PERMISSION_CONTRACT_VERSION } from "../../permissions/permissions.catalog.js";
import { resetPermissionEvaluator } from "../../permissions/permissions.evaluator.js";
import { FakePaymentProvider } from "../ports/fakes/fake-payment-provider.js";

type Identity = {
  tenantId: string;
  userId: string;
  token: string;
  role: "SUPER_ADMIN" | "COMPANY_ADMIN" | "EMPLOYEE";
};

let server: Server;
let fakeProvider: FakePaymentProvider;
const ids = {
  platformTenant: new Types.ObjectId(),
  tenantA: new Types.ObjectId(),
  tenantB: new Types.ObjectId(),
  packageBasic: new Types.ObjectId(),
  packagePro: new Types.ObjectId(),
  subscriptionA: new Types.ObjectId(),
  invoiceA: new Types.ObjectId(),
  companyAdminA: new Types.ObjectId(),
  companyAdminB: new Types.ObjectId(),
  employeeA: new Types.ObjectId(),
  employeeReadA: new Types.ObjectId(),
  superAdminA: new Types.ObjectId(),
  superAdminB: new Types.ObjectId(),
};

const secretPasswordHash = "not-used";

// Refund eligibility enforces a 7-day window from invoice payment, so seeded
// payments must stay recent relative to the test run.
const recentPaidAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
const TEST_DATABASE_NAME = "billing-routes-integration-test";

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await connectToDisposableMongoDatabase(
      mongoose,
      process.env.MONGODB_URI!,
      TEST_DATABASE_NAME,
    );
  }
  assertDisposableMongoConnection(mongoose.connection, TEST_DATABASE_NAME);
  await Promise.all([
    TenantModel.syncIndexes(),
    UserModel.syncIndexes(),
    RoleModel.syncIndexes(),
    PackageModel.syncIndexes(),
    SubscriptionModel.syncIndexes(),
    BillingPreviewModel.syncIndexes(),
    BillingOperationModel.syncIndexes(),
    InvoiceModel.syncIndexes(),
    RefundModel.syncIndexes(),
    RefundEligibilityPreviewModel.syncIndexes(),
  ]);
  setAuditWriter({ write: async () => true });
  setMetricRecorder({ increment() {}, histogram() {}, gauge() {} });
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, () => resolve(listening));
  });
}, 120_000);

beforeEach(async () => {
  assertDisposableMongoConnection(mongoose.connection, TEST_DATABASE_NAME);
  resetPermissionEvaluator();
  fakeProvider = new FakePaymentProvider();
  setPaymentProvider(fakeProvider);
  fakeProvider.setClock(new Date());

  await Promise.all([
    BillingOperationModel.deleteMany({}),
    BillingPreviewModel.deleteMany({}),
    RefundModel.deleteMany({}),
    RefundEligibilityPreviewModel.deleteMany({}),
    InvoiceModel.deleteMany({}),
    SubscriptionModel.deleteMany({}),
    PackageModel.deleteMany({}),
    RoleModel.deleteMany({}),
    UserModel.deleteMany({}),
    TenantModel.deleteMany({}),
  ]);

  await seedBaseState();
});

afterAll(async () => {
  resetPaymentProvider();
  resetPermissionEvaluator();
  setAuditWriter(null);
  setMetricRecorder(null);
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.closeAllConnections?.();
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  await disconnectRedis();
  assertDisposableMongoConnection(mongoose.connection, TEST_DATABASE_NAME);
  await Promise.all([
    BillingOperationModel.deleteMany({}),
    BillingPreviewModel.deleteMany({}),
    RefundModel.deleteMany({}),
    RefundEligibilityPreviewModel.deleteMany({}),
    InvoiceModel.deleteMany({}),
    SubscriptionModel.deleteMany({}),
    PackageModel.deleteMany({}),
    RoleModel.deleteMany({}),
    UserModel.deleteMany({}),
    TenantModel.deleteMany({}),
  ]);
  await mongoose.disconnect();
}, 120_000);

describe("billing route integration", () => {
  it("serves the tenant billing route matrix with sanitized DTOs and local-id flows", async () => {
    const admin = identity(ids.companyAdminA, ids.tenantA, "COMPANY_ADMIN");

    const summary = await api("GET", "/billing/summary", admin.token);
    expect(summary.status).toBe(200);
    const summaryBody = await summary.json();
    expect(summaryBody.data).toMatchObject({
      status: "ACTIVE",
      providerLinked: true,
      canOpenPortal: true,
      canUpdatePaymentMethod: true,
      canViewInvoices: true,
      canChangePlan: true,
      canCancel: true,
      canReactivate: false,
      canRequestRefund: true,
    });
    expect(JSON.stringify(summaryBody)).not.toMatch(/providerCustomerId|providerSubscriptionId|providerPriceId|lastProviderEventId|cus_|sub_[A-Z]?/i);

    const portal = await api("POST", "/billing/portal-sessions", admin.token, { flow: "payment_method_update" });
    expect(portal.status).toBe(200);
    expect((await portal.json()).data).toMatchObject({ url: expect.any(String) });

    const invoices = await api("GET", "/billing/invoices?page=1&pageSize=10", admin.token);
    expect(invoices.status).toBe(200);
    const invoicesBody = await invoices.json();
    expect(invoicesBody.data.invoices).toHaveLength(1);
    expect(JSON.stringify(invoicesBody.data.invoices[0])).not.toMatch(/providerInvoiceId|paymentReference|cus_|sub_|in_/i);

    const detail = await api("GET", `/billing/invoices/${ids.invoiceA}/`, admin.token);
    expect(detail.status).toBe(200);

    const links = await api("GET", `/billing/invoices/${ids.invoiceA}/links`, admin.token);
    expect(links.status).toBe(200);
    const linksBody = await links.json();
    expect(linksBody.data).toMatchObject({
      hostedInvoiceUrl: expect.any(String),
      invoicePdfUrl: expect.any(String),
    });
    expect(JSON.stringify(linksBody)).not.toMatch(/providerInvoiceId|cus_|sub_|paymentReference/i);

    const preview = await api("POST", "/billing/subscription-change-previews", admin.token, {
      targetPackageId: String(ids.packagePro),
      billingInterval: "monthly",
    });
    expect(preview.status).toBe(200);
    const previewBody = await preview.json();
    const previewId = String(previewBody.data.id);
    expect(previewBody.data).toMatchObject({
      currency: "USD",
      billingInterval: "monthly",
      targetPackage: { code: "pro" },
    });

    const change = await api("POST", "/billing/subscription-changes", admin.token, {
      previewId,
      idempotencyKey: "plan-change-key-001",
    });
    const changeBody = await change.json();
    expect(change.status, JSON.stringify(changeBody)).toBe(200);
    const operationId = String(changeBody.data.operation.id);
    expect(changeBody.data.operation).toMatchObject({ status: "PROVIDER_PENDING", type: "PLAN_CHANGE" });
    expect(JSON.stringify(changeBody)).not.toMatch(/providerOperationReference|providerObjectReference|price_pro/i);

    const operation = await api("GET", `/billing/operations/${operationId}`, admin.token);
    expect(operation.status).toBe(200);
    expect((await operation.json()).data).toMatchObject({ id: operationId, status: "PROVIDER_PENDING" });

    const refundEligibilityId = await createRefundEligibility(admin.token, ids.invoiceA);
    const refund = await api("POST", "/billing/refund-requests", admin.token, {
      previewId: refundEligibilityId,
      idempotencyKey: "refund-idem-001",
    });
    expect(refund.status).toBe(200);
    const refundBody = await refund.json();
    const refundId = String(refundBody.data.refund.id);
    expect(refundBody.data.replayed).toBe(false);
    expect(JSON.stringify(refundBody)).not.toMatch(/paymentReference|providerRefundId|cus_|re_/i);

    const refundReplay = await api("POST", "/billing/refund-requests", admin.token, {
      previewId: refundEligibilityId,
      idempotencyKey: "refund-idem-001",
    });
    expect(refundReplay.status).toBe(200);
    const refundReplayBody = await refundReplay.json();
    expect(refundReplayBody.data.replayed).toBe(true);
    expect(refundReplayBody.data.refund.id).toBe(refundId);

    const refundList = await api("GET", "/billing/refund-requests?page=1&pageSize=10", admin.token);
    expect(refundList.status).toBe(200);
    expect((await refundList.json()).data.refunds).toHaveLength(1);

    const refundDetail = await api("GET", `/billing/refund-requests/${refundId}`, admin.token);
    expect(refundDetail.status).toBe(200);
  });

  it("handles cancellation and reactivation tenant routes with proper local authorization", async () => {
    const admin = identity(ids.companyAdminA, ids.tenantA, "COMPANY_ADMIN");

    const cancelPeriodEnd = await api("POST", "/billing/cancellations", admin.token, {
      cancellationType: "PERIOD_END",
      idempotencyKey: "cancel-period-end-001",
    });
    expect(cancelPeriodEnd.status).toBe(200);
    const cancelBody = await cancelPeriodEnd.json();
    expect(cancelBody.data.operation).toMatchObject({
      type: "CANCEL_PERIOD_END",
      status: "PROVIDER_PENDING",
      cancellationType: "PERIOD_END",
    });
    await BillingOperationModel.updateOne(
      { _id: cancelBody.data.operation.id },
      { $set: { status: "CONFIRMED", confirmedAt: new Date("2026-07-29T00:05:00.000Z") } },
    ).exec();

    await SubscriptionModel.updateOne(
      { _id: ids.subscriptionA },
      { $set: { cancelAtPeriodEnd: true, status: "ACTIVE" } },
    ).exec();
    fakeProvider.subscriptions[0] = {
      ...fakeProvider.subscriptions[0]!,
      cancelAtPeriodEnd: true,
    };

    const reactivate = await api("POST", "/billing/reactivations", admin.token, {
      idempotencyKey: "reactivation-001",
    });
    expect(reactivate.status).toBe(200);
    expect((await reactivate.json()).data.operation).toMatchObject({
      type: "REACTIVATE",
      status: "PROVIDER_PENDING",
    });
  });

  it("enforces authentication, permission boundaries, hidden 404, and validation on tenant billing routes", async () => {
    const employee = identity(ids.employeeA, ids.tenantA, "EMPLOYEE");
    const readOnly = identity(ids.employeeReadA, ids.tenantA, "EMPLOYEE");
    const foreignAdmin = identity(ids.companyAdminB, ids.tenantB, "COMPANY_ADMIN");

    const unauth = await api("GET", "/billing/summary");
    expect(unauth.status).toBe(401);

    const denied = await api("GET", "/billing/summary", employee.token);
    expect(denied.status).toBe(403);

    const readOnlySummary = await api("GET", "/billing/summary", readOnly.token);
    expect(readOnlySummary.status).toBe(200);

    const readOnlyPortal = await api("POST", "/billing/portal-sessions", readOnly.token, { flow: "payment_method_update" });
    expect(readOnlyPortal.status).toBe(403);

    const invalidPortal = await api("POST", "/billing/portal-sessions", identity(ids.companyAdminA, ids.tenantA, "COMPANY_ADMIN").token, {
      flow: "unknown",
      returnUrl: "https://evil.example",
    });
    expect(invalidPortal.status).toBe(400);

    const invalidPageSize = await api("GET", "/billing/invoices?page=1&pageSize=99", readOnly.token);
    expect(invalidPageSize.status).toBe(400);

    const invalidRange = await api("GET", "/billing/invoices?page=1&pageSize=10&from=2026-08-01&to=2026-07-01", readOnly.token);
    expect(invalidRange.status).toBe(400);

    const invalidIdempotency = await api("POST", "/billing/subscription-changes", identity(ids.companyAdminA, ids.tenantA, "COMPANY_ADMIN").token, {
      previewId: String(new Types.ObjectId()),
      idempotencyKey: "short",
    });
    expect(invalidIdempotency.status).toBe(400);

    const foreignInvoice = await api("GET", `/billing/invoices/${ids.invoiceA}`, foreignAdmin.token);
    expect(foreignInvoice.status).toBe(404);

    const foreignLinks = await api("GET", `/billing/invoices/${ids.invoiceA}/links`, foreignAdmin.token);
    expect(foreignLinks.status).toBe(404);

    const preview = await api("POST", "/billing/subscription-change-previews", identity(ids.companyAdminA, ids.tenantA, "COMPANY_ADMIN").token, {
      targetPackageId: String(ids.packagePro),
      billingInterval: "monthly",
    });
    const previewId = String((await preview.json()).data.id);
    const foreignChange = await api("POST", "/billing/subscription-changes", foreignAdmin.token, {
      previewId,
      idempotencyKey: "foreign-preview-001",
    });
    expect(foreignChange.status).toBe(404);

    const adminToken = identity(ids.companyAdminA, ids.tenantA, "COMPANY_ADMIN").token;
    const refundEligibilityId = await createRefundEligibility(adminToken, ids.invoiceA);
    const refund = await api("POST", "/billing/refund-requests", adminToken, {
      previewId: refundEligibilityId,
      idempotencyKey: "refund-foreign-001",
    });
    const refundId = String((await refund.json()).data.refund.id);
    const foreignRefund = await api("GET", `/billing/refund-requests/${refundId}`, foreignAdmin.token);
    expect(foreignRefund.status).toBe(404);
  });

  it("serves platform refund and invoice reconciliation routes with platform-only enforcement and sanitized DTOs", async () => {
    const superAdmin = identity(ids.superAdminA, ids.platformTenant, "SUPER_ADMIN");
    const admin = identity(ids.companyAdminA, ids.tenantA, "COMPANY_ADMIN");
    const freePackage = packageDoc(new Types.ObjectId(), "Free", "free", 1, "", "");
    freePackage.monthlyPrice = 0;
    freePackage.annualPrice = 0;
    freePackage.stripeProductId = "";
    freePackage.versions[0].monthlyPrice = 0;
    freePackage.versions[0].annualPrice = 0;
    freePackage.versions[0].stripeProductId = "";
    await PackageModel.create(freePackage);

    const firstEligibilityId = await createRefundEligibility(admin.token, ids.invoiceA);
    const requested = await api("POST", "/billing/refund-requests", admin.token, {
      previewId: firstEligibilityId,
      idempotencyKey: "refund-platform-list-001",
    });
    const requestedBody = await requested.json();
    const refundId = String(requestedBody.data.refund.id);
    // Self-serve refunds inside the 7-day window auto-execute without admin
    // confirmation, so the platform confirm route must reject them.
    expect(requestedBody.data.refund.status).toBe("SUCCEEDED");

    // Historical requested refunds remain reviewable even though new customer
    // requests reserve the invoice's entire system-calculated balance. The
    // reviewable refund targets its own invoice because the auto-executed
    // refund above already consumed invoiceA's balance.
    const reviewInvoiceId = new Types.ObjectId();
    await InvoiceModel.create({
      _id: reviewInvoiceId,
      tenantId: ids.tenantA,
      subscriptionId: ids.subscriptionA,
      provider: "fake",
      providerInvoiceId: "in_review_fixture",
      paymentReference: "ch_review_fixture",
      invoiceNumber: "INV-REVIEW-1",
      status: "paid",
      currency: "USD",
      amountDueMinor: 500,
      amountPaidMinor: 500,
      amountRemainingMinor: 0,
      refundedAmountMinor: 0,
      reservedRefundAmountMinor: 25,
      subtotalMinor: 500,
      taxMinor: 0,
      createdAtProvider: recentPaidAt,
      dueAt: null,
      paidAt: recentPaidAt,
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2099-08-01T00:00:00.000Z"),
      synchronizedAt: recentPaidAt,
      providerVersion: "v1",
    });
    fakeProvider.seedInvoice({
      id: "in_review_fixture",
      customerId: "cus_tenant_a",
      subscriptionId: "sub_tenant_a",
      paymentReference: "ch_review_fixture",
      number: "INV-REVIEW-1",
      status: "paid",
      currency: "USD",
      amountDueMinor: 500,
      amountPaidMinor: 500,
      amountRemainingMinor: 0,
      refundedAmountMinor: 0,
      subtotalMinor: 500,
      taxMinor: 0,
      createdAt: recentPaidAt,
      dueAt: null,
      paidAt: recentPaidAt,
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2099-08-01T00:00:00.000Z"),
      providerVersion: "v1",
    });
    const reviewableRefundId = await seedRequestedRefund(String(ids.companyAdminA), {
      invoiceId: reviewInvoiceId,
      paymentReference: "ch_review_fixture",
    });

    const list = await api("GET", `/super-admin/refunds?page=1&pageSize=10&tenantId=${ids.tenantA}`, superAdmin.token);
    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody.data.refunds).toHaveLength(2);
    expect(JSON.stringify(listBody)).not.toMatch(/providerRefundId|paymentReference|cus_|re_/i);

    const detail = await api("GET", `/super-admin/refunds/${refundId}`, superAdmin.token);
    expect(detail.status).toBe(200);

    const confirm = await api("POST", `/super-admin/refunds/${refundId}/confirm`, superAdmin.token, {});
    expect(confirm.status).toBe(409);

    const confirmReviewable = await api("POST", `/super-admin/refunds/${reviewableRefundId}/confirm`, superAdmin.token, {});
    expect(confirmReviewable.status).toBe(200);
    expect((await confirmReviewable.json()).data.refund.status).toBe("PROVIDER_PENDING");

    const rejectedRefundId = await seedRequestedRefund(String(ids.companyAdminA));
    const reject = await api("POST", `/super-admin/refunds/${rejectedRefundId}/reject`, superAdmin.token, { reason: "policy decision" });
    expect(reject.status).toBe(200);
    expect((await reject.json()).data.status).toBe("REJECTED");

    const retryRefundId = await seedRetryableRefund();
    fakeProvider.shouldTimeoutNextOperation = false;
    const retry = await api("POST", `/super-admin/refunds/${retryRefundId}/retry`, superAdmin.token, {});
    expect(retry.status).toBe(200);
    expect((await retry.json()).data.status).toBe("PROVIDER_PENDING");

    const reconcile = await api("POST", `/super-admin/reconciliation/invoices/${ids.tenantA}`, superAdmin.token, {});
    expect(reconcile.status).toBe(200);
    const reconcileBody = await reconcile.json();
    expect(reconcileBody.data).toMatchObject({
      examined: expect.any(Number),
      created: expect.any(Number),
      updated: expect.any(Number),
      unchanged: expect.any(Number),
      failed: expect.any(Number),
    });

    const diagnostics = await api("POST", "/super-admin/reconciliation/subscriptions", superAdmin.token, {});
    expect(diagnostics.status).toBe(200);
    expect((await diagnostics.json()).data).toMatchObject({
      subscriptions: { examined: expect.any(Number), mismatched: expect.any(Array) },
      invoices: { examined: expect.any(Number), created: expect.any(Number), updated: expect.any(Number), failed: expect.any(Number) },
      refundSettlements: {
        examined: expect.any(Number),
        eligibleForTransitionRepair: expect.any(Number),
        transitionsCompleted: expect.any(Number),
        transitionsRetryable: expect.any(Number),
        failed: expect.any(Number),
      },
      providerCancellations: { created: expect.any(Number), confirmed: expect.any(Number), retryable: expect.any(Number) },
    });
    expect(JSON.stringify(reconcileBody)).not.toMatch(/providerInvoiceId|providerCustomerId|cus_|in_/i);
  });

  it("enforces platform-only billing routes, requester-confirmation separation, and safe validation responses", async () => {
    const superAdmin = identity(ids.superAdminA, ids.platformTenant, "SUPER_ADMIN");
    const tenantAdmin = identity(ids.companyAdminA, ids.tenantA, "COMPANY_ADMIN");

    const tenantDenied = await api("GET", "/super-admin/refunds?page=1&pageSize=10", tenantAdmin.token);
    expect(tenantDenied.status).toBe(403);

    const invalidFilter = await api("GET", "/super-admin/refunds?page=1&pageSize=200", superAdmin.token);
    expect(invalidFilter.status).toBe(400);

    const invalidTenantTarget = await api("POST", `/super-admin/reconciliation/invoices/not-an-id`, superAdmin.token, {});
    expect(invalidTenantTarget.status).toBe(404);

    const selfRequestedRefundId = await seedRequestedRefund(String(ids.superAdminA));
    const selfConfirm = await api("POST", `/super-admin/refunds/${selfRequestedRefundId}/confirm`, superAdmin.token, {});
    expect(selfConfirm.status).toBe(403);
    expect((await selfConfirm.json()).error.code).toBe("BILLING_OPERATION_NOT_ALLOWED");

    const foreignRefund = await api("GET", `/super-admin/refunds/${new Types.ObjectId()}`, superAdmin.token);
    expect(foreignRefund.status).toBe(404);
  });
});

function identity(userId: Types.ObjectId, tenantId: Types.ObjectId, role: Identity["role"]): Identity {
  return {
    tenantId: String(tenantId),
    userId: String(userId),
    role,
    token: signJwt({
      sub: String(userId),
      tenantId: String(tenantId),
      role,
      email: `${String(userId)}@test.invalid`,
      type: "access",
    }, config.JWT_SECRET, "5m"),
  };
}

async function seedBaseState() {
  await TenantModel.create([
    { _id: ids.platformTenant, name: "Platform", slug: PLATFORM_TENANT_SLUG, status: "active", plan: "pro", isSystemTenant: true },
    { _id: ids.tenantA, name: "Tenant A", slug: "tenant-a", status: "active", plan: "pro", isSystemTenant: false },
    { _id: ids.tenantB, name: "Tenant B", slug: "tenant-b", status: "active", plan: "pro", isSystemTenant: false },
  ]);

  await UserModel.insertMany([
    userDoc(ids.superAdminA, ids.platformTenant, "SUPER_ADMIN", "sa-a@test.invalid"),
    userDoc(ids.companyAdminA, ids.tenantA, "COMPANY_ADMIN", "admin-a@test.invalid"),
    userDoc(ids.companyAdminB, ids.tenantB, "COMPANY_ADMIN", "admin-b@test.invalid"),
    userDoc(ids.employeeA, ids.tenantA, "EMPLOYEE", "employee-a@test.invalid"),
    { ...userDoc(ids.employeeReadA, ids.tenantA, "EMPLOYEE", "employee-read@test.invalid"), customRoleId: null },
  ]);

  const billingReadRole = await RoleModel.create({
    tenantId: ids.tenantA,
    name: "Billing Reader",
    normalizedName: "billing reader",
    baseRole: "EMPLOYEE",
    grants: [{ permission: Permission.BILLING_READ }],
    contractVersion: PERMISSION_CONTRACT_VERSION,
    status: "active",
    version: 1,
    createdBy: ids.companyAdminA,
    updatedBy: ids.companyAdminA,
    migrationState: "complete",
  });
  await UserModel.updateOne({ _id: ids.employeeReadA }, { $set: { customRoleId: billingReadRole._id } }).exec();

  await PackageModel.insertMany([
    packageDoc(ids.packageBasic, "Basic", "basic", 1, "price_basic_monthly", "price_basic_annual"),
    packageDoc(ids.packagePro, "Pro", "pro", 2, "price_pro_monthly", "price_pro_annual"),
  ]);

  await SubscriptionModel.create({
    _id: ids.subscriptionA,
    tenantId: ids.tenantA,
    packageId: ids.packageBasic,
    packageVersion: 1,
    status: "ACTIVE",
    startedAt: new Date("2026-07-01T00:00:00.000Z"),
    periodStart: new Date("2026-07-01T00:00:00.000Z"),
    periodEnd: new Date("2099-08-01T00:00:00.000Z"),
    currentPeriodStart: new Date("2026-07-01T00:00:00.000Z"),
    currentPeriodEnd: new Date("2099-08-01T00:00:00.000Z"),
    cancelAtPeriodEnd: false,
    providerCustomerId: "cus_tenant_a",
    providerSubscriptionId: "sub_tenant_a",
    providerPriceId: "price_basic_monthly",
    provider: "fake",
    billingInterval: "monthly",
    paymentState: "paid",
    revision: 3,
  });

  await InvoiceModel.create({
    _id: ids.invoiceA,
    tenantId: ids.tenantA,
    subscriptionId: ids.subscriptionA,
    provider: "fake",
    providerInvoiceId: "in_tenant_a_1",
    paymentReference: "ch_tenant_a_1",
    invoiceNumber: "INV-A-1",
    status: "paid",
    currency: "USD",
    amountDueMinor: 1000,
    amountPaidMinor: 1000,
    amountRemainingMinor: 0,
    refundedAmountMinor: 0,
    reservedRefundAmountMinor: 0,
    subtotalMinor: 1000,
    taxMinor: 0,
    createdAtProvider: recentPaidAt,
    dueAt: null,
    paidAt: recentPaidAt,
    periodStart: new Date("2026-07-01T00:00:00.000Z"),
    periodEnd: new Date("2099-08-01T00:00:00.000Z"),
    synchronizedAt: recentPaidAt,
    hostedInvoiceUrl: "https://invoice.stripe.com/i/test_a",
    invoicePdfUrl: "https://pay.stripe.com/invoice/test_a.pdf",
    receiptUrl: "https://pay.stripe.com/receipts/test_a",
    hostedInvoiceAvailable: true,
    invoicePdfAvailable: true,
    receiptAvailable: true,
    providerVersion: "v1",
  });

  fakeProvider.seedSubscription({
    id: "sub_tenant_a",
    customerId: "cus_tenant_a",
    status: "active",
    metadata: {
      tenantId: String(ids.tenantA),
      packageId: String(ids.packageBasic),
      packageVersion: "1",
      billingInterval: "monthly",
    },
    priceId: "price_basic_monthly",
    currentPeriodStart: new Date("2026-07-01T00:00:00.000Z"),
    currentPeriodEnd: new Date("2099-08-01T00:00:00.000Z"),
    cancelAtPeriodEnd: false,
  });
  fakeProvider.seedInvoice({
    id: "in_tenant_a_1",
    customerId: "cus_tenant_a",
    subscriptionId: "sub_tenant_a",
    paymentReference: "ch_tenant_a_1",
    number: "INV-A-1",
    status: "paid",
    currency: "USD",
    amountDueMinor: 1000,
    amountPaidMinor: 1000,
    amountRemainingMinor: 0,
    refundedAmountMinor: 0,
    subtotalMinor: 1000,
    taxMinor: 0,
    createdAt: recentPaidAt,
    dueAt: null,
    paidAt: recentPaidAt,
    periodStart: new Date("2026-07-01T00:00:00.000Z"),
    periodEnd: new Date("2099-08-01T00:00:00.000Z"),
    providerVersion: "v1",
  }, {
    hostedInvoiceUrl: "https://invoice.stripe.com/i/test_a",
    invoicePdfUrl: "https://pay.stripe.com/invoice/test_a.pdf",
    receiptUrl: "https://pay.stripe.com/receipts/test_a",
  });
}

function userDoc(id: Types.ObjectId, tenantId: Types.ObjectId, role: Identity["role"], email: string) {
  return {
    _id: id,
    tenantId,
    name: email,
    email,
    passwordHash: secretPasswordHash,
    role,
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date("2026-07-01T00:00:00.000Z"),
    permissionBaseline: "standard",
    roleMigrationState: "complete",
    sessionGuardVersion: 0,
  };
}

function packageDoc(id: Types.ObjectId, name: string, code: string, version: number, monthly: string, annual: string) {
  return {
    _id: id,
    name,
    code,
    description: `${name} package`,
    active: true,
    version,
    monthlyPrice: version * 1000,
    annualPrice: version * 10000,
    currency: "USD",
    trialDays: 14,
    visibility: "public" as const,
    supportedModels: ["basic"],
    analyticsLevel: "basic" as const,
    retentionDays: 30,
    supportLevel: "standard" as const,
    stripeProductId: `prod_${code}`,
    stripePriceId: monthly,
    stripeAnnualPriceId: annual,
    entitlements: {
      employees: 5 * version,
      admins: 2,
      documents: 100 * version,
      storageMb: 1024 * version,
      fileSizeMb: 20,
      queriesPerMonth: 1000 * version,
      tokensPerMonth: 10000 * version,
      ocrPagesPerMonth: 100 * version,
    },
    versions: [{
      _id: new Types.ObjectId(),
      version,
      name,
      code,
      description: `${name} package`,
      monthlyPrice: version * 1000,
      annualPrice: version * 10000,
      currency: "USD",
      trialDays: 14,
      visibility: "public" as const,
      supportedModels: ["basic"],
      analyticsLevel: "basic" as const,
      retentionDays: 30,
      supportLevel: "standard" as const,
      stripeProductId: `prod_${code}`,
      stripePriceId: monthly,
      stripeAnnualPriceId: annual,
      entitlements: {
        employees: 5 * version,
        admins: 2,
        documents: 100 * version,
        storageMb: 1024 * version,
        fileSizeMb: 20,
        queriesPerMonth: 1000 * version,
        tokensPerMonth: 10000 * version,
        ocrPagesPerMonth: 100 * version,
      },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    }],
  };
}

async function seedRetryableRefund(): Promise<string> {
  const retryInvoiceId = new Types.ObjectId();
  await InvoiceModel.create({
    _id: retryInvoiceId,
    tenantId: ids.tenantA,
    subscriptionId: ids.subscriptionA,
    provider: "fake",
    providerInvoiceId: "in_retry_fixture",
    paymentReference: "ch_retry_fixture",
    invoiceNumber: "INV-RETRY-1",
    status: "paid",
    currency: "USD",
    amountDueMinor: 500,
    amountPaidMinor: 500,
    amountRemainingMinor: 0,
    refundedAmountMinor: 0,
    reservedRefundAmountMinor: 75,
    subtotalMinor: 500,
    taxMinor: 0,
    createdAtProvider: new Date("2026-07-02T00:00:00.000Z"),
    paidAt: new Date("2026-07-02T00:00:00.000Z"),
    periodStart: new Date("2026-07-01T00:00:00.000Z"),
    periodEnd: new Date("2099-08-01T00:00:00.000Z"),
    synchronizedAt: new Date("2026-07-02T00:00:00.000Z"),
    providerVersion: "v1",
  });
  fakeProvider.seedInvoice({
    id: "in_retry_fixture",
    customerId: "cus_tenant_a",
    subscriptionId: "sub_tenant_a",
    paymentReference: "ch_retry_fixture",
    number: "INV-RETRY-1",
    status: "paid",
    currency: "USD",
    amountDueMinor: 500,
    amountPaidMinor: 500,
    amountRemainingMinor: 0,
    refundedAmountMinor: 0,
    subtotalMinor: 500,
    taxMinor: 0,
    createdAt: new Date("2026-07-02T00:00:00.000Z"),
    dueAt: null,
    paidAt: new Date("2026-07-02T00:00:00.000Z"),
    periodStart: new Date("2026-07-01T00:00:00.000Z"),
    periodEnd: new Date("2099-08-01T00:00:00.000Z"),
    providerVersion: "v1",
  });
  const operationId = new Types.ObjectId();
  await BillingOperationModel.create({
    _id: operationId,
    tenantId: ids.tenantA,
    actorId: ids.companyAdminA,
    actorRole: "COMPANY_ADMIN",
    operationType: "REFUND",
    status: "RETRY_PENDING",
    subscriptionId: ids.subscriptionA,
    requestFingerprint: "a".repeat(64),
    idempotencyKeyHash: "b".repeat(64),
    provider: "fake",
    retryCount: 1,
    nextRetryAt: new Date("2026-07-29T01:00:00.000Z"),
    failureCode: "BILLING_PROVIDER_UNAVAILABLE",
  });
  const refund = await RefundModel.create({
    tenantId: ids.tenantA,
    invoiceId: retryInvoiceId,
    paymentReference: "ch_retry_fixture",
    subscriptionId: ids.subscriptionA,
    operationId,
    amountMinor: 75,
    currency: "USD",
    reason: "customer_request",
    requestedBy: ids.companyAdminA,
    confirmedBy: ids.superAdminA,
    requestedAt: new Date("2026-07-29T00:00:00.000Z"),
    confirmedAt: new Date("2026-07-29T00:10:00.000Z"),
    provider: "fake",
    status: "RETRY_PENDING",
    failureCode: "BILLING_PROVIDER_UNAVAILABLE",
  });
  return String(refund._id);
}

async function seedRequestedRefund(
  requestedBy: string,
  target: { invoiceId: Types.ObjectId; paymentReference: string } = { invoiceId: ids.invoiceA, paymentReference: "ch_tenant_a_1" },
): Promise<string> {
  const operationId = new Types.ObjectId();
  const actorRole = requestedBy === String(ids.superAdminA) ? "SUPER_ADMIN" : "COMPANY_ADMIN";
  await BillingOperationModel.create({
    _id: operationId,
    tenantId: ids.tenantA,
    actorId: new Types.ObjectId(requestedBy),
    actorRole,
    operationType: "REFUND",
    status: "REQUESTED",
    subscriptionId: ids.subscriptionA,
    requestFingerprint: "c".repeat(64),
    idempotencyKeyHash: String(operationId).padEnd(64, "d"),
    provider: "fake",
  });
  const refund = await RefundModel.create({
    tenantId: ids.tenantA,
    invoiceId: target.invoiceId,
    paymentReference: target.paymentReference,
    subscriptionId: ids.subscriptionA,
    operationId,
    amountMinor: 25,
    currency: "USD",
    reason: "customer_request",
    requestedBy: new Types.ObjectId(requestedBy),
    provider: "fake",
    status: "REQUESTED",
  });
  return String(refund._id);
}

async function api(method: string, path: string, token?: string, body?: Record<string, unknown>) {
  const port = (server.address() as { port: number }).port;
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function createRefundEligibility(token: string, invoiceId: Types.ObjectId): Promise<string> {
  const response = await api("POST", "/billing/refund-eligibility-previews", token, {
    invoiceId: String(invoiceId),
  });
  expect(response.status).toBe(200);
  return String((await response.json()).data.id);
}
