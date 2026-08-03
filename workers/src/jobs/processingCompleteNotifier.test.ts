import test from "node:test";
import assert from "node:assert/strict";
import { MongoServerError, ObjectId, type MongoClient } from "mongodb";
import type { JobHandlerContext } from "../contracts/jobDispatcher.js";
import type {
  OutboxTriggerPort,
  TriggerEnvelope,
} from "../contracts/notificationOutboxPort.js";

// The config singleton parses env eagerly, so the fake Atlas URI must be set
// before any module that transitively imports config is evaluated.
process.env.MONGODB_URI =
  "mongodb+srv://test:test@mongo.test.invalid/documind-test";

const { withProcessingCompleteOutbox } = await import(
  "./processingCompleteNotifier.js"
);
const { RawOutboxWriter } = await import("../providers/rawOutboxWriter.js");
const { setMockClient } = await import("../db/mongo.js");

/**
 * T18 acceptance — processing_complete trigger wiring.
 *
 * The wrapper (withProcessingCompleteOutbox) must emit EXACTLY ONE outbox
 * trigger entry via the raw driver (RawOutboxWriter) ONLY when the wrapped
 * handler resolves `{ summary: { success: true, ... } }` — the extraction job's
 * terminal-success branch. Discarded/skipped summaries and thrown errors must
 * emit NOTHING. The envelope rides actorId "system" at the envelope level and
 * the default recipient (the document uploader, `documents.uploadedBy`, with
 * fallback to ctx.envelope.actorId) via BOTH metadata.recipients.userIds and
 * envelope recipientUserIds. Emitting is best-effort: a publishTrigger failure
 * is logged and swallowed, and the handler result always propagates unchanged.
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
  uploadedBy?: ObjectId | string;
}

/**
 * In-memory Mongo client harness (mirrors processingFailedNotifier.test.ts).
 * `notificationoutboxes.insertOne` reproduces the real driver's unique-index
 * behaviour (E11000 on {tenantId, eventId} duplicates), and `documents.findOne`
 * serves the best-effort uploader lookup inside emitProcessingComplete.
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

/** Failing-outbox recording port — publishTrigger records then rejects. */
class RejectingOutbox implements OutboxTriggerPort {
  calls: TriggerEnvelope[] = [];
  constructor(private readonly error: Error) {}
  async publishTrigger(event: TriggerEnvelope): Promise<void> {
    this.calls.push(event);
    throw this.error;
  }
}

/** Recording outbox port — used where no E11000 semantics are needed. */
class RecordingOutbox implements OutboxTriggerPort {
  calls: TriggerEnvelope[] = [];
  async publishTrigger(event: TriggerEnvelope): Promise<void> {
    this.calls.push(event);
  }
}

function makeCtx(opts: {
  tenantId: string;
  actorId: string;
  idempotencyKey: string;
}): JobHandlerContext {
  const { tenantId, actorId, idempotencyKey } = opts;
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
    isRetry: false,
    attemptsMade: 0,
    maxAttempts: 3,
    signal: new AbortController().signal,
    progress: () => {},
    enqueue: async () => ({ jobId: "", idempotencyKey: "", deduplicated: false }),
  };
}

/** toISOString() output — an ISO-8601 datetime WITH offset (trailing Z). */
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

