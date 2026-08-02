import mongoose, { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BillingIndexMigrationConflict,
  ISSUE29_INDEXES,
  migrateIssue29BillingIndexes,
  type MigrationDatabase,
} from "../migrate-issue29-billing-indexes.service.js";

const databaseName = `issue29-migration-${new Types.ObjectId()}`;
const conflictDatabaseName = `issue29-migration-conflict-${new Types.ObjectId()}`;
const connection = new mongoose.Mongoose();

beforeAll(async () => {
  await connection.connect(process.env.MONGODB_URI!, { dbName: databaseName });
}, 120_000);

afterAll(async () => {
  await connection.connection.getClient().db(databaseName).dropDatabase();
  await connection.connection.getClient().db(conflictDatabaseName).dropDatabase();
  await connection.disconnect();
}, 120_000);

describe("Issue 29 billing index migration against disposable MongoDB", () => {
  it("is additive, dry-run-first, and idempotent without mutating business documents", async () => {
    const db = connection.connection.getClient().db(databaseName);
    const sentinel = new Types.ObjectId();
    await db.collection("subscriptions").insertOne({ _id: sentinel, status: "ACTIVE", entitlementMarker: "unchanged" });
    await db.collection("invoices").insertOne({
      _id: new Types.ObjectId(),
      provider: "fake",
      providerInvoiceId: "migration-sentinel-invoice",
      tenantId: sentinel,
      refundedAmountMinor: 0,
      reservedRefundAmountMinor: 0,
    });
    await db.collection("refunds").insertOne({
      _id: new Types.ObjectId(),
      operationId: new Types.ObjectId(),
      tenantId: sentinel,
      status: "REQUESTED",
    });

    const migrationDb = db as unknown as MigrationDatabase;
    const dryRun = await migrateIssue29BillingIndexes(migrationDb);
    expect(dryRun).toMatchObject({
      mode: "dry-run",
      created: expect.arrayContaining(ISSUE29_INDEXES.map((spec) => `${spec.collection}.${spec.name}`)),
      businessDocumentsMutated: 0,
    });
    expect(await db.listCollections({ name: "billingoperations" }).hasNext()).toBe(false);

    const applied = await migrateIssue29BillingIndexes(migrationDb, true);
    expect(applied.created).toHaveLength(ISSUE29_INDEXES.length);
    const repeated = await migrateIssue29BillingIndexes(migrationDb, true);
    expect(repeated).toMatchObject({ mode: "apply", created: [], businessDocumentsMutated: 0 });
    expect(repeated.existing).toHaveLength(ISSUE29_INDEXES.length);
    const dryRunAfterApply = await migrateIssue29BillingIndexes(migrationDb);
    expect(dryRunAfterApply.created).toHaveLength(0);
    expect(dryRunAfterApply.existing).toHaveLength(ISSUE29_INDEXES.length);

    for (const spec of ISSUE29_INDEXES) {
      const indexes = await db.collection(spec.collection).indexes();
      const actual = indexes.find((index) => index.name === spec.name);
      expect(actual?.key, `${spec.collection}.${spec.name}`).toEqual(spec.key);
      expect(Boolean(actual?.unique)).toBe(Boolean(spec.unique));
      expect(Boolean(actual?.sparse)).toBe(Boolean(spec.sparse));
      expect(actual?.partialFilterExpression ?? null).toEqual(spec.partialFilterExpression ?? null);
    }

    expect(await db.collection("subscriptions").findOne({ _id: sentinel })).toMatchObject({
      status: "ACTIVE",
      entitlementMarker: "unchanged",
    });
    expect(await db.collection("invoices").countDocuments({ tenantId: sentinel })).toBe(1);
    expect(await db.collection("refunds").countDocuments({ tenantId: sentinel })).toBe(1);
  }, 60_000);

  it("reports an existing equivalent key with an unsafe name as a conflict without replacing it", async () => {
    const db = connection.connection.getClient().db(conflictDatabaseName);
    await db.collection("billingoperations").createIndex(
      { tenantId: 1, idempotencyKeyHash: 1 },
      { name: "legacy_idempotency_index", unique: true },
    );

    await expect(migrateIssue29BillingIndexes(db as unknown as MigrationDatabase, true))
      .rejects.toBeInstanceOf(BillingIndexMigrationConflict);
    expect(await db.collection("billingoperations").indexExists("legacy_idempotency_index")).toBe(true);
    expect(await db.collection("billingoperations").indexExists("uq_billing_operation_idempotency")).toBe(false);
  }, 30_000);
});
