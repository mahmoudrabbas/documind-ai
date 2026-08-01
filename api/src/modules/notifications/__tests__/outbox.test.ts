import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import NotificationOutboxModel from "../../../db/models/notificationOutbox.model.js";
import AuditLogModel from "../../../db/models/auditLog.model.js";
import {
  NotificationOutboxDispatcher,
  type NotificationCreateResult,
  type NotificationCreatePort,
} from "../outbox/notificationOutbox.dispatcher.js";
import { createNotificationOutboxScheduler } from "../outbox/notificationOutbox.scheduler.js";
import type {
  EnqueueDispatchInput,
  NotificationEnqueuePort,
} from "../ports/notificationEnqueue.port.js";
import type { TriggerEnvelope } from "../ports/outboxTrigger.port.js";

// The dispatcher calls the T4 factory; mock it so this test is deterministic
// regardless of the factory's per-type builders (which a parallel sibling owns).
vi.mock("../factory/factory.js", () => ({
  createNotificationDraft: vi.fn(() => ({ type: "processing_failed", version: 1 })),
}));

const hasMongo = Boolean(process.env.MONGODB_URI);

class FakeCreatePort implements NotificationCreatePort {
  calls: Array<{ tenantId: string; draft: unknown; recipientUserIds: string[] }> = [];
  result: NotificationCreateResult = {
    results: [],
    createdIds: [],
    updatedIds: [],
    ignoredCount: 0,
  };
  async create(tenantId: string, draft: unknown, recipientUserIds: string[]): Promise<NotificationCreateResult> {
    this.calls.push({ tenantId, draft, recipientUserIds });
    return this.result;
  }
}

class FakeQueuePort implements NotificationEnqueuePort {
  enqueued: EnqueueDispatchInput[] = [];
  fail = false;
  failuresRemaining = 0;
  async enqueueDispatch(input: EnqueueDispatchInput): Promise<void> {
    if (this.fail || this.failuresRemaining > 0) {
      if (this.failuresRemaining > 0) this.failuresRemaining -= 1;
      throw new Error("queue_rejected");
    }
    this.enqueued.push(input);
  }
}

const TENANT_ID = new mongoose.Types.ObjectId();
const USER_IDS = ["user-1", "user-2", "user-3"];
const EVENT_ID = "job-idempotency-key:ocr";

function createdResult(ids: string[]): NotificationCreateResult {
  return {
    results: ids.map((notificationId, i) => ({
      userId: USER_IDS[i] ?? `user-${i}`,
      notificationId,
      action: "created" as const,
    })),
    createdIds: ids,
    updatedIds: [],
    ignoredCount: 0,
  };
}

function triggerEnvelope(): TriggerEnvelope {
  return {
    eventId: EVENT_ID,
    type: "processing_failed",
    tenantId: TENANT_ID.toString(),
    actorId: "actor-1",
    dedupKey: "processing_failed:doc_123:42",
    recipientUserIds: USER_IDS,
    payload: {
      documentId: "doc_123",
      documentTitle: "Q3 Report",
      errorCode: "OCR_TIMEOUT",
      stage: "ocr",
      retryable: true,
    },
  };
}

async function insertTriggerEntry(
  overrides: Record<string, unknown> = {},
): Promise<mongoose.HydratedDocument<import("../../../db/models/notificationOutbox.model.js").NotificationOutboxDocument>> {
  const entry = await NotificationOutboxModel.create({
    tenantId: TENANT_ID,
    eventId: EVENT_ID,
    kind: "trigger",
    notificationType: "processing_failed",
    dedupKey: "processing_failed:doc_123:42",
    actorId: "actor-1",
    payload: { ...triggerEnvelope().payload, type: "processing_failed", recipientUserIds: USER_IDS },
    attempts: 0,
    state: "pending",
    nextAttemptAt: new Date(),
    ...overrides,
  });
  return entry;
}

