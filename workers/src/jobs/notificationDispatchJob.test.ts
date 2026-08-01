import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ObjectId, type MongoClient } from "mongodb";
import { createNotificationDispatchJobHandler } from "./notificationDispatchJob.js";
import { setMockClient } from "../db/mongo.js";
import { PermanentJobError } from "../contracts/retryPolicy.js";
import type { JobHandlerContext } from "../contracts/jobDispatcher.js";
import type { NotificationTransportPort } from "../contracts/notificationTransport.js";

interface MockNotificationDoc {
  _id: ObjectId;
  tenantId: ObjectId;
  userId: ObjectId;
  type: string;
  priority: string;
  title: { en: string; ar: string };
  body: { en: string; ar: string };
  actions: Array<{ label: { en: string; ar: string }; url: string }>;
  createdAt: Date;
  deliveryStatus: string;
  lifecycleState: string;
  deliveredAt?: Date | null;
  failureReason?: string | null;
}

interface NotificationFindQuery {
  _id: { $in: ObjectId[] };
  tenantId?: ObjectId;
}

interface NotificationUpdateQuery {
  _id: ObjectId;
  deliveryStatus?: { $ne?: string };
  lifecycleState?: { $in?: string[] };
}

function makeDoc(
  id: ObjectId,
  tenantId: ObjectId,
  lifecycleState: string,
  deliveryStatus: string,
): MockNotificationDoc {
  return {
    _id: id,
    tenantId,
    userId: new ObjectId(),
    type: "processing_failed",
    priority: "normal",
    title: { en: "Document processing failed", ar: "فشل معالجة المستند" },
    body: { en: "Your document could not be processed.", ar: "تعذّرت معالجة مستندك." },
    actions: [],
    createdAt: new Date(),
    deliveryStatus,
    lifecycleState,
    deliveredAt: null,
    failureReason: null,
  };
}

/**
 * In-memory Mongo client harness mirroring emailSendJob.test.ts. The
 * `updateOne` mock honors the claim-guard filter semantics
 * (deliveryStatus != 'delivered' AND lifecycleState in [QUEUED, DISPATCHED]),
 * which is what makes the QA#10 concurrency test meaningful.
 */
function makeMockDb(initialDocs: MockNotificationDoc[]): {
  client: MongoClient;
  docs: Map<string, MockNotificationDoc>;
  dlqEntries: Array<Record<string, unknown>>;
} {
  const docs = new Map<string, MockNotificationDoc>();
  for (const doc of initialDocs) docs.set(doc._id.toString(), doc);
  const dlqEntries: Array<Record<string, unknown>> = [];

  const db = {
    collection: (name: string) => {
      if (name === "notifications") {
        return {
          find: (query: NotificationFindQuery) => {
            const ids = query._id.$in.map((oid) => oid.toString());
            const matches = [...docs.values()].filter((d) =>
              ids.includes(d._id.toString()),
            );
            return { toArray: async () => matches };
          },
          updateOne: async (query: NotificationUpdateQuery, update: { $set?: Record<string, unknown> }) => {
            const doc = docs.get(query._id.toString());
            if (!doc) return { matchedCount: 0, modifiedCount: 0 };
            if (query.deliveryStatus?.$ne && doc.deliveryStatus === query.deliveryStatus.$ne) {
              return { matchedCount: 0, modifiedCount: 0 };
            }
            if (
              query.lifecycleState?.$in &&
              !query.lifecycleState.$in.includes(doc.lifecycleState)
            ) {
              return { matchedCount: 0, modifiedCount: 0 };
            }
            const $set = update.$set ?? {};
            for (const [key, value] of Object.entries($set)) {
              (doc as unknown as Record<string, unknown>)[key] = value;
            }
            return { matchedCount: 1, modifiedCount: 1 };
          },
        };
      }
      if (name === "notificationdlqs") {
        return {
          insertOne: async (doc: Record<string, unknown>) => {
            dlqEntries.push(doc);
            return { insertedId: doc._id ?? "dlq-inserted" };
          },
        };
      }
      throw new Error(`unexpected collection: ${name}`);
    },
  };

  const client = { db: () => db } as unknown as MongoClient;
  return { client, docs, dlqEntries };
}

