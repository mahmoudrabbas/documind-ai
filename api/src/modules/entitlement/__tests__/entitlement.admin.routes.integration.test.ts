import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { readFile } from "node:fs/promises";
import express from "express";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import TenantModel from "../../../db/models/tenant.model.js";
import UserModel from "../../../db/models/user.model.js";
import QuotaOverrideModel from "../../../db/models/quotaOverride.model.js";
import AuditLogModel from "../../../db/models/auditLog.model.js";
import RoleModel from "../../../db/models/role.model.js";
import entitlementAdminRoutes from "../entitlement.admin.routes.js";
import { errorHandlerMiddleware } from "../../../common/middlewares/errorHandler.middleware.js";
import { PLATFORM_TENANT_SLUG } from "../../../common/auth/platformTenant.js";
import { signJwt } from "../../auth/jwtTokens.js";
import { config } from "../../../config/index.js";
import { setAuditWriter } from "../../../common/observability/index.js";
import { authenticate } from "../../../common/middlewares/authenticate.middleware.js";
import { requirePermission } from "../../permissions/permissions.middleware.js";
import { Permission } from "../../permissions/permissions.catalog.js";

process.env.NODE_ENV = "test";

let mongoServer: MongoMemoryReplSet | null = null;
let server: Server;
let port = 0;
let platformTenantId = "";
let platformAdminId = "";
let customerTenantId = "";
let otherCustomerTenantId = "";
let companyAdminId = "";
let employeeId = "";

function token(userId: string, tenantId: string, role: "SUPER_ADMIN" | "COMPANY_ADMIN" | "EMPLOYEE") {
  return signJwt(
    { sub: userId, tenantId, role, email: `${userId}@test.invalid`, type: "access" },
    config.JWT_SECRET,
    "1h",
  );
}

