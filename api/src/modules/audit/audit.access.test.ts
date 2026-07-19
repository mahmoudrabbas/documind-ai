import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import type { AddressInfo } from "node:net";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { config } from "../../config/index.js";
import type { BaseRole } from "../../common/auth/baseRoles.js";
import { AppError } from "../../common/errors/AppError.js";
import { InMemoryAuditWriter } from "../../common/observability/auditWriter.js";
import { setAuditWriter } from "../../common/observability/index.js";
import AuditLogModel from "../../db/models/auditLog.model.js";
import RoleModel from "../../db/models/role.model.js";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import { signJwt } from "../auth/jwtTokens.js";
import auditRoutes from "./audit.routes.js";
import {
  exportTenantAuditLogs,
  getTenantAuditLog,
  listPlatformAuditLogs,
  listTenantAuditLogs,
  type AuditOperationContext,
} from "./audit.service.js";

let mongo: MongoMemoryReplSet | null = null;
let auditWriter: InMemoryAuditWriter;

before(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "audit-access" });
  } else {
    mongo = await MongoMemoryReplSet.create({
      binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
      replSet: { count: 1 },
      instanceOpts: [{
        launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000),
      }],
    });
    await mongoose.connect(mongo.getUri(), { dbName: "audit-access" });
  }
});

beforeEach(async () => {
  await Promise.all([
    AuditLogModel.deleteMany({}),
    RoleModel.deleteMany({}),
    UserModel.deleteMany({}),
    TenantModel.deleteMany({}),
  ]);
  auditWriter = new InMemoryAuditWriter();
  setAuditWriter(auditWriter);
});

after(async () => {
  setAuditWriter(null);
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

async function fixture(slug: string) {
  const tenant = await TenantModel.create({
    name: `Audit ${slug}`,
    slug,
    status: "active",
    plan: "free",
  });
  const admin = await UserModel.create({
    tenantId: tenant._id,
    name: "Audit Admin",
    email: `shared-${slug}@example.test`,
    passwordHash: "test",
    role: "COMPANY_ADMIN",
    status: "active",
    emailVerified: true,
  });
  const employee = await UserModel.create({
    tenantId: tenant._id,
    name: "Audit Employee",
    email: `employee-${slug}@example.test`,
    passwordHash: "test",
    role: "EMPLOYEE",
    status: "active",
    emailVerified: true,
  });
  const context: AuditOperationContext = {
    tenantId: tenant.id,
    actorId: admin.id,
    actorEmail: admin.email,
    actorRole: admin.role,
    traceId: "audit-trace",
    requestId: "audit-request",
  };
  return { tenant, admin, employee, context };
}

async function createLog(
  tenantId: mongoose.Types.ObjectId,
  actorId: mongoose.Types.ObjectId,
  actorEmail: string,
  overrides: Record<string, unknown> = {},
) {
  return AuditLogModel.create({
    tenantId,
    userId: actorId,
    resourceType: "User",
    resourceId: "target-user",
    action: "USER_UPDATED",
    actorId,
    actorEmail,
    actorRole: "COMPANY_ADMIN",
    actorKind: "USER",
    changes: { status: { before: "active", after: "disabled" } },
    outcome: "SUCCESS",
    ...overrides,
  });
}

function tokenFor(user: {
  id: string;
  tenantId: mongoose.Types.ObjectId;
  role: BaseRole;
  email: string;
}) {
  return signJwt({
    sub: user.id,
    tenantId: user.tenantId.toString(),
    type: "access",
    role: user.role,
    email: user.email,
  }, config.JWT_SECRET, "15m");
}

async function createAuditServer() {
  const application = express();
  application.use(express.json());
  application.use("/audit", auditRoutes);
  application.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      const appError = error instanceof AppError
        ? error
        : new AppError(500, "INTERNAL_SERVER_ERROR", "Unexpected error");
      res.status(appError.statusCode).json({ error: { code: appError.code } });
    },
  );
  return new Promise<ReturnType<typeof application.listen>>((resolve) => {
    const server = application.listen(0, () => resolve(server));
  });
}

