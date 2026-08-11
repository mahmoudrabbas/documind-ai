import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import DepartmentModel from "../../db/models/department.model.js";
import DocumentCategoryModel from "../../db/models/documentCategory.model.js";
import {
  resolveCategoryScopeValues,
  resolveDepartmentNames,
} from "./roles.taxonomy.js";

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
  await DocumentCategoryModel.deleteMany({});
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

function categoryDoc(overrides: Partial<{ name: string; normalizedName: string; status: "active" | "archived" }> = {}): {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  normalizedName: string;
  description: string | null;
  status: "active" | "archived";
  version: number;
  createdBy: mongoose.Types.ObjectId;
  updatedBy: mongoose.Types.ObjectId;
} {
  const tenantId = new mongoose.Types.ObjectId();
  return {
    tenantId,
    name: "Finance",
    normalizedName: "finance",
    description: null,
    status: "active",
    version: 1,
    createdBy: new mongoose.Types.ObjectId(),
    updatedBy: new mongoose.Types.ObjectId(),
    ...overrides,
  };
}

test("resolveCategoryScopeValues returns undefined when no names provided", async () => {
  assert.equal(await resolveCategoryScopeValues(undefined, "tenant-1"), undefined);
  assert.equal(await resolveCategoryScopeValues([], "tenant-1"), undefined);
});

test("resolveCategoryScopeValues resolves scope names to ids, display names and normalized names", async () => {
  const doc = await DocumentCategoryModel.create(categoryDoc());
  const tenantId = doc.tenantId.toString();

  const result = await resolveCategoryScopeValues(["finance"], tenantId);
  assert.deepEqual(result, {
    ids: [doc._id.toString()],
    names: ["Finance"],
    normalizedNames: ["finance"],
  });
});

test("resolveCategoryScopeValues normalizes input names before matching", async () => {
  const doc = await DocumentCategoryModel.create(categoryDoc());
  const tenantId = doc.tenantId.toString();

  const result = await resolveCategoryScopeValues(["  Finance  "], tenantId);
  assert.deepEqual(result?.ids, [doc._id.toString()]);
});

test("resolveCategoryScopeValues fails closed when a name does not exist", async () => {
  const doc = await DocumentCategoryModel.create(categoryDoc());
  const tenantId = doc.tenantId.toString();

  const result = await resolveCategoryScopeValues(["finance", "contracts"], tenantId);
  assert.deepEqual(result, { ids: [], names: [], normalizedNames: [] });
});

test("resolveCategoryScopeValues fails closed when a category belongs to another tenant", async () => {
  await DocumentCategoryModel.create(categoryDoc());
  const otherTenant = new mongoose.Types.ObjectId().toString();

  const result = await resolveCategoryScopeValues(["finance"], otherTenant);
  assert.deepEqual(result, { ids: [], names: [], normalizedNames: [] });
});

test("resolveCategoryScopeValues fails closed when a category is archived", async () => {
  const doc = await DocumentCategoryModel.create(categoryDoc({ status: "archived" }));
  const tenantId = doc.tenantId.toString();

  const result = await resolveCategoryScopeValues(["finance"], tenantId);
  assert.deepEqual(result, { ids: [], names: [], normalizedNames: [] });
});

test("resolveCategoryScopeValues fails closed when tenantId is invalid or missing", async () => {
  await DocumentCategoryModel.create(categoryDoc());
  assert.deepEqual(
    await resolveCategoryScopeValues(["finance"], "not-a-valid-tenant"),
    { ids: [], names: [], normalizedNames: [] },
  );
  assert.deepEqual(
    await resolveCategoryScopeValues(["finance"], undefined),
    { ids: [], names: [], normalizedNames: [] },
  );
});