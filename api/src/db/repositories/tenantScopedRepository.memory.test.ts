import test, { after, afterEach, before } from "node:test";
import assert from "node:assert";
import mongoose, { type Model, Schema } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  tenantScopedCreate,
  tenantScopedDeleteOne,
  tenantScopedFindById,
  tenantScopedFindOne,
  tenantScopedUpdateOne,
} from "./tenantScopedRepository.js";

interface TenantScopedDoc {
  tenantId: string;
  email?: string;
  userId?: string;
  status?: string;
}

const tenantScopedSchema = new Schema<TenantScopedDoc>(
  {
    tenantId: { type: String, required: true },
    email: String,
    userId: String,
    status: String,
  },
  { timestamps: false }
);

const TenantScopedModel =
  (mongoose.models.TenantScopedTest as Model<TenantScopedDoc>) ||
  mongoose.model<TenantScopedDoc>("TenantScopedTest", tenantScopedSchema);

let mongoServer: MongoMemoryServer;

before(async () => {
  // Pin the MongoDB binary version to a supported release for CI/container environments.
  // This avoids mongodb-memory-server trying the latest version selection that may not
  // be available for the current platform or distro.
  mongoServer = await MongoMemoryServer.create({
    binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
    instance: { launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000) },
  });
  await mongoose.connect(mongoServer.getUri(), {
    dbName: "tenant-scoped-test",
  });
});

after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await TenantScopedModel.deleteMany({});
});

test("tenant scoped repository enforces tenant isolation with MongoMemoryServer", async (t) => {
  await t.test("tenantScopedCreate requires a valid tenantId", async () => {
    const created = await tenantScopedCreate(TenantScopedModel, {
      tenantId: "tenant-alpha",
      email: "alpha@example.com",
      status: "active",
    });

    assert.equal(created.email, "alpha@example.com");
    assert.equal(created.tenantId, "tenant-alpha");
  });

  await t.test("tenantScopedFindOne only returns results for the requested tenant", async () => {
    await TenantScopedModel.create({
      tenantId: "tenant-a",
      email: "shared@example.com",
      status: "active",
    });
    await TenantScopedModel.create({
      tenantId: "tenant-b",
      email: "shared@example.com",
      status: "active",
    });

    const result = await tenantScopedFindOne(
      TenantScopedModel,
      "tenant-a",
      { email: "shared@example.com" }
    ).exec();

    assert.equal(result?.tenantId, "tenant-a");
    assert.equal(result?.email, "shared@example.com");
  });

  await t.test("tenantScopedFindById honors tenant boundary", async () => {
    const tenantARecord = await TenantScopedModel.create({
      tenantId: "tenant-a",
      email: "user-a@example.com",
      status: "active",
    });
    await TenantScopedModel.create({
      tenantId: "tenant-b",
      email: "user-b@example.com",
      status: "active",
    });

    const found = await tenantScopedFindById(
      TenantScopedModel,
      "tenant-a",
      tenantARecord.id,
    ).exec();
    const notFound = await tenantScopedFindById(
      TenantScopedModel,
      "tenant-b",
      tenantARecord.id,
    ).exec();

    assert.ok(found);
    assert.equal(found?.tenantId, "tenant-a");
    assert.equal(notFound, null);
  });

  await t.test("tenantScopedUpdateOne only updates the matching tenant document", async () => {
    await TenantScopedModel.create({
      tenantId: "tenant-a",
      userId: "shared-user",
      status: "active",
    });
    const tenantBRecord = await TenantScopedModel.create({
      tenantId: "tenant-b",
      userId: "shared-user",
      status: "active",
    });

    const updateResult = await tenantScopedUpdateOne(
      TenantScopedModel,
      "tenant-a",
      { userId: "shared-user" },
      { $set: { status: "inactive" } }
    ).exec();

    assert.equal(updateResult.matchedCount, 1);
    assert.equal(updateResult.modifiedCount, 1);

    const updatedA = await TenantScopedModel.findOne({
      tenantId: "tenant-a",
      userId: "shared-user",
    }).lean().exec();
    const untouchedB = await TenantScopedModel.findById(tenantBRecord.id).lean().exec();

    assert.equal(updatedA?.status, "inactive");
    assert.equal(untouchedB?.status, "active");
  });

  await t.test("tenantScopedDeleteOne only deletes the matching tenant document", async () => {
    const tenantARecord = await TenantScopedModel.create({
      tenantId: "tenant-a",
      userId: "shared-user",
      status: "active",
    });
    await TenantScopedModel.create({
      tenantId: "tenant-b",
      userId: "shared-user",
      status: "active",
    });

    const deleteResult = await tenantScopedDeleteOne(
      TenantScopedModel,
      "tenant-a",
      { userId: "shared-user" }
    ).exec();

    assert.equal(deleteResult.deletedCount, 1);

    const remaining = await TenantScopedModel.find({
      userId: "shared-user",
    }).lean().exec();

    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].tenantId, "tenant-b");
    assert.notEqual(remaining[0]._id.toString(), tenantARecord.id.toString());
  });
});
