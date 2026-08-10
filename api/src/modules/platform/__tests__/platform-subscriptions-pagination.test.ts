import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

process.env.NODE_ENV = "test";

import { connectDB, disconnectDB } from "../../../db/connection.js";
import TenantModel from "../../../db/models/tenant.model.js";
import UserModel from "../../../db/models/user.model.js";
import PackageModel from "../../../db/models/package.model.js";
import SubscriptionModel from "../../../db/models/subscription.model.js";
import { PLATFORM_TENANT_SLUG } from "../../../common/auth/platformTenant.js";
import { listSubscriptions } from "../platform.service.js";
import { listSchema, parse } from "../platform.validator.js";
import type { OperationAuthorizationContext } from "../../permissions/permissions.operation.js";
import type { SubscriptionStatus } from "../../../db/models/subscription.model.js";

// ─── Seed helpers ────────────────────────────────────────────────────────────

const TENANTS = [
  { key: "acme", name: "Acme Corp", slug: "acme", updatedAt: "2026-08-10T00:00:00.000Z" },
  { key: "initech", name: "Initech", slug: "initech", updatedAt: "2026-08-09T00:00:00.000Z" },
  { key: "globex", name: "Globex Ltd", slug: "globex", updatedAt: "2026-08-08T00:00:00.000Z" },
  { key: "umbrella", name: "Umbrella Co", slug: "umbrella", updatedAt: "2026-08-07T00:00:00.000Z" },
  { key: "acme-ind", name: "Acme Industries", slug: "acme-ind", updatedAt: "2026-08-06T00:00:00.000Z" },
] as const;

const SUB_STATUS: Record<string, SubscriptionStatus> = {
  acme: "ACTIVE",
  initech: "ACTIVE",
  globex: "PAUSED",
  umbrella: "CANCELED",
  "acme-ind": "TRIALING",
};

const PERIOD_START = "2026-07-01T00:00:00.000Z";
const PERIOD_END = "2026-08-01T00:00:00.000Z";

let platformTenant: InstanceType<typeof TenantModel>;
let context: OperationAuthorizationContext;
const tenantIds = new Map<string, string>();
const subscriptionIds = new Map<string, string>();

before(async () => {
  await connectDB();
});

beforeEach(async () => {
  await Promise.all([
    TenantModel.deleteMany({}),
    UserModel.deleteMany({}),
    PackageModel.deleteMany({}),
    SubscriptionModel.deleteMany({}),
  ]);

  platformTenant = await TenantModel.create({
    name: "DocuMind Platform",
    slug: PLATFORM_TENANT_SLUG,
    status: "active",
    plan: "free",
    isSystemTenant: true,
  });
  const superAdmin = await UserModel.create({
    tenantId: platformTenant._id,
    name: "Platform Admin",
    email: "platform-admin@documind.test",
    passwordHash: "test-only-hash",
    role: "SUPER_ADMIN",
    status: "active",
    emailVerified: true,
  });
  context = {
    tenantId: platformTenant._id.toString(),
    actorId: superAdmin._id.toString(),
    actorEmail: superAdmin.email,
    actorRole: "SUPER_ADMIN",
  };

  const packageDoc = await PackageModel.create({
    name: "Professional",
    code: "pro-2026",
    monthlyPrice: 4900,
    entitlements: {
      employees: 25,
      admins: 3,
      documents: 1000,
      storageMb: 10240,
      fileSizeMb: 20,
      queriesPerMonth: 5000,
      tokensPerMonth: 100000,
      ocrPagesPerMonth: 500,
    },
  });

  const tenants = await Promise.all(
    TENANTS.map(({ name, slug }) =>
      TenantModel.create({ name, slug, status: "active", plan: "free" }),
    ),
  );
  for (const [index, tenant] of tenants.entries()) {
    tenantIds.set(TENANTS[index].key, tenant._id.toString());
  }

  // Insert subscriptions through the raw collection so `timestamps` middleware
  // cannot overwrite the distinct `updatedAt` values the sort order depends on.
  const inserted = await SubscriptionModel.collection.insertMany(
    TENANTS.map(({ key, updatedAt }, index) => ({
      tenantId: new mongoose.Types.ObjectId(tenants[index].id),
      packageId: new mongoose.Types.ObjectId(packageDoc._id.toString()),
      packageVersion: packageDoc.version,
      status: SUB_STATUS[key],
      startedAt: new Date(PERIOD_START),
      periodStart: new Date(PERIOD_START),
      periodEnd: new Date(PERIOD_END),
      revision: 1,
      paymentState: "pending",
      provider: "",
      providerCustomerId: key === "acme" ? "cus_platform_test" : "",
      providerSubscriptionId: "",
      providerPriceId: "",
      providerMetadata: {},
      adminOperations: [],
      createdAt: new Date(updatedAt),
      updatedAt: new Date(updatedAt),
    })),
  );
  for (const [index, tenant] of TENANTS.entries()) {
    subscriptionIds.set(tenant.key, String(inserted.insertedIds[index]));
  }
});

