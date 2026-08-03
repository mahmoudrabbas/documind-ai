import test from "node:test";
import assert from "node:assert/strict";
import { MongoServerError, ObjectId, type MongoClient } from "mongodb";
import { PermanentJobError, RetryableJobError } from "../contracts/retryPolicy.js";
import type { JobHandlerContext } from "../contracts/jobDispatcher.js";

// The config singleton parses env eagerly, so the fake Atlas URI must be set
// before any module that transitively imports config is evaluated.
process.env.MONGODB_URI =
  "mongodb+srv://test:test@mongo.test.invalid/documind-test";

const { withProcessingFailedOutbox } = await import(
  "./processingFailedNotifier.js"
);
const { RawOutboxWriter } = await import("../providers/rawOutboxWriter.js");
const { setMockClient } = await import("../db/mongo.js");

/**
 * T9 acceptance — processing_failed trigger wiring.
 *
 * The wrapper (withProcessingFailedOutbox) must emit EXACTLY ONE outbox
 * trigger entry via the raw driver (RawOutboxWriter) when the wrapped handler
 * fails TERMINALLY — PermanentJobError thrown, or RetryableJobError on the
 * FINAL attempt (ctx.attemptsMade + 1 >= ctx.maxAttempts). A retryable
 * non-terminal failure must emit NOTHING, and a job retry that re-runs the
 * same occurrence (same eventId `${idempotencyKey}:${stage}`) must NOT write a
 * second entry (the {tenantId, eventId} unique index → E11000 → skip).
 *
 * These four cases are the plan T9 acceptance criteria (a)-(d).
 */

interface OutboxEntry {
  tenantId: ObjectId;
  eventId: string;
  kind: "trigger";
  notificationType: string;
  dedupKey: string | null;
  actorId: string;
  payload: Record<string, unknown>;
  attempts: number;
  state: string;
  nextAttemptAt: Date;
  claimExpiresAt: null;
  failureCode: null;
  failedAt: null;
  createdAt: Date;
  updatedAt: Date;
}

interface MockDocument {
  _id: ObjectId;
  tenantId: ObjectId;
  metadata?: { title?: string };
  fileName?: string;
}

/**
 * In-memory Mongo client harness (mirrors notificationDispatchJob.test.ts).
 * `notificationoutboxes.insertOne` reproduces the real driver's unique-index
 * behaviour: a second insert for the same {tenantId, eventId} throws a real
 * MongoServerError (code 11000), which is what RawOutboxWriter treats as
 * already-written (E11000 → skip). `documents.findOne` serves the best-effort
 * title lookup inside emitProcessingFailed.
 */
function makeMockDb(initialDocs: MockDocument[] = []): {
  client: MongoClient;
  outboxEntries: OutboxEntry[];
} {
  const outboxEntries: OutboxEntry[] = [];
  const documents = new Map<string, MockDocument>();
  for (const doc of initialDocs) documents.set(doc._id.toString(), doc);

  const db = {
    collection: (name: string) => {
      if (name === "notificationoutboxes") {
        return {
          insertOne: async (doc: OutboxEntry) => {
            const duplicate = outboxEntries.some(
              (entry) =>
                entry.eventId === doc.eventId &&
                entry.tenantId.toString() === doc.tenantId.toString(),
            );
            if (duplicate) {
              throw new MongoServerError({
                message:
                  "E11000 duplicate key error: duplicate key on {tenantId, eventId}",
                errmsg:
                  "E11000 duplicate key error collection: notificationoutboxes",
                code: 11000,
                keyPattern: { tenantId: 1, eventId: 1 },
                keyValue: { tenantId: doc.tenantId, eventId: doc.eventId },
              });
            }
            outboxEntries.push(doc);
            return { insertedId: new ObjectId() };
          },
        };
      }
      if (name === "documents") {
        return {
          findOne: async (query: { _id: ObjectId; tenantId: ObjectId }) => {
            const doc = documents.get(query._id.toString());
            if (doc && doc.tenantId.toString() === query.tenantId.toString()) {
              return doc;
            }
            return null;
          },
        };
      }
      throw new Error(`unexpected collection: ${name}`);
    },
  };

  const client = { db: () => db } as unknown as MongoClient;
  return { client, outboxEntries };
}

function makeCtx(opts: {
  tenantId: string;
  actorId: string;
  idempotencyKey: string;
  attemptsMade: number;
  maxAttempts: number;
}): JobHandlerContext {
  const { tenantId, actorId, idempotencyKey, attemptsMade, maxAttempts } = opts;
  return {
    envelope: {
      jobType: "document.extract",
      schemaVersion: "1.0.0",
      tenantId,
      actorId,
      traceId: "trace-1",
      idempotencyKey,
      payload: { documentId: "", tenantId },
      createdAt: new Date().toISOString(),
    },
    traceId: "trace-1",
    isRetry: attemptsMade > 0,
    attemptsMade,
    maxAttempts,
    signal: new AbortController().signal,
    progress: () => {},
    enqueue: async () => ({ jobId: "", idempotencyKey: "", deduplicated: false }),
  };
}