function makeCtx(payload: unknown): JobHandlerContext {
  return {
    envelope: {
      jobType: "notification.dispatch",
      schemaVersion: "1.0.0",
      tenantId: (payload as { tenantId: string }).tenantId,
      actorId: "actor-1",
      traceId: "trace-1",
      idempotencyKey: "idem-1",
      payload,
      createdAt: new Date().toISOString(),
    },
    traceId: "trace-1",
    isRetry: false,
    attemptsMade: 0,
    maxAttempts: 5,
    signal: new AbortController().signal,
    progress: () => {},
    enqueue: async () => ({ jobId: "", idempotencyKey: "", deduplicated: false }),
  };
}

function hashPayload(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value ?? {})).digest("hex");
}

test("happy path: two notificationIds → both delivered+VISIBLE, transport called once per doc", async () => {
  const tenantId = new ObjectId();
  const id1 = new ObjectId();
  const id2 = new ObjectId();
  const { client, docs } = makeMockDb([
    makeDoc(id1, tenantId, "QUEUED", "pending"),
    makeDoc(id2, tenantId, "QUEUED", "pending"),
  ]);
  setMockClient(client);

  const deliveredInputs: Array<{ notificationId: string; tenantId: string; userId: string }> = [];
  const fakeTransport: NotificationTransportPort = {
    deliver: async (input) => {
      deliveredInputs.push({
        notificationId: input.notificationId,
        tenantId: input.tenantId,
        userId: input.userId,
      });
      return { ok: true };
    },
  };

  const handler = createNotificationDispatchJobHandler(fakeTransport);
  const payload = {
    notificationIds: [id1.toString(), id2.toString()],
    tenantId: tenantId.toString(),
  };
  const result = await handler.handle(payload, makeCtx(payload));

  assert.equal(deliveredInputs.length, 2);
  assert.deepEqual(
    new Set(deliveredInputs.map((d) => d.notificationId)),
    new Set([id1.toString(), id2.toString()]),
  );
  assert.ok(deliveredInputs.every((d) => d.tenantId === tenantId.toString()));
  assert.ok(deliveredInputs.every((d) => d.userId.length > 0));

  assert.equal(docs.get(id1.toString())?.lifecycleState, "VISIBLE");
  assert.equal(docs.get(id1.toString())?.deliveryStatus, "delivered");
  assert.ok(docs.get(id1.toString())?.deliveredAt instanceof Date);
  assert.equal(docs.get(id2.toString())?.lifecycleState, "VISIBLE");
  assert.equal(docs.get(id2.toString())?.deliveryStatus, "delivered");

  assert.deepEqual(result, {
    summary: {
      notificationIds: [id1.toString(), id2.toString()],
      delivered: 2,
      skipped: 0,
    },
  });

  setMockClient(null);
});

test("idempotency: already-delivered doc → no re-transport (QA#2)", async () => {
  const tenantId = new ObjectId();
  const id = new ObjectId();
  const { client } = makeMockDb([makeDoc(id, tenantId, "VISIBLE", "delivered")]);
  setMockClient(client);

  let transportCalls = 0;
  const fakeTransport: NotificationTransportPort = {
    deliver: async () => {
      transportCalls += 1;
      return { ok: true };
    },
  };

  const handler = createNotificationDispatchJobHandler(fakeTransport);
  const payload = { notificationIds: [id.toString()], tenantId: tenantId.toString() };
  const result = await handler.handle(payload, makeCtx(payload));

  assert.equal(transportCalls, 0);
  assert.deepEqual(result, {
    summary: {
      notificationIds: [id.toString()],
      delivered: 0,
      skipped: 1,
    },
  });

  setMockClient(null);
});

test("invalid lifecycle state (CREATED) → skipped with no transport call", async () => {
  const tenantId = new ObjectId();
  const id = new ObjectId();
  const { client } = makeMockDb([makeDoc(id, tenantId, "CREATED", "pending")]);
  setMockClient(client);

  let transportCalls = 0;
  const fakeTransport: NotificationTransportPort = {
    deliver: async () => {
      transportCalls += 1;
      return { ok: true };
    },
  };

  const handler = createNotificationDispatchJobHandler(fakeTransport);
  const payload = { notificationIds: [id.toString()], tenantId: tenantId.toString() };
  const result = await handler.handle(payload, makeCtx(payload));

  assert.equal(transportCalls, 0);
  assert.deepEqual(result, {
    summary: {
      notificationIds: [id.toString()],
      delivered: 0,
      skipped: 1,
    },
  });

  setMockClient(null);
});