after(async () => {
  await disconnectDB();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

test("returns the full list with default page/pageSize when no params are supplied", async () => {
  const defaults = parse(listSchema, {});
  assert.deepEqual(defaults, { page: 1, pageSize: 20 });

  const result = await listSubscriptions(defaults, context);
  assert.equal(result.subscriptions.length, TENANTS.length);
  assert.deepEqual(result.pagination, {
    page: 1,
    pageSize: 20,
    totalRecords: TENANTS.length,
    totalPages: 1,
  });
});

test("slices subscriptions by page and pageSize, newest updatedAt first", async () => {
  const firstPage = await listSubscriptions({ page: 1, pageSize: 2 }, context);
  assert.deepEqual(
    firstPage.subscriptions.map((sub) => String(sub._id)),
    [subscriptionIds.get("acme"), subscriptionIds.get("initech")],
  );
  assert.deepEqual(firstPage.pagination, {
    page: 1,
    pageSize: 2,
    totalRecords: TENANTS.length,
    totalPages: 3,
  });

  const secondPage = await listSubscriptions({ page: 2, pageSize: 2 }, context);
  assert.deepEqual(
    secondPage.subscriptions.map((sub) => String(sub._id)),
    [subscriptionIds.get("globex"), subscriptionIds.get("umbrella")],
  );
  assert.deepEqual(secondPage.pagination, {
    page: 2,
    pageSize: 2,
    totalRecords: TENANTS.length,
    totalPages: 3,
  });

  const thirdPage = await listSubscriptions({ page: 3, pageSize: 2 }, context);
  assert.deepEqual(
    thirdPage.subscriptions.map((sub) => String(sub._id)),
    [subscriptionIds.get("acme-ind")],
  );
  assert.deepEqual(thirdPage.pagination, {
    page: 3,
    pageSize: 2,
    totalRecords: TENANTS.length,
    totalPages: 3,
  });

  const pastEnd = await listSubscriptions({ page: 4, pageSize: 2 }, context);
  assert.deepEqual(pastEnd.subscriptions, []);
  assert.deepEqual(pastEnd.pagination, {
    page: 4,
    pageSize: 2,
    totalRecords: TENANTS.length,
    totalPages: 3,
  });
});

test("searches subscriptions by tenant name case-insensitively", async () => {
  const result = await listSubscriptions(
    { page: 1, pageSize: 20, search: "acme" },
    context,
  );
  assert.deepEqual(
    result.subscriptions.map((sub) => String(sub._id)),
    [subscriptionIds.get("acme"), subscriptionIds.get("acme-ind")],
  );
  assert.deepEqual(result.pagination, {
    page: 1,
    pageSize: 20,
    search: "acme",
    totalRecords: 2,
    totalPages: 1,
  });

  const upperResult = await listSubscriptions(
    { page: 1, pageSize: 20, search: "ACME" },
    context,
  );
  assert.equal(upperResult.subscriptions.length, 2);
});

test("searches subscriptions by tenant slug case-insensitively", async () => {
  const result = await listSubscriptions(
    { page: 1, pageSize: 20, search: "globex" },
    context,
  );
  assert.deepEqual(
    result.subscriptions.map((sub) => String(sub._id)),
    [subscriptionIds.get("globex")],
  );
  assert.equal(result.pagination.totalRecords, 1);

  const upperResult = await listSubscriptions(
    { page: 1, pageSize: 20, search: "GLOBEX" },
    context,
  );
  assert.deepEqual(
    upperResult.subscriptions.map((sub) => String(sub._id)),
    [subscriptionIds.get("globex")],
  );
});

test("returns an empty envelope fast when search matches no tenant", async () => {
  const result = await listSubscriptions(
    { page: 1, pageSize: 20, search: "no-such-tenant" },
    context,
  );
  assert.deepEqual(result, {
    subscriptions: [],
    pagination: {
      page: 1,
      pageSize: 20,
      search: "no-such-tenant",
      totalRecords: 0,
      totalPages: 0,
    },
  });
});

test("filters by lowercase status input", async () => {
  const result = await listSubscriptions(
    { page: 1, pageSize: 20, status: "active" },
    context,
  );
  assert.deepEqual(
    result.subscriptions.map((sub) => String(sub._id)),
    [subscriptionIds.get("acme"), subscriptionIds.get("initech")],
  );
  assert.deepEqual(result.pagination, {
    page: 1,
    pageSize: 20,
    status: "active",
    totalRecords: 2,
    totalPages: 1,
  });
});

test("combines status filter and tenant search", async () => {
  const result = await listSubscriptions(
    { page: 1, pageSize: 20, search: "acme", status: "active" },
    context,
  );
  assert.deepEqual(
    result.subscriptions.map((sub) => String(sub._id)),
    [subscriptionIds.get("acme")],
  );
  assert.equal(result.pagination.totalRecords, 1);
});

test("keeps the legacy subscription item shape after paging", async () => {
  const result = await listSubscriptions({ page: 1, pageSize: 20 }, context);
  const acme = result.subscriptions.find(
    (sub) => String(sub._id) === subscriptionIds.get("acme"),
  );
  assert.ok(acme, "acme subscription is on the first page");

  const tenant = acme.tenantId as { name: string; slug: string; status: string };
  assert.equal(tenant.name, "Acme Corp");
  assert.equal(tenant.slug, "acme");
  assert.equal(tenant.status, "active");

  const pkg = acme.packageId as {
    name: string;
    code: string;
    version: number;
    monthlyPrice: number;
    currency: string;
    entitlements: Record<string, number>;
  };
  assert.equal(pkg.name, "Professional");
  assert.equal(pkg.code, "pro-2026");
  assert.equal(pkg.version, 1);
  assert.equal(pkg.monthlyPrice, 4900);
  assert.equal(pkg.currency, "USD");
  assert.equal(pkg.entitlements.employees, 25);

  assert.equal(acme.status, "active");
  assert.equal(acme.version, 1);
  assert.equal(acme.providerManaged, true);
  assert.deepEqual(acme.providerState, {
    hasCustomer: true,
    hasSubscription: false,
    hasPrice: false,
  });
  assert.equal(new Date(acme.currentPeriodStart as string).toISOString(), PERIOD_START);
  assert.equal(new Date(acme.currentPeriodEnd as string).toISOString(), PERIOD_END);

  for (const hidden of [
    "providerCustomerId",
    "providerSubscriptionId",
    "providerPriceId",
    "providerMetadata",
    "adminOperations",
  ]) {
    assert.equal(hidden in acme, false, `item must not expose ${hidden}`);
  }
});
