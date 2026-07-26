import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import DocumentCategoryModel from "../../db/models/documentCategory.model.js";
import DocumentClassificationModel from "../../db/models/documentClassification.model.js";
import DepartmentModel from "../../db/models/department.model.js";
import { MongoDocumentTaxonomyRepository } from "./documentTaxonomy.repository.mongo.js";

let mongo: MongoMemoryServer | null = null;
const repository = new MongoDocumentTaxonomyRepository();
const tenantA = new mongoose.Types.ObjectId();
const tenantB = new mongoose.Types.ObjectId();
const actorA = new mongoose.Types.ObjectId();
const actorB = new mongoose.Types.ObjectId();

before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
    instance: { launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000) },
  });
  await mongoose.connect(mongo.getUri(), { dbName: "document-taxonomy-repository" });
  await Promise.all([
    DocumentCategoryModel.init(),
    DepartmentModel.init(),
    DocumentClassificationModel.init(),
  ]);
});

beforeEach(async () => {
  await Promise.all([
    DocumentCategoryModel.deleteMany({}),
    DepartmentModel.deleteMany({}),
    DocumentClassificationModel.deleteMany({}),
  ]);
});

after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test("normalized names are unique per tenant including archived records", async () => {
  const first = await create("category", tenantA, actorA, "Finance", "finance");
  await assert.rejects(create("category", tenantA, actorA, "FINANCE", "finance"), isDuplicate);
  const otherTenant = await create("category", tenantB, actorB, "Finance", "finance");
  assert.notEqual(first.id, otherTenant.id);

  const archived = await repository.changeStatus(
    tenantA.toString(), "category", first.id, first.version, "archived", actorA.toString(),
  );
  assert.equal(archived?.status, "archived");
  await assert.rejects(create("category", tenantA, actorA, "Finance", "finance"), isDuplicate);
});

test("tenant-scoped lookup, update, and archive hide cross-tenant records", async () => {
  const department = await create("department", tenantA, actorA, "Legal", "legal");
  assert.equal(
    await repository.findByTenantAndId(tenantB.toString(), "department", department.id),
    null,
  );
  assert.equal(await repository.update(tenantB.toString(), "department", department.id, {
    expectedVersion: 1,
    name: "Changed",
    normalizedName: "changed",
    updatedBy: actorB.toString(),
  }), null);
  assert.equal(await repository.changeStatus(
    tenantB.toString(), "department", department.id, 1, "archived", actorB.toString(),
  ), null);
});

test("active/archive filters, pagination, count, and search remain tenant-scoped", async () => {
  const alpha = await create("department", tenantA, actorA, "Alpha Team", "alpha team");
  await create("department", tenantA, actorA, "Beta Team", "beta team");
  await create("department", tenantB, actorB, "Alpha Other", "alpha other");
  await repository.changeStatus(
    tenantA.toString(), "department", alpha.id, 1, "archived", actorA.toString(),
  );

  const active = await repository.list(tenantA.toString(), "department", {
    page: 1, pageSize: 1, status: "active",
  });
  assert.equal(active.totalRecords, 1);
  assert.equal(active.records[0]?.name, "Beta Team");
  const archived = await repository.list(tenantA.toString(), "department", {
    page: 1, pageSize: 20, status: "archived", search: "alpha",
  });
  assert.equal(archived.totalRecords, 1);
  assert.equal(archived.records[0]?.tenantId, tenantA.toString());
});

test("classification persistence accepts only canonical levels", async () => {
  const classification = await repository.create(tenantA.toString(), "classification", {
    name: "Executive",
    normalizedName: "executive",
    description: null,
    level: "highly_confidential",
    createdBy: actorA.toString(),
    updatedBy: actorA.toString(),
  });
  assert.equal(classification.level, "highly_confidential");
  await assert.rejects(DocumentClassificationModel.create({
    tenantId: tenantA,
    name: "Invalid",
    normalizedName: "invalid",
    level: "top_secret" as never,
    createdBy: actorA,
    updatedBy: actorA,
  }));
});

function create(
  kind: "category" | "department",
  tenantId: mongoose.Types.ObjectId,
  actorId: mongoose.Types.ObjectId,
  name: string,
  normalizedName: string,
) {
  return repository.create(tenantId.toString(), kind, {
    name,
    normalizedName,
    description: null,
    createdBy: actorId.toString(),
    updatedBy: actorId.toString(),
  });
}

function isDuplicate(error: unknown): boolean {
  return Boolean(
    error && typeof error === "object" && "code" in error &&
    (error as { code?: number }).code === 11000,
  );
}