test("permanent transport failure → doc failed + reason, PermanentJobError, DLQ entry written", async () => {
  const tenantId = new ObjectId();
  const id1 = new ObjectId();
  const id2 = new ObjectId();
  const { client, docs, dlqEntries } = makeMockDb([
    makeDoc(id1, tenantId, "QUEUED", "pending"),
    makeDoc(id2, tenantId, "QUEUED", "pending"),
  ]);
  setMockClient(client);

  const fakeTransport: NotificationTransportPort = {
    deliver: async () => ({
      ok: false,
      errorCategory: "permanent",
      errorMessage: "recipient invalid",
    }),
  };

  const handler = createNotificationDispatchJobHandler(fakeTransport);
  const payload = {
    notificationIds: [id1.toString(), id2.toString()],
    tenantId: tenantId.toString(),
  };
  const ctx = makeCtx(payload);

  await assert.rejects(handler.handle(payload, ctx), PermanentJobError);

  assert.equal(docs.get(id1.toString())?.deliveryStatus, "failed");
  assert.equal(docs.get(id1.toString())?.failureReason, "recipient invalid");
  assert.equal(docs.get(id2.toString())?.deliveryStatus, "failed");

  assert.equal(dlqEntries.length, 1);
  const entry = dlqEntries[0];
  assert.equal(entry.jobId, "notification.dispatch__idem-1");
  assert.deepEqual(entry.notificationIds, [id1.toString(), id2.toString()]);
  assert.equal(entry.notificationCount, 2);
  assert.match(entry.reason as string, /permanent transport failure/);
  assert.equal(entry.payloadHash, hashPayload(ctx.envelope.payload));
  assert.ok(entry.failedAt instanceof Date);
  assert.equal(entry.replayedAt, null);

  setMockClient(null);
});

test("temporary transport failure → logged only, no retry throw, doc stays delivered (QA#2)", async () => {
  const tenantId = new ObjectId();
  const id = new ObjectId();
  const { client, docs, dlqEntries } = makeMockDb([
    makeDoc(id, tenantId, "QUEUED", "pending"),
  ]);
  setMockClient(client);

  const fakeTransport: NotificationTransportPort = {
    deliver: async () => ({ ok: false, errorCategory: "temporary", errorMessage: "socket down" }),
  };

  const handler = createNotificationDispatchJobHandler(fakeTransport);
  const payload = { notificationIds: [id.toString()], tenantId: tenantId.toString() };
  const result = await handler.handle(payload, makeCtx(payload));

  // No throw, doc already delivered+VISIBLE, REST polling covers the user.
  assert.deepEqual(result, {
    summary: {
      notificationIds: [id.toString()],
      delivered: 1,
      skipped: 0,
    },
  });
  assert.equal(docs.get(id.toString())?.deliveryStatus, "delivered");
  assert.equal(docs.get(id.toString())?.lifecycleState, "VISIBLE");
  assert.equal(dlqEntries.length, 0);

  setMockClient(null);
});

test("concurrent invocations for the same payload → each doc delivered exactly once (QA#10)", async () => {
  const tenantId = new ObjectId();
  const id1 = new ObjectId();
  const id2 = new ObjectId();
  const { client, docs, dlqEntries } = makeMockDb([
    makeDoc(id1, tenantId, "QUEUED", "pending"),
    makeDoc(id2, tenantId, "QUEUED", "pending"),
  ]);
  setMockClient(client);

  const transportCalls: string[] = [];
  const fakeTransport: NotificationTransportPort = {
    deliver: async (input) => {
      // Force a real interleaving so the two invocations overlap around the
      // persist-first claim guard.
      await new Promise((resolve) => setTimeout(resolve, 0));
      transportCalls.push(input.notificationId);
      return { ok: true };
    },
  };

  const handler = createNotificationDispatchJobHandler(fakeTransport);
  const payload = {
    notificationIds: [id1.toString(), id2.toString()],
    tenantId: tenantId.toString(),
  };
  const ctx = makeCtx(payload);

  await Promise.all([handler.handle(payload, ctx), handler.handle(payload, ctx)]);

  assert.equal(transportCalls.length, 2);
  const counts = new Map<string, number>();
  for (const id of transportCalls) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  assert.equal(counts.get(id1.toString()), 1);
  assert.equal(counts.get(id2.toString()), 1);
  assert.equal(docs.get(id1.toString())?.deliveryStatus, "delivered");
  assert.equal(docs.get(id2.toString())?.deliveryStatus, "delivered");
  assert.equal(dlqEntries.length, 0);

  setMockClient(null);
});