test("(1) success summary → EXACTLY ONE processing_complete envelope (tenantId, actorId system, eventId, metadata, recipients)", async () => {
  const tenantId = new ObjectId();
  const documentId = new ObjectId();
  const uploaderId = new ObjectId();
  const actorId = "actor-1";
  const idempotencyKey = "idem-complete-1";

  const { client, outboxEntries } = makeMockDb([
    { _id: documentId, tenantId, uploadedBy: uploaderId },
  ]);
  setMockClient(client);

  const outbox = new RawOutboxWriter();
  const handle = withProcessingCompleteOutbox({
    outbox,
    handle: async () => ({ summary: { success: true, pages: 2, characters: 100 } }),
  });

  const payload = {
    documentId: documentId.toString(),
    tenantId: tenantId.toString(),
    documentVersion: 3,
  };
  const ctx = makeCtx({ tenantId: tenantId.toString(), actorId, idempotencyKey });

  const result = await handle(payload, ctx);

  assert.deepEqual(result, { summary: { success: true, pages: 2, characters: 100 } });
  assert.equal(outboxEntries.length, 1);

  const entry = outboxEntries[0];
  assert.equal(entry.kind, "trigger");
  assert.equal(entry.notificationType, "processing_complete");
  assert.equal(entry.state, "pending");
  assert.equal(entry.attempts, 0);
  assert.equal(entry.tenantId.toString(), tenantId.toString());
  assert.equal(entry.actorId, "system");
  assert.equal(entry.eventId, `${idempotencyKey}:complete`);
  assert.ok(entry.dedupKey && entry.dedupKey.startsWith("processing_complete:"));
  assert.ok(entry.dedupKey!.includes(documentId.toString()));

  const metadata = entry.payload.metadata as Record<string, unknown>;
  assert.equal(metadata.documentId, documentId.toString());
  assert.equal(metadata.version, 3);
  assert.equal(metadata.outcome, "success");
  assert.equal(typeof metadata.completedAt, "string");
  assert.match(metadata.completedAt as string, ISO_WITH_OFFSET);
  assert.ok(!Number.isNaN(Date.parse(metadata.completedAt as string)));
  assert.deepEqual(metadata.recipients, { userIds: [uploaderId.toString()] });

  assert.equal(entry.payload.traceId, "trace-1");
  assert.equal(entry.payload.type, "processing_complete");
  assert.deepEqual(entry.payload.recipientUserIds, [uploaderId.toString()]);

  setMockClient(null);
});

test("(2) discarded summary → NO envelope, handler result relayed", async () => {
  const tenantId = new ObjectId();
  const documentId = new ObjectId();
  const outbox = new RecordingOutbox();

  const handle = withProcessingCompleteOutbox({
    outbox,
    handle: async () => ({ summary: { discarded: true, reason: "version_not_found" } }),
  });

  const payload = {
    documentId: documentId.toString(),
    tenantId: tenantId.toString(),
    documentVersion: 1,
  };
  const ctx = makeCtx({ tenantId: tenantId.toString(), actorId: "actor-1", idempotencyKey: "idem-discard-1" });

  const result = await handle(payload, ctx);

  assert.deepEqual(result, { summary: { discarded: true, reason: "version_not_found" } });
  assert.equal(outbox.calls.length, 0);
});

test("(3) skip/idempotent (non-success) summary → NO envelope", async () => {
  const tenantId = new ObjectId();
  const documentId = new ObjectId();
  const outbox = new RecordingOutbox();

  const handle = withProcessingCompleteOutbox({
    outbox,
    handle: async () => ({ summary: { skipped: true, reason: "already_completed" } }),
  });

  const payload = {
    documentId: documentId.toString(),
    tenantId: tenantId.toString(),
    documentVersion: 1,
  };
  const ctx = makeCtx({ tenantId: tenantId.toString(), actorId: "actor-1", idempotencyKey: "idem-skip-1" });

  const result = await handle(payload, ctx);

  assert.deepEqual(result, { summary: { skipped: true, reason: "already_completed" } });
  assert.equal(outbox.calls.length, 0);
});

test("(4) handler throws → NO processing_complete envelope, error propagates unchanged", async () => {
  const tenantId = new ObjectId();
  const documentId = new ObjectId();
  const outbox = new RecordingOutbox();

  const handle = withProcessingCompleteOutbox({
    outbox,
    handle: async () => {
      throw new Error("boom");
    },
  });

  const payload = {
    documentId: documentId.toString(),
    tenantId: tenantId.toString(),
    documentVersion: 1,
  };
  const ctx = makeCtx({ tenantId: tenantId.toString(), actorId: "actor-1", idempotencyKey: "idem-fail-1" });

  await assert.rejects(
    handle(payload, ctx),
    (err: unknown) => err instanceof Error && err.message === "boom",
  );
  assert.equal(outbox.calls.length, 0);
});

