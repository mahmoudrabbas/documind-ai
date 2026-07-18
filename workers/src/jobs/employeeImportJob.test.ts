import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId, type MongoClient } from "mongodb";
import { employeeImportJobHandler, employeeImportPayloadSchema } from "./employeeImportJob.js";
import { setMockClient } from "../db/mongo.js";
import { RetryableJobError, PermanentJobError } from "../contracts/retryPolicy.js";
import type { JobHandlerContext, JobHandlerResult } from "../contracts/jobDispatcher.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────────

const mockTenantId = new ObjectId();
const mockActorId = new ObjectId();

function makeCtx(overrides?: Partial<JobHandlerContext>): JobHandlerContext {
  return {
    envelope: {
      jobType: "import.employee.batch",
      schemaVersion: "1.0.0" as const,
      tenantId: mockTenantId.toString(),
      actorId: mockActorId.toString(),
      traceId: "trace-test",
      idempotencyKey: "idem-batch-1",
      payload: {},
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    traceId: "trace-test",
    isRetry: false,
    attemptsMade: 0,
    maxAttempts: 3,
    signal: new AbortController().signal,
    progress: () => {},
    ...overrides,
  };
}

type CollectionMock = Record<string, unknown>;

function makeDb(mocks: Record<string, CollectionMock>) {
  return {
    collection: (name: string) => {
      const m = mocks[name];
      if (m) return m;
      return {
        findOne: async () => null,
        find: () => ({ sort: () => ({ toArray: async () => [] }) }),
        insertOne: async () => ({ insertedId: new ObjectId() }),
        updateOne: async () => ({ matchedCount: 1, modifiedCount: 1 }),
        countDocuments: async () => 0,
      };
    },
  };
}

function setDb(mocks: Record<string, CollectionMock>) {
  const mockClient = { db: () => makeDb(mocks) } as unknown as MongoClient;
  setMockClient(mockClient);
}

async function runHandler(
  batchId: string,
  overrides?: Partial<JobHandlerContext>,
): Promise<JobHandlerResult> {
  const result = await employeeImportJobHandler.handle(
    {
      batchId,
      tenantId: mockTenantId.toString(),
      actorId: mockActorId.toString(),
    },
    makeCtx(overrides),
  );
  // handle returns JobHandlerResult | void — in tests we always get a result
  return result as JobHandlerResult;
}

// ─── Tests ───────────────────────────────────────────────────────────────────────

test("valid payload schema", () => {
  const result = employeeImportPayloadSchema.safeParse({
    batchId: new ObjectId().toString(),
    tenantId: new ObjectId().toString(),
    actorId: new ObjectId().toString(),
  });
  assert.ok(result.success);
});

test("throws PermanentJobError when batch not found", async () => {
  setDb({});
  await assert.rejects(
    employeeImportJobHandler.handle(
      { batchId: new ObjectId().toString(), tenantId: mockTenantId.toString(), actorId: mockActorId.toString() },
      makeCtx(),
    ),
    PermanentJobError,
  );
  setMockClient(null);
});

test("throws PermanentJobError on invalid batch state", async () => {
  const batchId = new ObjectId();
  setDb({
    employeeimportbatches: {
      findOne: async () => ({
        _id: batchId,
        tenantId: mockTenantId,
        state: "CANCELLED",
      }),
    },
  });
  await assert.rejects(
    employeeImportJobHandler.handle(
      { batchId: batchId.toString(), tenantId: mockTenantId.toString(), actorId: mockActorId.toString() },
      makeCtx(),
    ),
    PermanentJobError,
  );
  setMockClient(null);
});

test("throws RetryableJobError when DB not connected", async () => {
  setMockClient(null);
  await assert.rejects(
    employeeImportJobHandler.handle(
      { batchId: new ObjectId().toString(), tenantId: mockTenantId.toString(), actorId: mockActorId.toString() },
      makeCtx(),
    ),
    RetryableJobError,
  );
});

test("completes batch with COMPLETED when all rows created", async () => {
  const batchId = new ObjectId();
  const calls: Array<{ name: string; update: Record<string, unknown> }> = [];

  setDb({
    employeeimportbatches: {
      findOne: async () => ({
        _id: batchId,
        tenantId: mockTenantId,
        state: "QUEUED",
        summary: { valid: 2, warning: 0, invalid: 0, skipped: 0, created: 0, failed: 0 },
      }),
      updateOne: async (_q: unknown, u: Record<string, unknown>) => {
        calls.push({ name: "employeeimportbatches", update: u });
        return { matchedCount: 1, modifiedCount: 1 };
      },
    },
    employeeimportrows: {
      find: () => ({
        sort: () => ({
          toArray: async () => [
            {
              _id: new ObjectId(),
              batchId,
              tenantId: mockTenantId,
              rowNumber: 1,
              rawData: { email: "alice@test.com", firstName: "Alice", lastName: "Smith" },
              state: "PENDING",
              idempotencyKey: "row-1",
            },
            {
              _id: new ObjectId(),
              batchId,
              tenantId: mockTenantId,
              rowNumber: 2,
              rawData: { email: "bob@test.com", firstName: "Bob", lastName: "Jones" },
              state: "PENDING",
              idempotencyKey: "row-2",
            },
          ],
        }),
      }),
      updateOne: async (_q: unknown, u: Record<string, unknown>) => {
        calls.push({ name: "employeeimportrows", update: u });
        return { matchedCount: 1, modifiedCount: 1 };
      },
    },
    users: {
      countDocuments: async () => 5,
      findOne: async () => null,
      insertOne: async () => ({ insertedId: new ObjectId() }),
    },
    emailmessages: {
      insertOne: async () => ({ insertedId: new ObjectId() }),
    },
    tenants: {
      findOne: async () => ({ _id: mockTenantId, plan: "pro" }),
    },
  });

  const result = await runHandler(batchId.toString());

  assert.equal(result.summary!.created, 2);
  assert.equal(result.summary!.failed, 0);
  assert.equal(result.summary!.state, "COMPLETED");

  const processingUpdates = calls.filter(
    (c) => c.name === "employeeimportbatches" && (c.update.$set as Record<string, unknown>)?.state === "PROCESSING",
  );
  assert.equal(processingUpdates.length, 1);

  const finalUpdate = calls.find(
    (c) => c.name === "employeeimportbatches" && (c.update.$set as Record<string, unknown>)?.state === "COMPLETED",
  );
  assert.ok(finalUpdate);

  const rowUpdates = calls.filter((c) => c.name === "employeeimportrows");
  assert.equal(rowUpdates.length, 2);

  setMockClient(null);
});

test("respects tenant quota limit — fails excess rows", async () => {
  const batchId = new ObjectId();
  let usersInserted = 0;

  setDb({
    employeeimportbatches: {
      findOne: async () => ({
        _id: batchId,
        tenantId: mockTenantId,
        state: "QUEUED",
        summary: { valid: 2, warning: 0, invalid: 0, skipped: 0, created: 0, failed: 0 },
      }),
      updateOne: async () => ({ matchedCount: 1, modifiedCount: 1 }),
    },
    employeeimportrows: {
      find: () => ({
        sort: () => ({
          toArray: async () => [
            {
              _id: new ObjectId(),
              batchId,
              tenantId: mockTenantId,
              rowNumber: 1,
              rawData: { email: "alice@test.com", firstName: "Alice" },
              state: "PENDING",
              idempotencyKey: "row-1",
            },
            {
              _id: new ObjectId(),
              batchId,
              tenantId: mockTenantId,
              rowNumber: 2,
              rawData: { email: "bob@test.com", firstName: "Bob" },
              state: "PENDING",
              idempotencyKey: "row-2",
            },
          ],
        }),
      }),
      updateOne: async () => ({ matchedCount: 1, modifiedCount: 1 }),
    },
    users: {
      countDocuments: async () => 20,
      findOne: async () => null,
      insertOne: async () => {
        usersInserted++;
        return { insertedId: new ObjectId() };
      },
    },
    emailmessages: {
      insertOne: async () => ({ insertedId: new ObjectId() }),
    },
    tenants: {
      findOne: async () => ({ _id: mockTenantId, plan: "free" }),
    },
  });

  const result = await runHandler(batchId.toString());

  assert.equal(result.summary!.created, 0);
  assert.equal(result.summary!.failed, 2);
  assert.equal(usersInserted, 0);

  setMockClient(null);
});

test("skips rows where user already exists", async () => {
  const batchId = new ObjectId();

  setDb({
    employeeimportbatches: {
      findOne: async () => ({
        _id: batchId,
        tenantId: mockTenantId,
        state: "QUEUED",
        summary: { valid: 1, warning: 0, invalid: 0, skipped: 0, created: 0, failed: 0 },
      }),
      updateOne: async () => ({ matchedCount: 1, modifiedCount: 1 }),
    },
    employeeimportrows: {
      find: () => ({
        sort: () => ({
          toArray: async () => [
            {
              _id: new ObjectId(),
              batchId,
              tenantId: mockTenantId,
              rowNumber: 1,
              rawData: { email: "alice@test.com", firstName: "Alice" },
              state: "PENDING",
              idempotencyKey: "row-1",
            },
          ],
        }),
      }),
      updateOne: async (_q: unknown, u: Record<string, unknown>) => {
        const setState = (u.$set as Record<string, unknown>)?.state;
        assert.ok(setState);
        return { matchedCount: 1, modifiedCount: 1 };
      },
    },
    users: {
      countDocuments: async () => 5,
      findOne: async () => ({
        _id: new ObjectId(),
        email: "alice@test.com",
        tenantId: mockTenantId,
      }),
      insertOne: async () => ({ insertedId: new ObjectId() }),
    },
    emailmessages: {
      insertOne: async () => ({ insertedId: new ObjectId() }),
    },
    tenants: {
      findOne: async () => ({ _id: mockTenantId, plan: "pro" }),
    },
  });

  const result = await runHandler(batchId.toString());

  assert.equal(result.summary!.created, 0);
  assert.equal(result.summary!.skipped, 1);
  assert.equal(result.summary!.failed, 0);

  setMockClient(null);
});

test("handles duplicate key error during user insert (E11000)", async () => {
  const batchId = new ObjectId();
  const existingUserId = new ObjectId();
  let insertAttempted = false;

  setDb({
    employeeimportbatches: {
      findOne: async () => ({
        _id: batchId,
        tenantId: mockTenantId,
        state: "QUEUED",
        summary: { valid: 1, warning: 0, invalid: 0, skipped: 0, created: 0, failed: 0 },
      }),
      updateOne: async () => ({ matchedCount: 1, modifiedCount: 1 }),
    },
    employeeimportrows: {
      find: () => ({
        sort: () => ({
          toArray: async () => [
            {
              _id: new ObjectId(),
              batchId,
              tenantId: mockTenantId,
              rowNumber: 1,
              rawData: { email: "alice@test.com", firstName: "Alice" },
              state: "PENDING",
              idempotencyKey: "row-1",
            },
          ],
        }),
      }),
      updateOne: async () => ({ matchedCount: 1, modifiedCount: 1 }),
    },
    users: {
      countDocuments: async () => 5,
      findOne: async () => {
        if (insertAttempted) {
          return { _id: existingUserId, email: "alice@test.com", tenantId: mockTenantId };
        }
        return null;
      },
      insertOne: async () => {
        insertAttempted = true;
        const err = new Error("E11000 duplicate key error") as Error & { code: number };
        err.code = 11000;
        throw err;
      },
    },
    emailmessages: {
      insertOne: async () => ({ insertedId: new ObjectId() }),
    },
    tenants: {
      findOne: async () => ({ _id: mockTenantId, plan: "pro" }),
    },
  });

  const result = await runHandler(batchId.toString());

  assert.equal(result.summary!.created, 1);
  assert.equal(result.summary!.failed, 0);

  setMockClient(null);
});

test("resumes from PROCESSING on crash recovery", async () => {
  const batchId = new ObjectId();

  setDb({
    employeeimportbatches: {
      findOne: async () => ({
        _id: batchId,
        tenantId: mockTenantId,
        state: "PROCESSING",
        summary: { valid: 2, warning: 0, invalid: 0, skipped: 0, created: 1, failed: 0 },
      }),
      updateOne: async () => ({ matchedCount: 1, modifiedCount: 1 }),
    },
    employeeimportrows: {
      find: () => ({
        sort: () => ({
          toArray: async () => [
            {
              _id: new ObjectId(),
              batchId,
              tenantId: mockTenantId,
              rowNumber: 2,
              rawData: { email: "bob@test.com", firstName: "Bob" },
              state: "PENDING",
              idempotencyKey: "row-2",
            },
            {
              _id: new ObjectId(),
              batchId,
              tenantId: mockTenantId,
              rowNumber: 3,
              rawData: { email: "carol@test.com", firstName: "Carol" },
              state: "FAILED",
              idempotencyKey: "row-3",
            },
          ],
        }),
      }),
      updateOne: async () => ({ matchedCount: 1, modifiedCount: 1 }),
    },
    users: {
      countDocuments: async () => 5,
      findOne: async () => null,
      insertOne: async () => ({ insertedId: new ObjectId() }),
    },
    emailmessages: {
      insertOne: async () => ({ insertedId: new ObjectId() }),
    },
    tenants: {
      findOne: async () => ({ _id: mockTenantId, plan: "pro" }),
    },
  });

  const result = await runHandler(batchId.toString());

  assert.equal(result.summary!.created, 2);
  assert.equal(result.summary!.failed, 0);

  setMockClient(null);
});

test("handles abort signal gracefully", async () => {
  const batchId = new ObjectId();
  const abortController = new AbortController();
  let firstRowDone = false;

  setDb({
    employeeimportbatches: {
      findOne: async () => ({
        _id: batchId,
        tenantId: mockTenantId,
        state: "QUEUED",
        summary: { valid: 2, warning: 0, invalid: 0, skipped: 0, created: 0, failed: 0 },
      }),
      updateOne: async () => ({ matchedCount: 1, modifiedCount: 1 }),
    },
    employeeimportrows: {
      find: () => ({
        sort: () => ({
          toArray: async () => [
            {
              _id: new ObjectId(),
              batchId,
              tenantId: mockTenantId,
              rowNumber: 1,
              rawData: { email: "alice@test.com", firstName: "Alice" },
              state: "PENDING",
              idempotencyKey: "row-1",
            },
            {
              _id: new ObjectId(),
              batchId,
              tenantId: mockTenantId,
              rowNumber: 2,
              rawData: { email: "bob@test.com", firstName: "Bob" },
              state: "PENDING",
              idempotencyKey: "row-2",
            },
          ],
        }),
      }),
      updateOne: async () => ({ matchedCount: 1, modifiedCount: 1 }),
    },
    users: {
      countDocuments: async () => 5,
      findOne: async () => null,
      insertOne: async () => {
        if (!firstRowDone) {
          firstRowDone = true;
          abortController.abort();
        }
        return { insertedId: new ObjectId() };
      },
    },
    emailmessages: {
      insertOne: async () => ({ insertedId: new ObjectId() }),
    },
    tenants: {
      findOne: async () => ({ _id: mockTenantId, plan: "pro" }),
    },
  });

  const result = await runHandler(batchId.toString(), { signal: abortController.signal });

  assert.ok(Number(result.summary!.created) >= 1);

  setMockClient(null);
});

test("creates EmailMessage document for each created user", async () => {
  const batchId = new ObjectId();
  const emailInsertCalls: Array<Record<string, unknown>> = [];

  setDb({
    employeeimportbatches: {
      findOne: async () => ({
        _id: batchId,
        tenantId: mockTenantId,
        state: "QUEUED",
        summary: { valid: 1, warning: 0, invalid: 0, skipped: 0, created: 0, failed: 0 },
      }),
      updateOne: async () => ({ matchedCount: 1, modifiedCount: 1 }),
    },
    employeeimportrows: {
      find: () => ({
        sort: () => ({
          toArray: async () => [
            {
              _id: new ObjectId(),
              batchId,
              tenantId: mockTenantId,
              rowNumber: 1,
              rawData: { email: "alice@test.com", firstName: "Alice" },
              state: "PENDING",
              idempotencyKey: "row-1",
            },
          ],
        }),
      }),
      updateOne: async () => ({ matchedCount: 1, modifiedCount: 1 }),
    },
    users: {
      countDocuments: async () => 5,
      findOne: async () => null,
      insertOne: async () => ({ insertedId: new ObjectId() }),
    },
    emailmessages: {
      insertOne: async (doc: Record<string, unknown>) => {
        emailInsertCalls.push(doc);
        return { insertedId: (doc._id as ObjectId) ?? new ObjectId() };
      },
    },
    tenants: {
      findOne: async () => ({ _id: mockTenantId, plan: "pro" }),
    },
  });

  await runHandler(batchId.toString());

  assert.equal(emailInsertCalls.length, 1);
  assert.equal(emailInsertCalls[0].templateId, "user_invitation");
  assert.equal(emailInsertCalls[0].recipientEmail, "alice@test.com");
  assert.equal(emailInsertCalls[0].state, "PENDING");

  setMockClient(null);
});

test("handles missing email field — marks row as failed", async () => {
  const batchId = new ObjectId();
  let rowState: string | undefined;

  setDb({
    employeeimportbatches: {
      findOne: async () => ({
        _id: batchId,
        tenantId: mockTenantId,
        state: "QUEUED",
        summary: { valid: 1, warning: 0, invalid: 0, skipped: 0, created: 0, failed: 0 },
      }),
      updateOne: async () => ({ matchedCount: 1, modifiedCount: 1 }),
    },
    employeeimportrows: {
      find: () => ({
        sort: () => ({
          toArray: async () => [
            {
              _id: new ObjectId(),
              batchId,
              tenantId: mockTenantId,
              rowNumber: 1,
              rawData: { firstName: "NoEmail" },
              state: "PENDING",
              idempotencyKey: "row-1",
            },
          ],
        }),
      }),
      updateOne: async (_q: unknown, u: Record<string, unknown>) => {
        rowState = (u.$set as Record<string, unknown>)?.state as string;
        return { matchedCount: 1, modifiedCount: 1 };
      },
    },
    users: {
      countDocuments: async () => 5,
      findOne: async () => null,
      insertOne: async () => ({ insertedId: new ObjectId() }),
    },
    emailmessages: {
      insertOne: async () => ({ insertedId: new ObjectId() }),
    },
    tenants: {
      findOne: async () => ({ _id: mockTenantId, plan: "pro" }),
    },
  });

  const result = await runHandler(batchId.toString());

  assert.equal(result.summary!.created, 0);
  assert.equal(result.summary!.failed, 1);
  assert.equal(rowState, "FAILED");

  setMockClient(null);
});