test("tenant audit route enforces authentication and effective permission", async () => {
  const first = await fixture("audit-route");
  await createLog(first.tenant._id, first.admin._id, first.admin.email);
  const server = await createAuditServer();
  try {
    const port = (server.address() as AddressInfo).port;
    assert.equal((await fetch(`http://127.0.0.1:${port}/audit/logs`)).status, 401);
    assert.equal((await fetch(`http://127.0.0.1:${port}/audit/logs`, {
      headers: { Authorization: `Bearer ${tokenFor(first.employee)}` },
    })).status, 403);
    const allowed = await fetch(`http://127.0.0.1:${port}/audit/logs`, {
      headers: { Authorization: `Bearer ${tokenFor(first.admin)}` },
    });
    assert.equal(allowed.status, 200);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()));
  }
});

test("service authorization uses persisted actor state and rejects disabled actors", async () => {
  const first = await fixture("audit-service");
  await createLog(first.tenant._id, first.admin._id, first.admin.email);
  const staleContext: AuditOperationContext = {
    ...first.context,
    actorEmail: "stale@example.test",
    actorRole: "EMPLOYEE",
  };
  assert.equal((await listTenantAuditLogs({}, staleContext)).logs.length, 1);

  await UserModel.updateOne(
    { _id: first.admin._id },
    { $set: { role: "EMPLOYEE" } },
  );
  await assert.rejects(
    listTenantAuditLogs({}, first.context),
    (error: unknown) =>
      error instanceof AppError && error.code === "PERMISSION_REQUIRED",
  );
  await UserModel.updateOne(
    { _id: first.admin._id },
    { $set: { role: "COMPANY_ADMIN", status: "disabled" } },
  );
  await assert.rejects(
    listTenantAuditLogs({}, first.context),
    (error: unknown) =>
      error instanceof AppError && error.code === "PERMISSION_REQUIRED",
  );
});

