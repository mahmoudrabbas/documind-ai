import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import { InMemoryAuditWriter } from "../../common/observability/auditWriter.js";
import { setAuditWriter } from "../../common/observability/index.js";
import { deleteUser, updateUser } from "./users.service.js";

let replSet: MongoMemoryReplSet | null = null;
let tenantId: string;
let admins: Array<{ id: string; email: string }>;

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
  await Promise.all([TenantModel.deleteMany({}), UserModel.deleteMany({})]);
  setAuditWriter(new InMemoryAuditWriter());
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

const actor = (id = admins[1]!.id) => ({ userId: id, email: "operator@example.test", role: "COMPANY_ADMIN" as const });

test("sole active Company Admin cannot be demoted, disabled, or deleted", async () => {
  await UserModel.updateOne({ _id: admins[1]!.id }, { $set: { status: "disabled" } });
  for (const operation of [
    () => updateUser({ role: "EMPLOYEE" }, tenantId, admins[0]!.id, actor()),
    () => updateUser({ status: "disabled" }, tenantId, admins[0]!.id, actor()),
    () => deleteUser(tenantId, admins[0]!.id, actor()),
  ]) {
    await assert.rejects(operation(), (error: unknown) =>
      Boolean(error && typeof error === "object" && "code" in error && (error as { code: string }).code === "LAST_ADMIN_PROTECTION"));
  }
  assert.equal(await UserModel.countDocuments({ tenantId, role: "COMPANY_ADMIN", status: "active" }), 1);
});

test("concurrent demotions cannot both remove the final active Company Admin", async () => {
  const results = await Promise.allSettled(admins.map((admin, index) =>
    updateUser({ role: "EMPLOYEE" }, tenantId, admin.id, actor(admins[1 - index]!.id))));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" && result.reason?.code === "LAST_ADMIN_PROTECTION").length, 1);
  assert.equal(await UserModel.countDocuments({ tenantId, role: "COMPANY_ADMIN", status: "active" }), 1);
});

test("concurrent deletes cannot both remove the final active Company Admin", async () => {
  const results = await Promise.allSettled(admins.map((admin, index) =>
    deleteUser(tenantId, admin.id, actor(admins[1 - index]!.id))));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" && result.reason?.code === "LAST_ADMIN_PROTECTION").length, 1);
  assert.equal(await UserModel.countDocuments({ tenantId, role: "COMPANY_ADMIN", status: "active" }), 1);
});