describe.skipIf(!hasMongo)("NotificationOutboxDispatcher", () => {
  let connectedByThisFile = false;
  let createPort: FakeCreatePort;
  let queuePort: FakeQueuePort;
  let dispatcher: NotificationOutboxDispatcher;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI as string);
      connectedByThisFile = true;
    }
    await NotificationOutboxModel.init();
    await AuditLogModel.init();
  });

  afterAll(async () => {
    if (connectedByThisFile) await mongoose.disconnect();
  });

  beforeEach(async () => {
    await NotificationOutboxModel.deleteMany({});
    await AuditLogModel.deleteMany({});
    createPort = new FakeCreatePort();
    queuePort = new FakeQueuePort();
    dispatcher = new NotificationOutboxDispatcher(createPort, queuePort);
  });

  it("claim trigger → factory → create → 'created' → enqueue with notificationIds/actorId/traceId=eventId", async () => {
    createPort.result = createdResult(["notif-0", "notif-1", "notif-2"]);
    const entry = await insertTriggerEntry();

    const outcome = await dispatcher.dispatchEvent(TENANT_ID.toString(), entry.eventId);

    expect(outcome).toBe("dispatched");
    expect(createPort.calls).toHaveLength(1);
    expect(createPort.calls[0].tenantId).toBe(TENANT_ID.toString());
    expect(createPort.calls[0].recipientUserIds).toEqual(USER_IDS);
    expect(queuePort.enqueued).toHaveLength(1);
    expect(queuePort.enqueued[0]).toMatchObject({
      notificationIds: ["notif-0", "notif-1", "notif-2"],
      tenantId: TENANT_ID.toString(),
      actorId: "actor-1",
      traceId: EVENT_ID,
      idempotencyKey: EVENT_ID,
    });
    const updated = await NotificationOutboxModel.findById(entry._id).lean();
    expect(updated!.state).toBe("dispatched");
    expect(updated!.claimExpiresAt).toBeNull();
  });

  it("'updated' result → dispatched without enqueue (in-window dedup)", async () => {
    createPort.result = {
      results: [{ userId: "user-1", notificationId: "notif-1", action: "updated" }],
      createdIds: [],
      updatedIds: ["notif-1"],
      ignoredCount: 0,
    };
    const entry = await insertTriggerEntry();

    const outcome = await dispatcher.dispatchEvent(TENANT_ID.toString(), entry.eventId);

    expect(outcome).toBe("dispatched");
    expect(queuePort.enqueued).toHaveLength(0);
    const updated = await NotificationOutboxModel.findById(entry._id).lean();
    expect(updated!.state).toBe("dispatched");
  });

  it("'ignored' result → nothing enqueued", async () => {
    createPort.result = {
      results: [{ userId: "user-1", notificationId: null, action: "ignored" }],
      createdIds: [],
      updatedIds: [],
      ignoredCount: 1,
    };
    const entry = await insertTriggerEntry();

    const outcome = await dispatcher.dispatchEvent(TENANT_ID.toString(), entry.eventId);

    expect(outcome).toBe("dispatched");
    expect(queuePort.enqueued).toHaveLength(0);
  });

  it("enqueue failure → retry_pending with nextAttemptAt = now + backoff(1)", async () => {
    createPort.result = createdResult(["notif-0"]);
    queuePort.fail = true;
    const entry = await insertTriggerEntry();
    const before = Date.now();

    const outcome = await dispatcher.dispatchEvent(TENANT_ID.toString(), entry.eventId);

    expect(outcome).toBe("retry_pending");
    const updated = await NotificationOutboxModel.findById(entry._id).lean();
    expect(updated!.state).toBe("retry_pending");
    expect(updated!.attempts).toBe(1);
    expect(updated!.failureCode).toBe("DISPATCH_FAILED");
    expect(updated!.failedAt).toBeNull();
    expect(updated!.claimExpiresAt).toBeNull();
    const expected = before + Math.min(60_000, 1000 * 2 ** Math.max(0, 1 - 1));
    expect(updated!.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(expected - 100);
    expect(updated!.nextAttemptAt.getTime()).toBeLessThanOrEqual(expected + 5_000);
  });

  it("5th failure → dead_letter with failureCode RETRY_EXHAUSTED", async () => {
    createPort.result = createdResult(["notif-0"]);
    queuePort.fail = true;
    const entry = await insertTriggerEntry({ attempts: 4 });

    const outcome = await dispatcher.dispatchEvent(TENANT_ID.toString(), entry.eventId);

    expect(outcome).toBe("dead_letter");
    const updated = await NotificationOutboxModel.findById(entry._id).lean();
    expect(updated!.state).toBe("dead_letter");
    expect(updated!.attempts).toBe(5);
    expect(updated!.failureCode).toBe("RETRY_EXHAUSTED");
    expect(updated!.failedAt).not.toBeNull();
  });

  it("duplicate eventId insert → E11000 treated as already-written (no double enqueue)", async () => {
    await dispatcher.publishTrigger(triggerEnvelope());
    await expect(dispatcher.publishTrigger(triggerEnvelope())).resolves.toBeUndefined();

    expect(await NotificationOutboxModel.countDocuments({ eventId: EVENT_ID })).toBe(1);

    createPort.result = createdResult(["notif-0"]);
    await dispatcher.dispatchPending(TENANT_ID.toString(), 50);
    expect(queuePort.enqueued).toHaveLength(1);
  });

  it("dispatchPending claims at most the batch limit (≤ 50)", async () => {
    createPort.result = createdResult(["notif-x"]);
    for (let i = 0; i < 60; i += 1) {
      await insertTriggerEntry({ eventId: `job-${i}:stage`, dedupKey: `key-${i}` });
    }

    const totals = await dispatcher.dispatchPending(TENANT_ID.toString(), 50);

    expect(totals.claimed).toBe(50);
    expect(totals.dispatched).toBe(50);
    expect(totals.retryPending).toBe(0);
    expect(totals.deadLetter).toBe(0);
    expect(queuePort.enqueued).toHaveLength(50);
    expect(await NotificationOutboxModel.countDocuments({ state: "pending" })).toBe(10);
  });

  it("scheduler tick claims and processes a pending entry within one tick", async () => {
    const scheduler = createNotificationOutboxScheduler({
      dispatcher,
      intervalMs: 5_000,
      maxBatch: 50,
    });
    createPort.result = createdResult(["notif-0"]);
    const entry = await insertTriggerEntry();

    const totals = await scheduler.tick();

    expect(totals.tenantsScanned).toBe(1);
    expect(totals.claimed).toBe(1);
    expect(totals.dispatched).toBe(1);
    expect(queuePort.enqueued).toHaveLength(1);
    expect(queuePort.enqueued[0].traceId).toBe(EVENT_ID);
    const updated = await NotificationOutboxModel.findById(entry._id).lean();
    expect(updated!.state).toBe("dispatched");
    scheduler.stop();
  });

  it("scheduler start()/stop() lifecycle manages the interval timer", async () => {
    const scheduler = createNotificationOutboxScheduler({ dispatcher, intervalMs: 1_000 });
    const timer = scheduler.start();
    expect(timer).not.toBeNull();
    scheduler.stop();
    scheduler.stop();
  });

  it("writes audit action NOTIFICATION_DISPATCHED on a successful dispatch", async () => {
    createPort.result = createdResult(["notif-0", "notif-1"]);
    const entry = await insertTriggerEntry();

    await dispatcher.dispatchEvent(TENANT_ID.toString(), entry.eventId);

    const audit = await AuditLogModel.findOne({ action: "NOTIFICATION_DISPATCHED" })
      .lean()
      .exec();
    expect(audit).not.toBeNull();
    expect(audit!.resourceId).toBe(EVENT_ID);
    expect(audit!.tenantId.toString()).toBe(TENANT_ID.toString());
    expect(audit!.metadata).toMatchObject({
      eventId: EVENT_ID,
      kind: "trigger",
      notificationType: "processing_failed",
      createdCount: 2,
      updatedCount: 0,
      ignoredCount: 0,
    });
  });

  it("handleDispatch marks a dispatch-kind entry dispatched without double-enqueue", async () => {
    const dispatchEntry = await NotificationOutboxModel.create({
      tenantId: TENANT_ID,
      eventId: "dispatch-1",
      kind: "dispatch",
      notificationType: "processing_failed",
      dedupKey: null,
      actorId: "actor-1",
      payload: { notificationIds: ["notif-0"], tenantId: TENANT_ID.toString() },
      attempts: 0,
      state: "pending",
      nextAttemptAt: new Date(),
    });

    const outcome = await dispatcher.dispatchEvent(TENANT_ID.toString(), dispatchEntry.eventId);

    expect(outcome).toBe("dispatched");
    expect(queuePort.enqueued).toHaveLength(0);
    const updated = await NotificationOutboxModel.findById(dispatchEntry._id).lean();
    expect(updated!.state).toBe("dispatched");
  });
});
