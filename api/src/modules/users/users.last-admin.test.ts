import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import RefreshTokenModel from "../../db/models/refreshToken.model.js";
import { InMemoryAuditWriter } from "../../common/observability/auditWriter.js";
import { setAuditWriter } from "../../common/observability/index.js";
import { deleteUser, updateUser } from "./users.service.js";

let replSet: MongoMemoryReplSet | null = null;
let tenantId: string;
let admins: Array<{ id: string; email: string }>;
let auditWriter: InMemoryAuditWriter;

before(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "last-admin" });
  } else {
    replSet = await MongoMemoryReplSet.create({
      binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
      replSet: { count: 1 },
      instanceOpts: [{ launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000) }],
    });
    await mongoose.connect(replSet.getUri(), { dbName: "last-admin" });
  }
});

beforeEach(async () => {
  await Promise.all([
    TenantModel.deleteMany({}),
    UserModel.deleteMany({}),
    RefreshTokenModel.deleteMany({}),
  ]);
  auditWriter = new InMemoryAuditWriter();
  setAuditWriter(auditWriter);
  const tenant = await TenantModel.create({ name: "Admin Tenant", slug: "admin-tenant", status: "active", plan: "free" });
  tenantId = tenant.id;
  const created = await Promise.all(["one", "two"].map((suffix) => UserModel.create({
    tenantId: tenant._id, name: `Admin ${suffix}`, email: `${suffix}@example.test`, passwordHash: "test",
    role: "COMPANY_ADMIN", status: "active", emailVerified: true,
  })));
  admins = created.map((admin) => ({ id: admin.id, email: admin.email }));
});

after(async () => {
  setAuditWriter(null);
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
});

const actor = (id = admins[1]!.id) => {
  const persistedActor = admins.find((admin) => admin.id === id);
  assert.ok(persistedActor);
  return {
    tenantId,
    actorId: id,
    actorEmail: persistedActor.email,
    actorRole: "COMPANY_ADMIN" as const,
  };
};

test("disabled Company Admin cannot invoke user management directly", async () => {
  await UserModel.updateOne({ _id: admins[1]!.id }, { $set: { status: "disabled" } });
  for (const operation of [
    () => updateUser({ role: "EMPLOYEE" }, actor(), admins[0]!.id),
    () => updateUser({ status: "disabled" }, actor(), admins[0]!.id),
    () => deleteUser(actor(), admins[0]!.id),
  ]) {
    await assert.rejects(operation(), (error: unknown) =>
      Boolean(error && typeof error === "object" && "code" in error && (error as { code: string }).code === "PERMISSION_REQUIRED"));
  }
  assert.equal(await UserModel.countDocuments({ tenantId, role: "COMPANY_ADMIN", status: "active" }), 1);
});

test("concurrent demotions cannot both remove the final active Company Admin", async () => {
  const results = await Promise.allSettled(admins.map((admin, index) =>
    updateUser({ role: "EMPLOYEE" }, actor(admins[1 - index]!.id), admin.id)));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" && result.reason?.code === "LAST_ADMIN_PROTECTION").length, 1);
  assert.equal(await UserModel.countDocuments({ tenantId, role: "COMPANY_ADMIN", status: "active" }), 1);
});

test("concurrent deletes cannot both remove the final active Company Admin", async () => {
  const results = await Promise.allSettled(admins.map((admin, index) =>
    deleteUser(actor(admins[1 - index]!.id), admin.id)));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" && result.reason?.code === "LAST_ADMIN_PROTECTION").length, 1);
  assert.equal(await UserModel.countDocuments({ tenantId, role: "COMPANY_ADMIN", status: "active" }), 1);
});

test("database actor state overrides crafted and stale role claims", async () => {
  const employee = await UserModel.create({
    tenantId,
    name: "Target Employee",
    email: "target@example.test",
    passwordHash: "test",
    role: "EMPLOYEE",
    status: "active",
    emailVerified: true,
  });
  await UserModel.updateOne(
    { _id: admins[1]!.id },
    { $set: { role: "EMPLOYEE" } },
  );

  await assert.rejects(
    updateUser(
      { status: "disabled" },
      {
        tenantId,
        actorId: admins[1]!.id,
        actorEmail: admins[1]!.email,
        actorRole: "COMPANY_ADMIN",
      },
      employee.id,
    ),
    (error: unknown) =>
      Boolean(
        error &&
          typeof error === "object" &&
          "code" in error &&
          (error as { code: string }).code === "PERMISSION_REQUIRED",
      ),
  );
});

test("status changes revoke sessions and audit authoritative identity", async () => {
  const employee = await UserModel.create({
    tenantId,
    name: "Session Employee",
    email: "session@example.test",
    passwordHash: "test",
    role: "EMPLOYEE",
    status: "active",
    emailVerified: true,
  });
  const refreshToken = await RefreshTokenModel.create({
    tenantId,
    userId: employee._id,
    tokenHash: "session-token-hash",
    jtiHash: "session-jti-hash",
    familyId: "session-family",
    expiresAt: new Date(Date.now() + 60_000),
  });

  await updateUser(
    { status: "disabled" },
    {
      tenantId,
      actorId: admins[1]!.id,
      actorEmail: "stale-claim@example.test",
      actorRole: "EMPLOYEE",
      requestId: "phase3a-request",
    },
    employee.id,
  );

  const persistedToken = await RefreshTokenModel.findById(refreshToken.id);
  assert.ok(persistedToken?.revokedAt instanceof Date);
  const event = auditWriter.events.find(
    (entry) => entry.action === "USER_STATUS_CHANGED",
  );
  assert.equal(event?.actorEmail, admins[1]!.email);
  assert.equal(event?.actorRole, "COMPANY_ADMIN");
  assert.deepEqual(event?.metadata, {
    traceId: undefined,
    requestId: "phase3a-request",
  });
  assert.equal(JSON.stringify(event).includes("session-token-hash"), false);
});

test("cross-tenant crafted context is hidden and no-op updates do not audit", async () => {
  const foreignTenant = await TenantModel.create({
    name: "Foreign Tenant",
    slug: "foreign-tenant",
    status: "active",
    plan: "free",
  });
  const foreignUser = await UserModel.create({
    tenantId: foreignTenant._id,
    name: "Foreign Employee",
    email: "shared@example.test",
    passwordHash: "test",
    role: "EMPLOYEE",
    status: "active",
    emailVerified: true,
  });
  await UserModel.create({
    tenantId,
    name: "Local Employee",
    email: "shared@example.test",
    passwordHash: "test",
    role: "EMPLOYEE",
    status: "active",
    emailVerified: true,
  });

  await assert.rejects(
    updateUser({ status: "disabled" }, actor(), foreignUser.id),
    (error: unknown) =>
      Boolean(
        error &&
          typeof error === "object" &&
          "code" in error &&
          (error as { code: string }).code === "NOT_FOUND",
      ),
  );
  auditWriter.clear();
  await updateUser({ status: "active" }, actor(), admins[0]!.id);
  assert.equal(auditWriter.events.length, 0);
});