function auth(userId: string, tenantId: string, role: "SUPER_ADMIN" | "COMPANY_ADMIN" | "EMPLOYEE", json = false) {
  return {
    authorization: `Bearer ${token(userId, tenantId, role)}`,
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

async function createUser(tenantId: string, role: "SUPER_ADMIN" | "COMPANY_ADMIN" | "EMPLOYEE", email: string, permissionBaseline: "standard" | "legacy-none" = "standard") {
  return UserModel.create({
    tenantId,
    name: `${role} Test User`,
    email,
    passwordHash: "test-password-hash",
    role,
    permissionBaseline,
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
}

before(async () => {
  mongoServer = await MongoMemoryReplSet.create({
    binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
    replSet: { count: 1 },
  });
  await mongoose.connect(mongoServer.getUri(), { dbName: "entitlement-admin-routes-test" });

  const app = express();
  app.use(express.json());
  app.get(
    "/missing-context",
    authenticate,
    requirePermission(Permission.BILLING_MANAGE),
    (_req, res) => res.status(200).json({ success: true }),
  );
  app.use("/super-admin/entitlement", entitlementAdminRoutes);
  app.use(errorHandlerMiddleware);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  port = (server.address() as AddressInfo).port;
});

beforeEach(async () => {
  await Promise.all([
    QuotaOverrideModel.deleteMany({}),
    AuditLogModel.deleteMany({}),
    RoleModel.deleteMany({}),
    UserModel.deleteMany({}),
    TenantModel.deleteMany({}),
  ]);
  setAuditWriter(null);

  const [platformTenant, customerTenant, otherCustomerTenant] = await Promise.all([
    TenantModel.create({ name: "DocuMind Platform", slug: PLATFORM_TENANT_SLUG, status: "active", plan: "free", isSystemTenant: true }),
    TenantModel.create({ name: "Customer A", slug: "entitlement-customer-a", status: "active", plan: "free" }),
    TenantModel.create({ name: "Customer B", slug: "entitlement-customer-b", status: "active", plan: "free" }),
  ]);
  platformTenantId = platformTenant.id;
  customerTenantId = customerTenant.id;
  otherCustomerTenantId = otherCustomerTenant.id;

  const [platformAdmin, companyAdmin, employee] = await Promise.all([
    createUser(platformTenantId, "SUPER_ADMIN", "platform-admin@test.invalid"),
    createUser(customerTenantId, "COMPANY_ADMIN", "company-admin@test.invalid"),
    createUser(customerTenantId, "EMPLOYEE", "employee@test.invalid"),
  ]);
  platformAdminId = platformAdmin.id;
  companyAdminId = companyAdmin.id;
  employeeId = employee.id;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.closeAllConnections?.();
    server.close((error) => error ? reject(error) : resolve());
  });
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

test("AUTH-COR-003 — legitimate platform Super Admin reaches entitlement administration", async () => {
  const response = await fetch(`http://127.0.0.1:${port}/super-admin/entitlement/overrides`, {
    headers: auth(platformAdminId, platformTenantId, "SUPER_ADMIN"),
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { data: { overrides: unknown[] } };
  assert.deepEqual(body.data.overrides, []);
});

test("AUTH-COR-003 — customer Company Admin and employee remain denied", async () => {
  for (const [userId, role] of [[companyAdminId, "COMPANY_ADMIN"], [employeeId, "EMPLOYEE"]] as const) {
    const response = await fetch(`http://127.0.0.1:${port}/super-admin/entitlement/overrides`, {
      headers: auth(userId, customerTenantId, role),
    });
    assert.equal(response.status, 403);
  }
});

test("AUTH-COR-003 — a customer-tenant user corrupted to SUPER_ADMIN remains denied", async () => {
  await UserModel.updateOne({ _id: platformAdminId }, { $set: { tenantId: customerTenantId } });
  const response = await fetch(`http://127.0.0.1:${port}/super-admin/entitlement/overrides`, {
    headers: auth(platformAdminId, customerTenantId, "SUPER_ADMIN"),
  });
  assert.equal(response.status, 403);
});

test("AUTH-COR-003 — missing authentication remains denied", async () => {
  const response = await fetch(`http://127.0.0.1:${port}/super-admin/entitlement/overrides`);
  assert.equal(response.status, 401);
});

test("AUTH-COR-003 — requirePermission still fails closed without tenant or platform context", async () => {
  const response = await fetch(`http://127.0.0.1:${port}/missing-context`, {
    headers: auth(platformAdminId, platformTenantId, "SUPER_ADMIN"),
  });
  assert.equal(response.status, 401);
});

test("AUTH-COR-003 — platform identity without the billing permission remains denied", async () => {
  await UserModel.updateOne({ _id: platformAdminId }, { $set: { permissionBaseline: "legacy-none" } });
  const response = await fetch(`http://127.0.0.1:${port}/super-admin/entitlement/overrides`, {
    headers: auth(platformAdminId, platformTenantId, "SUPER_ADMIN"),
  });
  assert.equal(response.status, 403);
});

test("AUTH-COR-003 — platform authorization context remains distinct from the customer target", async () => {
  const response = await fetch(`http://127.0.0.1:${port}/super-admin/entitlement/overrides/${customerTenantId}`, {
    method: "PUT",
    headers: auth(platformAdminId, platformTenantId, "SUPER_ADMIN", true),
    body: JSON.stringify({ dimension: "documents", limit: 17, reason: "route context regression" }),
  });
  assert.equal(response.status, 200, await response.text());

  const [targetOverride, otherOverride, audit] = await Promise.all([
    QuotaOverrideModel.findOne({ tenantId: customerTenantId, dimension: "documents" }).lean().exec(),
    QuotaOverrideModel.findOne({ tenantId: otherCustomerTenantId, dimension: "documents" }).lean().exec(),
    AuditLogModel.findOne({ action: "QUOTA_OVERRIDE", resourceId: `${customerTenantId}:documents` }).lean().exec(),
  ]);
  assert.equal(targetOverride?.limit, 17);
  assert.equal(otherOverride, null);
  assert.equal(audit?.tenantId.toString(), platformTenantId);
  assert.equal(audit?.actorId?.toString(), platformAdminId);
});

test("AUTH-COR-003 — malformed target tenant IDs fail before an entitlement mutation", async () => {
  const response = await fetch(`http://127.0.0.1:${port}/super-admin/entitlement/overrides/not-an-object-id`, {
    method: "PUT",
    headers: auth(platformAdminId, platformTenantId, "SUPER_ADMIN", true),
    body: JSON.stringify({ dimension: "documents", limit: 17 }),
  });
  assert.equal(response.status, 400);
  assert.equal(await QuotaOverrideModel.countDocuments({}), 0);
});

test("AUTH-COR-003 — every entitlement admin route uses one canonical platform-and-permission chain", async () => {
  const source = await readFile(new URL("../entitlement.admin.routes.ts", import.meta.url), "utf8");
  assert.match(source, /router\.use\(authenticate, requirePlatformTenant\)/);
  assert.equal((source.match(/requirePermission\(Permission\.BILLING_MANAGE\)/g) ?? []).length, 5);
  for (const route of [
    '"/overrides"',
    '"/overrides/:tenantId"',
    '"/overrides/:tenantId/:dimension"',
    '"/reconcile"',
    '"/reconcile/reports"',
  ]) assert.ok(source.includes(route), `missing protected entitlement admin route ${route}`);

  const customerSource = await readFile(new URL("../entitlement.routes.ts", import.meta.url), "utf8");
  assert.match(customerSource, /router\.use\(authenticate, tenantScoping\)/);
  assert.equal(customerSource.includes("requirePlatformTenant"), false);
});
