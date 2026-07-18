import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import RoleModel from "../../db/models/role.model.js";
import UserModel from "../../db/models/user.model.js";
import { Permission } from "../permissions/permissions.catalog.js";

let mongo: MongoMemoryServer | null = null;
let tenantId: mongoose.Types.ObjectId;
let actorId: mongoose.Types.ObjectId;

before(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "role-persistence" });
  } else {
    mongo = await MongoMemoryServer.create({
      binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
      instance: { launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000) },
    });
    await mongoose.connect(mongo.getUri(), { dbName: "role-persistence" });
  }
  await RoleModel.init();
});

beforeEach(async () => {
  await Promise.all([RoleModel.deleteMany({}), UserModel.deleteMany({})]);
  tenantId = new mongoose.Types.ObjectId();
  const actor = await UserModel.create({
    tenantId, name: "Role Actor", email: `${tenantId}@example.test`, passwordHash: "test",
    role: "COMPANY_ADMIN", status: "active", emailVerified: true,
  });
  actorId = actor._id;
});

after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

function validRole(values: Record<string, unknown> = {}) {
  return {
    tenantId, name: "Finance Reader", normalizedName: "finance reader", baseRole: "EMPLOYEE" as const,
    grants: [{ permission: Permission.ANALYTICS_READ }] as const, createdBy: actorId, updatedBy: actorId,
    ...values,
  };
}

test("RoleModel.create and document.save enforce canonical grants and provenance", async () => {
  const created = await new RoleModel(validRole()).save();
  assert.deepEqual(created.grants.map((grant) => grant.permission), [Permission.ANALYTICS_READ]);

  created.grants = [{ permission: Permission.BILLING_MANAGE }];
  await assert.rejects(created.save());

  await assert.rejects(new RoleModel(validRole({
    name: "Unknown", normalizedName: "unknown", grants: [{ permission: "unknown:value" }],
  })).save());

  const otherTenantActor = await UserModel.create({
    tenantId: new mongoose.Types.ObjectId(), name: "Other Actor", email: "other@example.test",
    passwordHash: "test", role: "COMPANY_ADMIN", status: "active", emailVerified: true,
  });
  await assert.rejects(new RoleModel(validRole({
    name: "Cross Tenant", normalizedName: "cross tenant", createdBy: otherTenantActor._id,
  })).save(), /provenance/);
});

test("query updates cannot bypass role security invariants", async () => {
  const role = await new RoleModel(validRole()).save();
  const mutations = [
    () => RoleModel.findOneAndUpdate({ _id: role._id }, { $set: { grants: [{ permission: "audit:platform-read" }] } }).exec(),
    () => RoleModel.updateOne({ _id: role._id }, { $push: { grants: { permission: "audit:platform-read" } } }).exec(),
    () => RoleModel.updateMany({ _id: role._id }, { $unset: { createdBy: 1 } }).exec(),
    () => RoleModel.updateOne({ _id: role._id }, { $inc: { version: -1 } }).exec(),
    () => RoleModel.updateOne({ _id: role._id }, { $addToSet: { grants: { permission: Permission.ANALYTICS_READ } } }).exec(),
    () => RoleModel.updateOne({ _id: role._id }, { $pull: { grants: { permission: Permission.ANALYTICS_READ } } }).exec(),
    () => RoleModel.updateOne({ _id: role._id }, { $pullAll: { grants: [{ permission: Permission.ANALYTICS_READ }] } }).exec(),
    () => RoleModel.updateOne({ _id: role._id }, { $pop: { grants: 1 } }).exec(),
    () => RoleModel.updateOne({ _id: role._id }, { $rename: { tenantId: "otherTenant" } }).exec(),
    () => RoleModel.updateOne({ _id: role._id }, { $setOnInsert: { createdBy: new mongoose.Types.ObjectId() } }, { upsert: true }).exec(),
    () => RoleModel.updateOne({ _id: role._id }, { $currentDate: { updatedAt: true } }).exec(),
    () => RoleModel.updateOne({ _id: role._id }, [{ $set: { status: "archived" } }], { updatePipeline: true }).exec(),
    () => RoleModel.updateMany({ tenantId }, [{ $unset: ["migrationState", "version"] }], { updatePipeline: true }).exec(),
    () => RoleModel.replaceOne({ _id: role._id }, validRole({ name: "Replacement", normalizedName: "replacement" })).exec(),
    () => RoleModel.findOneAndReplace({ _id: role._id }, validRole({ name: "Replacement", normalizedName: "replacement" })).exec(),
  ];
  for (const mutate of mutations) await assert.rejects(mutate(), /ROLE_QUERY_UPDATE_FORBIDDEN/);
  await assert.rejects(RoleModel.bulkWrite([
    { updateOne: { filter: { _id: role._id }, update: { $set: { status: "archived" } } } },
  ]), /ROLE_BULK_WRITE_FORBIDDEN/);
  await assert.rejects(RoleModel.insertMany([validRole({
    name: "Unsafe Insert", normalizedName: "unsafe insert", createdBy: new mongoose.Types.ObjectId(),
  })]), /ROLE_INSERT_MANY_FORBIDDEN/);

  const persisted = await RoleModel.collection.findOne({ _id: role._id });
  assert.deepEqual(persisted?.grants, [{ permission: Permission.ANALYTICS_READ }]);
  assert.equal(persisted?.status, "active");
  assert.equal(persisted?.version, 1);
  assert.deepEqual(persisted?.tenantId, tenantId);
  assert.deepEqual(persisted?.createdBy, actorId);
});

test("tenant-normalized role names remain uniquely enforced", async () => {
  await new RoleModel(validRole()).save();
  await assert.rejects(new RoleModel(validRole({ name: "FINANCE READER" })).save(),
    (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && (error as { code: number }).code === 11000));
});

test("document persistence enforces canonical names, role values, versions, and timestamps", async () => {
  await assert.rejects(new RoleModel(validRole({ normalizedName: "not canonical" })).save(), /normalizedName/);
  await assert.rejects(new RoleModel(validRole({ baseRole: "SUPER_ADMIN" })).save());
  await assert.rejects(new RoleModel(validRole({ grants: [{ permission: "documents:view" }] })).save());
  await assert.rejects(new RoleModel(validRole({ grants: [{ permission: Permission.BILLING_READ, scopes: { selfOnly: true } }] })).save());

  const role = await new RoleModel(validRole()).save();
  assert.ok(role.createdAt instanceof Date);
  assert.ok(role.updatedAt instanceof Date);
  role.name = "Renamed Role";
  role.normalizedName = "renamed role";
  await assert.rejects(role.save(), /increase by exactly one/);
  role.version = 2;
  await role.save();
  assert.equal(role.version, 2);
});
