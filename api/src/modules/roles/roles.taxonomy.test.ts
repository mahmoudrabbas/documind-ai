import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import DepartmentModel from "../../db/models/department.model.js";
import { resolveDepartmentNames } from "./roles.taxonomy.js";

let mongoServer: MongoMemoryServer | null = null;

before(async () => {
  mongoServer = await MongoMemoryServer.create({
    binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
    instance: { launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000) },
  });
  await mongoose.connect(mongoServer.getUri(), { dbName: "dept-resolution" });
});

beforeEach(async () => {
  await DepartmentModel.deleteMany({});
});

after(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

test("resolveDepartmentNames returns undefined when no ids provided", async () => {
  assert.equal(await resolveDepartmentNames(undefined, "tenant-1"), undefined);
  assert.equal(await resolveDepartmentNames([], "tenant-1"), undefined);
});

test("resolveDepartmentNames resolves valid ObjectIds to names within the same tenant", async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const dep = await DepartmentModel.create({
    tenantId,
    name: "HR",
    normalizedName: "hr",
    description: null,
    status: "active",
    version: 1,
    createdBy: new mongoose.Types.ObjectId(),
    updatedBy: new mongoose.Types.ObjectId(),
  });

  const result = await resolveDepartmentNames([dep._id.toString()], tenantId.toString());
  assert.deepEqual(result, ["HR"]);
});

test("resolveDepartmentNames resolves multiple valid ids", async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const dep1 = await DepartmentModel.create({
    tenantId, name: "HR", normalizedName: "hr", description: null, status: "active", version: 1,
    createdBy: new mongoose.Types.ObjectId(), updatedBy: new mongoose.Types.ObjectId(),
  });
  const dep2 = await DepartmentModel.create({
    tenantId, name: "IT", normalizedName: "it", description: null, status: "active", version: 1,
    createdBy: new mongoose.Types.ObjectId(), updatedBy: new mongoose.Types.ObjectId(),
  });

  const result = await resolveDepartmentNames(
    [dep1._id.toString(), dep2._id.toString()],
    tenantId.toString(),
  );
  assert.deepEqual(result?.sort(), ["HR", "IT"]);
});

test("resolveDepartmentNames fails closed when an id does not exist", async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const dep = await DepartmentModel.create({
    tenantId, name: "HR", normalizedName: "hr", description: null, status: "active", version: 1,
    createdBy: new mongoose.Types.ObjectId(), updatedBy: new mongoose.Types.ObjectId(),
  });

  const fakeId = new mongoose.Types.ObjectId().toString();
  const result = await resolveDepartmentNames(
    [dep._id.toString(), fakeId],
    tenantId.toString(),
  );
  assert.deepEqual(result, []);
});

test("resolveDepartmentNames fails closed when an id belongs to another tenant", async () => {
  const tenantA = new mongoose.Types.ObjectId();
  const tenantB = new mongoose.Types.ObjectId();
  const dep = await DepartmentModel.create({
    tenantId: tenantA, name: "HR", normalizedName: "hr", description: null, status: "active", version: 1,
    createdBy: new mongoose.Types.ObjectId(), updatedBy: new mongoose.Types.ObjectId(),
  });

  const result = await resolveDepartmentNames(
    [dep._id.toString()],
    tenantB.toString(),
  );
  assert.deepEqual(result, []);
});

test("resolveDepartmentNames fails closed when an id is not a valid ObjectId", async () => {
  assert.deepEqual(await resolveDepartmentNames(["not-a-valid-id"], "tenant-1"), []);
});

test("resolveDepartmentNames fails closed when tenantId is invalid", async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const dep = await DepartmentModel.create({
    tenantId, name: "HR", normalizedName: "hr", description: null, status: "active", version: 1,
    createdBy: new mongoose.Types.ObjectId(), updatedBy: new mongoose.Types.ObjectId(),
  });

  const result = await resolveDepartmentNames([dep._id.toString()], "not-a-valid-tenant");
  assert.deepEqual(result, []);
});

test("resolveDepartmentNames fails closed when tenantId is missing", async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const dep = await DepartmentModel.create({
    tenantId, name: "HR", normalizedName: "hr", description: null, status: "active", version: 1,
    createdBy: new mongoose.Types.ObjectId(), updatedBy: new mongoose.Types.ObjectId(),
  });

  const result = await resolveDepartmentNames([dep._id.toString()], undefined);
  assert.deepEqual(result, []);
});

test("resolveDepartmentNames fails closed when a department is archived", async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const dep = await DepartmentModel.create({
    tenantId, name: "HR", normalizedName: "hr", description: null, status: "archived", version: 1,
    createdBy: new mongoose.Types.ObjectId(), updatedBy: new mongoose.Types.ObjectId(),
  });

  const result = await resolveDepartmentNames(
    [dep._id.toString()],
    tenantId.toString(),
  );
  assert.deepEqual(result, []);
});