test("(a) PermanentJobError terminal → EXACTLY ONE outbox entry with correct tenantId/actorId/eventId/dedupKey via raw driver", async () => {
  const tenantId = new ObjectId();
  const documentId = new ObjectId();
  const actorId = "actor-1";
  const idempotencyKey = "idem-extract-1";

  const { client, outboxEntries } = makeMockDb([
    {
      _id: documentId,
      tenantId,
      metadata: { title: "Policy Manual" },
    },
  ]);
  setMockClient(client);

  const outbox = new RawOutboxWriter();
  const handle = withProcessingFailedOutbox({
    outbox,
    stage: "extraction",
    handle: async () => {
      throw new PermanentJobError("The PDF is encrypted");
    },
  });

  const payload = { documentId: documentId.toString(), tenantId: tenantId.toString() };
  const ctx = makeCtx({ tenantId: tenantId.toString(), actorId, idempotencyKey, attemptsMade: 0, maxAttempts: 3 });

  await assert.rejects(handle(payload, ctx), PermanentJobError);

  assert.equal(outboxEntries.length, 1);
  const entry = outboxEntries[0];
  assert.equal(entry.tenantId.toString(), tenantId.toString());
  assert.equal(entry.actorId, actorId);
  assert.equal(entry.eventId, `${idempotencyKey}:extraction`);
  assert.equal(entry.kind, "trigger");
  assert.equal(entry.notificationType, "processing_failed");
  assert.equal(entry.state, "pending");
  assert.equal(entry.attempts, 0);
  assert.ok(entry.dedupKey && entry.dedupKey.startsWith("processing_failed:"));
  assert.ok(entry.dedupKey!.includes(documentId.toString()));

  const metadata = entry.payload.metadata as Record<string, unknown>;
  assert.deepEqual(metadata, {
    documentId: documentId.toString(),
    documentTitle: "Policy Manual",
    errorCode: "encrypted",
    stage: "extraction",
    retryable: false,
  });
  assert.equal(entry.payload.traceId, "trace-1");
  assert.equal(entry.payload.type, "processing_failed");
  assert.deepEqual(entry.payload.recipientUserIds, [actorId]);

  setMockClient(null);
});

test("(b) RetryableJobError on FINAL attempt → EXACTLY ONE entry (retryable:true)", async () => {
  const tenantId = new ObjectId();
  const documentId = new ObjectId();
  const idempotencyKey = "idem-ocr-1";

  const { client, outboxEntries } = makeMockDb([]);
  setMockClient(client);

  const outbox = new RawOutboxWriter();
  const handle = withProcessingFailedOutbox({
    outbox,
    stage: "ocr",
    handle: async () => {
      throw new RetryableJobError("OCR service timed out");
    },
  });

  const payload = { documentId: documentId.toString(), tenantId: tenantId.toString() };
  // Final attempt: attemptsMade 2 + 1 === maxAttempts 3 → terminal.
  const ctx = makeCtx({ tenantId: tenantId.toString(), actorId: "actor-1", idempotencyKey, attemptsMade: 2, maxAttempts: 3 });

  await assert.rejects(handle(payload, ctx), RetryableJobError);

  assert.equal(outboxEntries.length, 1);
  const entry = outboxEntries[0];
  assert.equal(entry.eventId, `${idempotencyKey}:ocr`);
  assert.equal(entry.notificationType, "processing_failed");
  const metadata = entry.payload.metadata as Record<string, unknown>;
  assert.equal(metadata.stage, "ocr");
  assert.equal(metadata.errorCode, "timeout");
  assert.equal(metadata.retryable, true);

  setMockClient(null);
});

test("(c) retryable NON-terminal → ZERO outbox entries", async () => {
  const tenantId = new ObjectId();
  const documentId = new ObjectId();

  const { client, outboxEntries } = makeMockDb([]);
  setMockClient(client);

  const outbox = new RawOutboxWriter();
  const handle = withProcessingFailedOutbox({
    outbox,
    stage: "extraction",
    handle: async () => {
      throw new RetryableJobError("Database connection unavailable");
    },
  });

  const payload = { documentId: documentId.toString(), tenantId: tenantId.toString() };
  // Non-terminal: attemptsMade 0 + 1 < maxAttempts 3 → job will be retried.
  const ctx = makeCtx({ tenantId: tenantId.toString(), actorId: "actor-1", idempotencyKey: "idem-retry-1", attemptsMade: 0, maxAttempts: 3 });

  await assert.rejects(handle(payload, ctx), RetryableJobError);

  assert.equal(outboxEntries.length, 0);

  setMockClient(null);
});

test("(d) re-run same job (same idempotencyKey) → NO second entry (E11000 → skip)", async () => {
  const tenantId = new ObjectId();
  const documentId = new ObjectId();
  const idempotencyKey = "idem-extract-2";

  const { client, outboxEntries } = makeMockDb([]);
  setMockClient(client);

  const outbox = new RawOutboxWriter();
  const handle = withProcessingFailedOutbox({
    outbox,
    stage: "extraction",
    handle: async () => {
      throw new PermanentJobError("malformed file");
    },
  });

  const payload = { documentId: documentId.toString(), tenantId: tenantId.toString() };
  const ctx = makeCtx({ tenantId: tenantId.toString(), actorId: "actor-1", idempotencyKey, attemptsMade: 0, maxAttempts: 3 });

  // First run: terminal failure → one entry written.
  await assert.rejects(handle(payload, ctx), PermanentJobError);
  assert.equal(outboxEntries.length, 1);

  // Re-run of the SAME job occurrence: same eventId → the unique
  // {tenantId, eventId} index E11000s → RawOutboxWriter skips → still one entry.
  await assert.rejects(handle(payload, ctx), PermanentJobError);
  assert.equal(outboxEntries.length, 1);
  assert.equal(outboxEntries[0].eventId, `${idempotencyKey}:extraction`);

  setMockClient(null);
});