test("(5) publishTrigger rejection is non-fatal: success result still returned", async () => {
  const tenantId = new ObjectId();
  const documentId = new ObjectId();
  const actorId = "actor-1";
  // No mock DB → uploader lookup skipped → recipient falls back to actorId.
  setMockClient(null);

  const outbox = new RejectingOutbox(new Error("outbox down"));
  const handle = withProcessingCompleteOutbox({
    outbox,
    handle: async () => ({ summary: { success: true, pages: 2, characters: 100 } }),
  });

  const payload = {
    documentId: documentId.toString(),
    tenantId: tenantId.toString(),
    documentVersion: 1,
  };
  const ctx = makeCtx({ tenantId: tenantId.toString(), actorId, idempotencyKey: "idem-nonfatal-1" });

  const result = await handle(payload, ctx);

  // Best-effort: publishTrigger was attempted exactly once and its rejection
  // was swallowed — the handler's success result is still delivered.
  assert.deepEqual(result, { summary: { success: true, pages: 2, characters: 100 } });
  assert.equal(outbox.calls.length, 1);
  assert.deepEqual(outbox.calls[0].recipientUserIds, [actorId]);
  assert.deepEqual(
    (outbox.calls[0].payload.metadata as { recipients: { userIds: string[] } }).recipients.userIds,
    [actorId],
  );
});

test("(6) missing documentId in payload → NO envelope, no throw", async () => {
  setMockClient(null);
  const outbox = new RecordingOutbox();

  const handle = withProcessingCompleteOutbox({
    outbox,
    handle: async () => ({ summary: { success: true, pages: 1, characters: 10 } }),
  });

  const payload = { tenantId: new ObjectId().toString(), documentVersion: 1 } as never;
  const ctx = makeCtx({ tenantId: new ObjectId().toString(), actorId: "actor-1", idempotencyKey: "idem-missing-1" });

  const result = await handle(payload, ctx);

  assert.deepEqual(result, { summary: { success: true, pages: 1, characters: 10 } });
  assert.equal(outbox.calls.length, 0);
});

test("(7) eventId is stable `${idempotencyKey}:complete` across same-occurrence re-runs (E11000 → one entry)", async () => {
  const tenantId = new ObjectId();
  const documentId = new ObjectId();
  const idempotencyKey = "idem-complete-2";

  const { client, outboxEntries } = makeMockDb([
    { _id: documentId, tenantId, uploadedBy: new ObjectId() },
  ]);
  setMockClient(client);

  const outbox = new RawOutboxWriter();
  const handle = withProcessingCompleteOutbox({
    outbox,
    handle: async () => ({ summary: { success: true, pages: 2, characters: 100 } }),
  });

  const payload = {
    documentId: documentId.toString(),
    tenantId: tenantId.toString(),
    documentVersion: 1,
  };
  const ctx = makeCtx({ tenantId: tenantId.toString(), actorId: "actor-1", idempotencyKey });

  // First run writes the occurrence.
  await handle(payload, ctx);
  assert.equal(outboxEntries.length, 1);
  assert.equal(outboxEntries[0].eventId, `${idempotencyKey}:complete`);

  // Re-run of the SAME job occurrence: same eventId → the unique
  // {tenantId, eventId} index E11000s → RawOutboxWriter skips → still one entry.
  await handle(payload, ctx);
  assert.equal(outboxEntries.length, 1);
  assert.equal(outboxEntries[0].eventId, `${idempotencyKey}:complete`);

  setMockClient(null);
});