test("invalid custom-role audit grants and operator-shaped filters fail closed", async () => {
  const first = await fixture("audit-invalid-role");
  const roleId = new mongoose.Types.ObjectId();
  await RoleModel.collection.insertOne({
    _id: roleId,
    tenantId: first.tenant._id,
    name: "Invalid Audit Reader",
    normalizedName: "invalid audit reader",
    baseRole: "EMPLOYEE",
    grants: [{ permission: "audit:read" }],
    contractVersion: 1,
    status: "active",
    version: 1,
    createdBy: first.admin._id,
    updatedBy: first.admin._id,
    migrationState: "complete",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await UserModel.updateOne(
    { _id: first.employee._id },
    { $set: { customRoleId: roleId } },
  );
  await assert.rejects(
    listTenantAuditLogs({}, {
      tenantId: first.tenant.id,
      actorId: first.employee.id,
      actorEmail: first.employee.email,
      actorRole: first.employee.role,
    }),
    (error: unknown) =>
      error instanceof AppError && error.code === "PERMISSION_REQUIRED",
  );
  await assert.rejects(
    listTenantAuditLogs({
      action: { $ne: "USER_UPDATED" },
      tenantId: new mongoose.Types.ObjectId().toString(),
    }, first.context),
    (error: unknown) => error instanceof AppError && error.statusCode === 400,
  );
});

test("tenant list, count, and detail hide cross-tenant and platform records", async () => {
  const first = await fixture("audit-first");
  const second = await fixture("audit-second");
  const platform = await TenantModel.create({
    name: "Platform",
    slug: "documind.ai",
    status: "active",
    plan: "pro",
    isSystemTenant: true,
  });
  const local = await createLog(
    first.tenant._id,
    first.admin._id,
    "same@example.test",
  );
  const foreign = await createLog(
    second.tenant._id,
    second.admin._id,
    "same@example.test",
  );
  await createLog(platform._id, first.admin._id, "platform@example.test");

  const result = await listTenantAuditLogs({
    actorEmail: " SAME@EXAMPLE.TEST ",
  }, first.context);
  assert.equal(result.logs.length, 1);
  assert.equal(result.pagination.totalRecords, 1);
  assert.equal(result.logs[0]?.tenantId, first.tenant.id);
  assert.equal((await getTenantAuditLog({ id: local.id }, first.context)).log._id, local.id);
  await assert.rejects(
    getTenantAuditLog({ id: foreign.id }, first.context),
    (error: unknown) => error instanceof AppError && error.statusCode === 404,
  );
});

test("historical secrets are redacted and export is bounded and spreadsheet-safe", async () => {
  const first = await fixture("audit-redaction");
  await AuditLogModel.collection.insertOne({
    tenantId: first.tenant._id,
    userId: first.admin._id,
    resourceType: "User",
    resourceId: "=HYPERLINK(\"https://example.test\")",
    action: "USER_UPDATED",
    actorId: first.admin._id,
    actorEmail: first.admin.email,
    actorRole: "COMPANY_ADMIN",
    actorKind: "USER",
    changes: {
      password_hash: "legacy-password",
      safeState: "disabled",
    },
    metadata: {
      Authorization: "Bearer legacy-token",
      raw_body: "secret request",
      requestLabel: "+formula",
    },
    outcome: "SUCCESS",
    createdAt: new Date(),
  });

  const listed = await listTenantAuditLogs({}, first.context);
  assert.equal(listed.logs[0]?.changes.password_hash, "[Redacted]");
  assert.equal(listed.logs[0]?.metadata?.Authorization, "[Redacted]");
  assert.equal(listed.logs[0]?.metadata?.raw_body, "[Redacted]");
  assert.equal(listed.logs[0]?.changes.safeState, "disabled");

  const exported = await exportTenantAuditLogs({
    dateFrom: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  }, first.context);
  assert.equal(exported.logs[0]?.resourceId.startsWith("'="), true);
  assert.equal(
    String(exported.logs[0]?.metadata?.requestLabel).startsWith("'+"),
    true,
  );
  await assert.rejects(
    exportTenantAuditLogs({
      dateFrom: new Date(Date.now() - 32 * 24 * 60 * 60 * 1000).toISOString(),
    }, first.context),
    (error: unknown) => error instanceof AppError && error.statusCode === 400,
  );
});

test("reading audit logs does not create AUDIT_QUERIED events", async () => {
  const first = await fixture("audit-event");
  await createLog(first.tenant._id, first.admin._id, first.admin.email);
  await listTenantAuditLogs({ action: "USER_UPDATED" }, first.context);
  // Reading audit logs must NOT write any events — no self-auditing noise
  assert.equal(auditWriter.events.length, 0);
});

test("platform audit reads do not create AUDIT_QUERIED events", async () => {
  const platform = await TenantModel.create({
    name: "Platform",
    slug: "documind.ai",
    status: "active",
    plan: "pro",
    isSystemTenant: true,
  });
  const superAdmin = await UserModel.create({
    tenantId: platform._id,
    name: "Platform Admin",
    email: "platform-admin-noise@test.com",
    passwordHash: "test",
    role: "SUPER_ADMIN",
    status: "active",
    emailVerified: true,
  });
  const context: AuditOperationContext = {
    tenantId: platform.id,
    actorId: superAdmin.id,
    actorEmail: superAdmin.email,
    actorRole: superAdmin.role,
  };
  await listPlatformAuditLogs({ page: 1, pageSize: 20 }, context);
  assert.equal(auditWriter.events.length, 0);
});

test("audit export still writes AUDIT_EXPORTED event", async () => {
  const first = await fixture("audit-export");
  await createLog(first.tenant._id, first.admin._id, first.admin.email);
  await exportTenantAuditLogs({
    dateFrom: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  }, first.context);
  // Export is a security-relevant mutation — it SHOULD create an audit event
  assert.equal(auditWriter.events.length, 1);
  const event = auditWriter.events[0];
  assert.equal(event?.action, "AUDIT_EXPORTED");
  assert.equal(event?.actorEmail, first.admin.email);
});

test("platform audit service requires an authoritative platform Super Admin", async () => {
  const customer = await fixture("audit-customer");
  await assert.rejects(
    listPlatformAuditLogs({ page: 1, pageSize: 20 }, customer.context),
    (error: unknown) =>
      error instanceof AppError && error.code === "PERMISSION_REQUIRED",
  );

  const platform = await TenantModel.create({
    name: "Platform",
    slug: "documind.ai",
    status: "active",
    plan: "pro",
    isSystemTenant: true,
  });
  const superAdmin = await UserModel.create({
    tenantId: platform._id,
    name: "Platform Admin",
    email: "platform-admin@documind.ai",
    passwordHash: "test",
    role: "SUPER_ADMIN",
    status: "active",
    emailVerified: true,
  });
  const context: AuditOperationContext = {
    tenantId: platform.id,
    actorId: superAdmin.id,
    actorEmail: superAdmin.email,
    actorRole: superAdmin.role,
  };
  assert.ok(
    (await listPlatformAuditLogs({ page: 1, pageSize: 20 }, context))
      .pagination.totalRecords >= 0,
  );
});
