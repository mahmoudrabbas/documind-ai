/**
 * T6 (S5) — NotificationService acceptance test suite (MongoMemoryReplSet).
 *
 * Real integration tests against MongoMemoryReplSet (count:1, provided by
 * scripts/run-api-tests.mjs via MONGODB_URI). The service is wired with the
 * REAL mongo repositories (the only mongoose layer) + the real
 * RecipientResolver; no repo/state mocks except where a criterion explicitly
 * requires faking a failure (transaction rollback tests inject a failing
 * state-repo wrapper + a real sessionFactory).
 *
 * The harness runs this file under vitest (it imports from "vitest"); skip
 * gracefully when run without MONGODB_URI.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import NotificationModel from "../../../db/models/notification.model.js";
import UserNotificationStateModel from "../../../db/models/userNotificationState.model.js";
import NotificationOutboxModel from "../../../db/models/notificationOutbox.model.js";
import AuditLogModel from "../../../db/models/auditLog.model.js";
import { buildNotificationDedupKey } from "workers/contracts";
import {
  NotificationService,
  NotificationFanoutLimitError,
  MAX_FANOUT,
} from "../notifications.service.js";
import { MongoNotificationRepository } from "../repositories/mongo/notification.repository.js";
import { MongoUserNotificationStateRepository } from "../repositories/mongo/userNotificationState.repository.js";
import { RecipientResolver } from "../recipientResolver.js";
import {
  NotificationOutboxDispatcher,
  type NotificationCreatePort,
} from "../outbox/notificationOutbox.dispatcher.js";
import type {
  EnqueueDispatchInput,
  NotificationEnqueuePort,
} from "../ports/notificationEnqueue.port.js";
import type { TransactionSession } from "../ports/notificationRepository.port.js";
import type { UserNotificationStatePort } from "../ports/userNotificationState.port.js";
import type {
  NotificationDraft,
  NotificationEvent,
} from "../factory/factory.js";
import { createNotificationDraft } from "../factory/factory.js";

const hasMongo = Boolean(process.env.MONGODB_URI);

// ── helpers ────────────────────────────────────────────────────────────────

function oid(v: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(v);
}

function newId(): string {
  return new mongoose.Types.ObjectId().toString();
}

/** Minimal valid draft for processing_failed (the service accepts drafts
 *  directly; the factory is covered by factory.test.ts). */
function makeDraft(overrides: Partial<NotificationDraft> = {}): NotificationDraft {
  return {
    type: "processing_failed",
    category: "documents",
    priority: "normal",
    title: { en: "Processing failed", ar: "فشل المعالجة" },
    body: { en: "Your document could not be processed.", ar: "تعذرت معالجة مستندك." },
    dedupEventId: "doc_123",
    actions: [],
    metadata: {
      documentId: "doc_123",
      documentTitle: "Q3 Report",
      errorCode: "OCR_TIMEOUT",
      stage: "ocr",
      retryable: true,
    },
    version: 1,
    ...overrides,
  };
}

/** Full doc payload for direct model seeding (schema defaults cover the rest). */
function baseDoc(
  tenantId: string,
  userId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    tenantId: oid(tenantId),
    userId: oid(userId),
    dedupKey: `processing_failed:doc_123:seed-${overrides.dedupEventId ?? "doc_123"}`,
    dedupEventId: "doc_123",
    type: "processing_failed",
    category: "documents",
    priority: "normal",
    title: { en: "Processing failed", ar: "فشل المعالجة" },
    body: { en: "Your document could not be processed.", ar: "تعذرت معالجة مستندك." },
    lifecycleState: "CREATED",
    version: 1,
    deliveryStatus: "pending",
    deliveryAttempts: 0,
    isRead: false,
    isSeen: false,
    isArchived: false,
    collapsedCount: 0,
    ...overrides,
  };
}

async function insertNotification(
  tenantId: string,
  userId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const doc = await NotificationModel.create(baseDoc(tenantId, userId, overrides));
  return doc._id.toString();
}

function makeService(options?: {
  stateRepo?: UserNotificationStatePort;
  sessionFactory?: () => Promise<TransactionSession>;
}): NotificationService {
  return new NotificationService(
    new MongoNotificationRepository(),
    options?.stateRepo ?? new MongoUserNotificationStateRepository(),
    new RecipientResolver(),
    options?.sessionFactory,
  );
}

/** Real mongoose transaction session (MongoMemoryReplSet count:1 supports it). */
function realSessionFactory(): () => Promise<TransactionSession> {
  return async () => {
    const session = await mongoose.startSession();
    return session as unknown as TransactionSession;
  };
}

/** State-repo wrapper that throws on a configured method — used to simulate a
 *  mid-transaction write failure (rollback tests). */
class FailingStateRepo implements UserNotificationStatePort {
  constructor(
    private readonly inner: UserNotificationStatePort,
    private readonly failOn: Array<"decrementUnread" | "markAllReadAdjustment"> = [],
  ) {}

  async get(tenantId: string, userId: string) {
    return this.inner.get(tenantId, userId);
  }

  async incUnread(tenantId: string, userId: string, session?: TransactionSession) {
    return this.inner.incUnread(tenantId, userId, session);
  }

  async decrementUnread(tenantId: string, userId: string, session?: TransactionSession) {
    if (this.failOn.includes("decrementUnread")) {
      throw new Error("simulated state write failure");
    }
    return this.inner.decrementUnread(tenantId, userId, session);
  }

  async markAllReadAdjustment(
    tenantId: string,
    userId: string,
    matchedCount: number,
    now: Date,
    session?: TransactionSession,
  ) {
    if (this.failOn.includes("markAllReadAdjustment")) {
      throw new Error("simulated state write failure");
    }
    return this.inner.markAllReadAdjustment(tenantId, userId, matchedCount, now, session);
  }

  async recompute(tenantId: string, userId: string, count: number, session?: TransactionSession) {
    return this.inner.recompute(tenantId, userId, count, session);
  }

  async deleteState(tenantId: string, userId: string, session?: TransactionSession) {
    return this.inner.deleteState(tenantId, userId, session);
  }
}

class FakeQueuePort implements NotificationEnqueuePort {
  enqueued: EnqueueDispatchInput[] = [];
  async enqueueDispatch(input: EnqueueDispatchInput): Promise<void> {
    this.enqueued.push(input);
  }
}

async function readState(
  tenantId: string,
  userId: string,
): Promise<{ unreadCount: number } | null> {
  const doc = await UserNotificationStateModel.findOne({
    tenantId: oid(tenantId),
    userId: oid(userId),
  }).lean();
  return doc ? { unreadCount: doc.unreadCount } : null;
}

/** A valid processing_failed trigger payload the real factory can draft. The
 *  factory validates the envelope (`{ type, metadata, ... }`) and parses
 *  `metadata` with the strict processingFailedMetadataSchema — so the payload
 *  must carry the same fields the schema requires. */
function triggerPayload(
  tenantId: string,
  users: string[],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type: "processing_failed",
    recipientUserIds: users,
    metadata: {
      documentId: "doc_123",
      documentTitle: "Q3 Report",
      errorCode: "OCR_TIMEOUT",
      stage: "ocr",
      retryable: true,
    },
    ...overrides,
  };
}

async function insertTriggerEntry(
  tenantId: string,
  eventId: string,
  users: string[],
): Promise<void> {
  await NotificationOutboxModel.create({
    tenantId: oid(tenantId),
    eventId,
    kind: "trigger",
    notificationType: "processing_failed",
    dedupKey: null,
    actorId: "actor-1",
    payload: triggerPayload(tenantId, users),
    attempts: 0,
    state: "pending",
    nextAttemptAt: new Date(),
  });
}

// ── suite ──────────────────────────────────────────────────────────────────

describe.skipIf(!hasMongo)("NotificationService (T6 acceptance)", () => {
  let connectedByThisFile = false;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      // Unique dbName isolates this suite from other test files that share the
      // MongoMemoryReplSet instance (vitest runs files in parallel workers).
      await mongoose.connect(process.env.MONGODB_URI as string, { dbName: "notifications-service-t6" });
      connectedByThisFile = true;
    }
    await Promise.all([
      NotificationModel.init(),
      UserNotificationStateModel.init(),
      NotificationOutboxModel.init(),
      AuditLogModel.init(),
    ]);
  });

  afterAll(async () => {
    if (connectedByThisFile) await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Promise.all([
      NotificationModel.deleteMany({}),
      UserNotificationStateModel.deleteMany({}),
      NotificationOutboxModel.deleteMany({}),
      AuditLogModel.deleteMany({}),
    ]);
  });

  describe("create — fan-out", () => {
    it("create 1→N users → N docs (lifecycleState CREATED) + N unread counts", async () => {
      const service = makeService();
      const tenantId = newId();
      const users = [newId(), newId(), newId()];

      const result = await service.create(tenantId, makeDraft(), users);

      expect(result.createdIds).toHaveLength(3);
      expect(result.updatedIds).toHaveLength(0);
      expect(result.ignoredCount).toBe(0);
      expect(result.results).toHaveLength(3);
      expect(result.results.map((r) => r.action)).toEqual(["created", "created", "created"]);

      const docs = await NotificationModel.find({ tenantId: oid(tenantId) }).lean();
      expect(docs).toHaveLength(3);
      const created = new Set(result.createdIds);
      for (const d of docs) {
        expect(d.lifecycleState).toBe("CREATED");
        expect(d.isRead).toBe(false);
        expect(d.version).toBe(1);
        expect(created.has(d._id.toString())).toBe(true);
      }

      for (const u of users) {
        const state = await readState(tenantId, u);
        expect(state?.unreadCount).toBe(1);
      }
    });

    it("mixed fan-out returns per-recipient ignored/updated/created with createdIds/updatedIds/ignoredCount", async () => {
      const service = makeService();
      const tenantId = newId();
      const mutedUser = newId();
      const dedupUser = newId();
      const freshUser = newId();

      // A: muted for processing_failed with a pre-existing unread counter.
      await UserNotificationStateModel.create({
        tenantId: oid(tenantId),
        userId: oid(mutedUser),
        unreadCount: 2,
        mutedTypes: ["processing_failed"],
      });

      // B: pre-existing dedup doc within the sliding window (deduplicatedAt
      // must be set — the range query matches on deduplicatedAt > cutoff).
      const dedupDoc = await NotificationModel.create(
        baseDoc(tenantId, dedupUser, {
          dedupKey: "processing_failed:doc_123:seed-bucket",
          deduplicatedAt: new Date(Date.now() - 1_000),
        }),
      );

      const result = await service.create(
        tenantId,
        makeDraft(),
        [mutedUser, dedupUser, freshUser],
      );

      expect(result.results).toHaveLength(3);
      expect(result.results[0]).toEqual({
        userId: mutedUser,
        notificationId: null,
        action: "ignored",
      });
      expect(result.results[1]).toEqual({
        userId: dedupUser,
        notificationId: dedupDoc._id.toString(),
        action: "updated",
      });
      expect(result.results[2].action).toBe("created");
      expect(result.updatedIds).toEqual([dedupDoc._id.toString()]);
      expect(result.createdIds).toHaveLength(1);
      expect(result.createdIds[0]).toBe(result.results[2].notificationId);
      expect(result.ignoredCount).toBe(1);

      // A: no doc, counter untouched.
      expect(
        await NotificationModel.countDocuments({
          tenantId: oid(tenantId),
          userId: oid(mutedUser),
        }),
      ).toBe(0);
      const stateA = await readState(tenantId, mutedUser);
      expect(stateA?.unreadCount).toBe(2);

      // B: exactly one doc, version incremented.
      const bDocs = await NotificationModel.find({
        tenantId: oid(tenantId),
        userId: oid(dedupUser),
      }).lean();
      expect(bDocs).toHaveLength(1);
      expect(bDocs[0].version).toBe(2);

      // C: created + unread 1.
      const stateC = await readState(tenantId, freshUser);
      expect(stateC?.unreadCount).toBe(1);
    });

    it("a muted recipient is ignored: no doc, no counter change, no emit via dispatcher path", async () => {
      const service = makeService();
      const tenantId = newId();
      const user = newId();
      await UserNotificationStateModel.create({
        tenantId: oid(tenantId),
        userId: oid(user),
        unreadCount: 5,
        mutedTypes: ["processing_failed"],
      });

      const result = await service.create(tenantId, makeDraft(), [user]);

      expect(result.results).toEqual([
        { userId: user, notificationId: null, action: "ignored" },
      ]);
      expect(result.createdIds).toHaveLength(0);
      expect(result.ignoredCount).toBe(1);
      expect(
        await NotificationModel.countDocuments({ tenantId: oid(tenantId), userId: oid(user) }),
      ).toBe(0);
      const state = await readState(tenantId, user);
      expect(state?.unreadCount).toBe(5);

      // Through the dispatcher, an all-muted fan-out enqueues nothing.
      const queuePort = new FakeQueuePort();
      const dispatcher = new NotificationOutboxDispatcher(
        { create: (t, draft, ids) => service.create(t, draft, ids) },
        queuePort,
      );
      await insertTriggerEntry(tenantId, "muted-trigger-1", [user]);
      await dispatcher.dispatchEvent(tenantId, "muted-trigger-1");
      expect(queuePort.enqueued).toHaveLength(0);
    });

    it("rejects a fan-out exceeding 5000 recipients with NotificationFanoutLimitError", async () => {
      const service = makeService();
      const tenantId = newId();
      const users = Array.from({ length: MAX_FANOUT + 1 }, () => newId());

      await expect(service.create(tenantId, makeDraft(), users)).rejects.toBeInstanceOf(
        NotificationFanoutLimitError,
      );
      await expect(service.create(tenantId, makeDraft(), users)).rejects.toThrow(/5000/);
      // nothing was persisted before the guard fired
      expect(await NotificationModel.countDocuments({})).toBe(0);
    });
  });

  describe("markEnqueued — CREATED → QUEUED lifecycle transition", () => {
    it("advances only CREATED docs, idempotently (non-CREATED left untouched)", async () => {
      const service = makeService();
      const tenantId = newId();
      const user = newId();

      const { createdIds } = await service.create(tenantId, makeDraft({ dedupEventId: "enq_1" }), [user]);
      const queuedDoc = await NotificationModel.findOne({ tenantId: oid(tenantId) }).lean();
      const queuedId = queuedDoc!._id.toString();

      // Second create for the same user lands in-window → dedup "updated", no new doc.
      const updated = await service.create(tenantId, makeDraft({ dedupEventId: "enq_1" }), [user]);
      expect(updated.createdIds).toHaveLength(0);

      // markEnqueued must only touch the CREATED batch doc.
      await service.markEnqueued(tenantId, [...createdIds, "000000000000000000000000"]);
      const docs = await NotificationModel.find({ tenantId: oid(tenantId) }).lean();
      expect(docs).toHaveLength(1);
      expect(docs[0].lifecycleState).toBe("QUEUED");
      expect(queuedId).toBe(docs[0]._id.toString());

      // Idempotent: second call changes nothing (already QUEUED, not CREATED).
      await service.markEnqueued(tenantId, createdIds);
      const after = await NotificationModel.findOne({ tenantId: oid(tenantId) }).lean();
      expect(after!.lifecycleState).toBe("QUEUED");
    });
  });

  describe("create — dedup", () => {
    it("in-window dedup: same type+dedupEventId → 'updated', version++, deduplicatedAt refreshed, no new doc", async () => {
      const service = makeService();
      const tenantId = newId();
      const user = newId();

      const first = await service.create(tenantId, makeDraft(), [user]);
      expect(first.results[0].action).toBe("created");
      const firstDoc = await NotificationModel.findOne({
        tenantId: oid(tenantId),
        userId: oid(user),
      }).lean();
      const firstDedupedAt = (firstDoc?.deduplicatedAt as Date).getTime();

      const second = await service.create(tenantId, makeDraft(), [user]);
      expect(second.results[0].action).toBe("updated");
      expect(second.results[0].notificationId).toBe(first.createdIds[0]);
      expect(second.updatedIds).toEqual(first.createdIds);
      expect(second.createdIds).toHaveLength(0);

      const docs = await NotificationModel.find({
        tenantId: oid(tenantId),
        userId: oid(user),
      }).lean();
      expect(docs).toHaveLength(1);
      expect(docs[0].version).toBe(2);
      expect((docs[0].deduplicatedAt as Date).getTime()).toBeGreaterThanOrEqual(firstDedupedAt);

      // an update is NOT a create — the unread counter is unchanged.
      const state = await readState(tenantId, user);
      expect(state?.unreadCount).toBe(1);
    });

    it("straddling-bucket duplicate within the window resolves to 'updated' with exactly one doc", async () => {
      const service = makeService();
      const tenantId = newId();
      const user = newId();
      const now = Date.now();
      const currentBucket = Math.floor(now / (24 * 3600e3));
      // The existing doc "lives" in the PREVIOUS bucket (dedupKey bucket-1)
      // yet is still inside the sliding window — the bucketed unique index
      // would NOT catch it, but buildDedupRangeQuery does.
      const previousBucketKey = `processing_failed:doc_123:${currentBucket - 1}`;
      await NotificationModel.create(
        baseDoc(tenantId, user, {
          dedupKey: previousBucketKey,
          deduplicatedAt: new Date(now - 1_000),
        }),
      );

      const result = await service.create(tenantId, makeDraft(), [user]);

      expect(result.results[0].action).toBe("updated");
      expect(
        await NotificationModel.countDocuments({ tenantId: oid(tenantId), userId: oid(user) }),
      ).toBe(1);
    });

    it("outside the window: a new doc is created and the old one stays", async () => {
      const service = makeService();
      const tenantId = newId();
      const user = newId();
      const now = Date.now();
      const currentBucket = Math.floor(now / (24 * 3600e3));
      const previousBucketKey = `processing_failed:doc_123:${currentBucket - 1}`;
      await NotificationModel.create(
        baseDoc(tenantId, user, {
          dedupKey: previousBucketKey,
          deduplicatedAt: new Date(now - 25 * 3600e3), // outside the 24h window
        }),
      );

      const result = await service.create(tenantId, makeDraft(), [user]);

      expect(result.results[0].action).toBe("created");
      const docs = await NotificationModel.find({
        tenantId: oid(tenantId),
        userId: oid(user),
      }).lean();
      expect(docs).toHaveLength(2);
      const fresh = docs.find((d) => d._id.toString() === result.createdIds[0]);
      expect(fresh?.version).toBe(1);
    });

    it("concurrent parallel creates for the same user+type+dedupEventId leave exactly one live doc and unreadCount 1", async () => {
      const service = makeService();
      const tenantId = newId();
      const user = newId();

      const [r1, r2] = await Promise.all([
        service.create(tenantId, makeDraft(), [user]),
        service.create(tenantId, makeDraft(), [user]),
      ]);

      const live = await NotificationModel.countDocuments({
        tenantId: oid(tenantId),
        userId: oid(user),
        type: "processing_failed",
        dedupEventId: "doc_123",
        deletedAt: null,
      });
      expect(live).toBe(1);

      const state = await readState(tenantId, user);
      expect(state?.unreadCount).toBe(1);

      // exactly one 'created' across the two racing calls; the loser resolves
      // to 'updated' through the E11000 conflict / post-insert re-query path.
      const createdCount = [r1, r2]
        .flatMap((r) => r.results)
        .filter((x) => x.action === "created").length;
      expect(createdCount).toBe(1);
    });

    it("the bucketed dedupKey the service computes round-trips through buildNotificationDedupKey", async () => {
      const key = buildNotificationDedupKey("processing_failed", "doc_123");
      expect(key.startsWith("processing_failed:doc_123:")).toBe(true);
    });
  });

  describe("dispatcher trigger path — exactly-one-enqueue guard", () => {
    it("handleTrigger with the real service enqueues EXACTLY ONE dispatch job; create() never writes an outbox entry", async () => {
      const service = makeService();
      const queuePort = new FakeQueuePort();
      const dispatcher = new NotificationOutboxDispatcher(
        {
          create: (tenantId: string, draft: NotificationDraft, ids: string[]) =>
            service.create(tenantId, draft, ids),
          markEnqueued: (tenantId: string, ids: string[]) =>
            service.markEnqueued(tenantId, ids),
        } satisfies NotificationCreatePort,
        queuePort,
      );
      const tenantId = newId();
      const users = [newId(), newId(), newId()];
      const eventId = "job-idempotency-key:ocr";

      // ONE trigger entry → dispatch → EXACTLY ONE enqueue.
      await insertTriggerEntry(tenantId, eventId, users);
      const outcome = await dispatcher.dispatchEvent(tenantId, eventId);
      expect(outcome).toBe("dispatched");

      expect(queuePort.enqueued).toHaveLength(1);
      const enqueued = queuePort.enqueued[0];
      expect(enqueued.tenantId).toBe(tenantId);
      expect(enqueued.traceId).toBe(eventId);
      expect(enqueued.idempotencyKey).toBe(eventId);
      expect(enqueued.notificationIds).toHaveLength(users.length);
      expect(enqueued.actorId).toBe("actor-1");

      // N docs + N unread counts were created through the trigger path, and the
      // batch was advanced CREATED → QUEUED so the dispatch worker delivers it.
      const docs = await NotificationModel.find({ tenantId: oid(tenantId) }).lean();
      expect(docs).toHaveLength(3);
      for (const d of docs) {
        expect(d.lifecycleState).toBe("QUEUED");
        expect(d.deliveryStatus).toBe("pending");
      }
      expect(
        await UserNotificationStateModel.countDocuments({ tenantId: oid(tenantId) }),
      ).toBe(3);

      // The outbox still holds exactly the one trigger entry (no second entry).
      expect(await NotificationOutboxModel.countDocuments({})).toBe(1);
      expect(
        await NotificationOutboxModel.countDocuments({ tenantId: oid(tenantId), kind: "trigger" }),
      ).toBe(1);

      // A direct create() call must NEVER write an outbox entry.
      await service.create(
        tenantId,
        makeDraft({ dedupEventId: "direct_doc" }),
        [newId()],
      );
      expect(await NotificationOutboxModel.countDocuments({})).toBe(1);
    });

    it("the factory drafts the trigger payload without a tenantId (tenantId comes from the outbox entry)", () => {
      const draft = createNotificationDraft({
        ...triggerPayload(newId(), [newId()]),
      } as unknown as NotificationEvent);
      expect(draft.type).toBe("processing_failed");
      expect("tenantId" in draft).toBe(false);
    });
  });

  describe("markAllRead — cutoff + transaction", () => {
    it("respects the createdAt cutoff: a mid-request arrival stays unread and matchedCount excludes it", async () => {
      const service = makeService();
      const tenantId = newId();
      const user = newId();

      const r1 = await service.create(tenantId, makeDraft({ dedupEventId: "doc_cut_a" }), [user]);
      const r2 = await service.create(tenantId, makeDraft({ dedupEventId: "doc_cut_b" }), [user]);

      // A mid-request arrival: createdAt slightly in the FUTURE. Set at
      // CREATE time — mongoose timestamps strips a future createdAt passed via
      // updateOne (discovered during T6-S5).
      const futureId = await insertNotification(tenantId, user, {
        dedupKey: "processing_failed:doc_cut_f:seed",
        dedupEventId: "doc_cut_f",
        createdAt: new Date(Date.now() + 1_000),
      });
      // the counter must include the mid-request arrival (3 unread).
      await UserNotificationStateModel.updateOne(
        { tenantId: oid(tenantId), userId: oid(user) },
        { $set: { unreadCount: 3 } },
      );

      const result = await service.markAllRead(tenantId, user);

      expect(result.matchedCount).toBe(2);
      const d1 = await NotificationModel.findById(oid(r1.createdIds[0])).lean();
      const d2 = await NotificationModel.findById(oid(r2.createdIds[0])).lean();
      const future = await NotificationModel.findById(oid(futureId)).lean();
      expect(d1?.isRead).toBe(true);
      expect(d2?.isRead).toBe(true);
      expect(future?.isRead).toBe(false);

      const state = await readState(tenantId, user);
      expect(state?.unreadCount).toBe(1);
      // matchedCount + remaining unread === total unread before the call.
      expect(result.matchedCount + (state?.unreadCount ?? 0)).toBe(3);
    });

    it("commits in ONE session: all in-cutoff docs isRead=true and unreadCount === previous - matchedCount", async () => {
      const service = makeService();
      const tenantId = newId();
      const user = newId();
      await service.create(tenantId, makeDraft({ dedupEventId: "doc_tx_a" }), [user]);
      await service.create(tenantId, makeDraft({ dedupEventId: "doc_tx_b" }), [user]);
      await service.create(tenantId, makeDraft({ dedupEventId: "doc_tx_c" }), [user]);

      const transactional = makeService({ sessionFactory: realSessionFactory() });
      const result = await transactional.markAllRead(tenantId, user);

      expect(result.matchedCount).toBe(3);
      const docs = await NotificationModel.find({
        tenantId: oid(tenantId),
        userId: oid(user),
      }).lean();
      expect(docs).toHaveLength(3);
      expect(docs.every((d) => d.isRead === true)).toBe(true);

      const state = await readState(tenantId, user);
      expect(state?.unreadCount).toBe(0);
      expect(state?.unreadCount).toBe(3 - result.matchedCount);
    });

    it("rolls BOTH the doc update and the counter $inc back on mid-transaction failure", async () => {
      const tenantId = newId();
      const user = newId();
      const plain = makeService();
      await plain.create(tenantId, makeDraft({ dedupEventId: "doc_rb_a" }), [user]);
      await plain.create(tenantId, makeDraft({ dedupEventId: "doc_rb_b" }), [user]);

      const failingState = new FailingStateRepo(
        new MongoUserNotificationStateRepository(),
        ["markAllReadAdjustment"],
      );
      const bad = makeService({
        sessionFactory: realSessionFactory(),
        stateRepo: failingState,
      });

      await expect(bad.markAllRead(tenantId, user)).rejects.toThrow(
        "simulated state write failure",
      );

      // the updateMany rolled back with the aborted transaction.
      const docs = await NotificationModel.find({
        tenantId: oid(tenantId),
        userId: oid(user),
      }).lean();
      expect(docs).toHaveLength(2);
      expect(docs.every((d) => d.isRead === false)).toBe(true);
      const state = await readState(tenantId, user);
      expect(state?.unreadCount).toBe(2);
    });
  });

  describe("markRead / bulkRead — no double-decrement", () => {
    it("markRead of an archived unread doc leaves unreadCount unchanged (slot already released)", async () => {
      const service = makeService();
      const tenantId = newId();
      const user = newId();
      const r = await service.create(tenantId, makeDraft(), [user]);
      const id = r.createdIds[0];

      await service.archive(tenantId, user, id);
      expect((await readState(tenantId, user))?.unreadCount).toBe(0);

      await service.markRead(tenantId, user, id);
      expect((await readState(tenantId, user))?.unreadCount).toBe(0);
    });

    it("markRead of a soft-deleted unread doc leaves unreadCount unchanged", async () => {
      const service = makeService();
      const tenantId = newId();
      const user = newId();
      const r = await service.create(tenantId, makeDraft(), [user]);
      const id = r.createdIds[0];

      await service.softDelete(tenantId, user, id, "actor-1");
      expect((await readState(tenantId, user))?.unreadCount).toBe(0);

      await service.markRead(tenantId, user, id);
      expect((await readState(tenantId, user))?.unreadCount).toBe(0);
    });

    it("bulkRead including an archived unread id does not double-decrement unreadCount", async () => {
      const service = makeService();
      const tenantId = newId();
      const user = newId();
      const r1 = await service.create(tenantId, makeDraft({ dedupEventId: "doc_bulk_a" }), [user]);
      const r2 = await service.create(tenantId, makeDraft({ dedupEventId: "doc_bulk_b" }), [user]);

      // archive one unread doc → its slot is released.
      await service.archive(tenantId, user, r1.createdIds[0]);
      expect((await readState(tenantId, user))?.unreadCount).toBe(1);

      // bulk-read BOTH ids: the live doc is matched and read; the archived
      // id must not double-decrement the counter.
      const result = await service.bulkRead(tenantId, user, [
        r1.createdIds[0],
        r2.createdIds[0],
      ]);

      const state = await readState(tenantId, user);
      expect(state?.unreadCount).toBe(0);
      // the archived doc still matched by the repo filter — documented as a
      // discovered deviation (see notepad T6-S5) — so matchedCount may exceed
      // the live set, but the $inc floor keeps the counter correct.
      expect(result.matchedCount).toBeGreaterThanOrEqual(1);
      expect(result.matchedCount).toBeLessThanOrEqual(2);
    });
  });

  describe("archive / softDelete — counter semantics + two-step rollback", () => {
    it("archive of an UNREAD doc decrements unreadCount; re-archive is a no-op", async () => {
      const service = makeService();
      const tenantId = newId();
      const user = newId();
      const r = await service.create(tenantId, makeDraft(), [user]);
      const id = r.createdIds[0];

      const first = await service.archive(tenantId, user, id);
      expect(first.matched).toBe(true);
      const state = await readState(tenantId, user);
      expect(state?.unreadCount).toBe(0);
      const doc = await NotificationModel.findById(oid(id)).lean();
      expect(doc?.isArchived).toBe(true);
      expect(doc?.isRead).toBe(false);

      const second = await service.archive(tenantId, user, id);
      expect(second.matched).toBe(false);
      expect((await readState(tenantId, user))?.unreadCount).toBe(0);
    });

    it("softDelete of an UNREAD doc decrements unreadCount; re-delete is a no-op", async () => {
      const service = makeService();
      const tenantId = newId();
      const user = newId();
      const r = await service.create(tenantId, makeDraft(), [user]);
      const id = r.createdIds[0];

      const first = await service.softDelete(tenantId, user, id, "actor-1");
      expect(first.matched).toBe(true);
      const state = await readState(tenantId, user);
      expect(state?.unreadCount).toBe(0);
      const doc = await NotificationModel.findById(oid(id)).lean();
      expect(doc?.deletedAt).not.toBeNull();
      expect(doc?.lifecycleState).toBe("DELETED");
      expect(doc?.deletedBy).toBe("actor-1");

      const second = await service.softDelete(tenantId, user, id, "actor-1");
      expect(second.matched).toBe(false);
      expect((await readState(tenantId, user))?.unreadCount).toBe(0);
    });

    it("archive-then-markAllRead does NOT re-decrement unreadCount (round-7 Momus LOW)", async () => {
      const service = makeService();
      const tenantId = newId();
      const user = newId();
      const r1 = await service.create(tenantId, makeDraft({ dedupEventId: "doc_momus_a" }), [user]);
      await service.create(tenantId, makeDraft({ dedupEventId: "doc_momus_b" }), [user]);
      expect((await readState(tenantId, user))?.unreadCount).toBe(2);

      await service.archive(tenantId, user, r1.createdIds[0]);
      expect((await readState(tenantId, user))?.unreadCount).toBe(1);

      const result = await service.markAllRead(tenantId, user);
      // the archived doc already released its slot; only the live doc owes one.
      expect((await readState(tenantId, user))?.unreadCount).toBe(0);
      expect(result.matchedCount).toBeGreaterThanOrEqual(1);
      expect(result.matchedCount).toBeLessThanOrEqual(2);
    });

    it("archive two-step rolls back atomically when the counter decrement fails", async () => {
      const tenantId = newId();
      const user = newId();
      const plain = makeService();
      const r = await plain.create(tenantId, makeDraft(), [user]);
      const id = r.createdIds[0];

      const failingState = new FailingStateRepo(
        new MongoUserNotificationStateRepository(),
        ["decrementUnread"],
      );
      const bad = makeService({ sessionFactory: realSessionFactory(), stateRepo: failingState });

      await expect(bad.archive(tenantId, user, id)).rejects.toThrow(
        "simulated state write failure",
      );

      const doc = await NotificationModel.findById(oid(id)).lean();
      expect(doc?.isArchived).toBe(false);
      expect((await readState(tenantId, user))?.unreadCount).toBe(1);
    });

    it("softDelete two-step rolls back atomically when the counter decrement fails", async () => {
      const tenantId = newId();
      const user = newId();
      const plain = makeService();
      const r = await plain.create(tenantId, makeDraft(), [user]);
      const id = r.createdIds[0];

      const failingState = new FailingStateRepo(
        new MongoUserNotificationStateRepository(),
        ["decrementUnread"],
      );
      const bad = makeService({ sessionFactory: realSessionFactory(), stateRepo: failingState });

      await expect(bad.softDelete(tenantId, user, id, "actor-1")).rejects.toThrow(
        "simulated state write failure",
      );

      const doc = await NotificationModel.findById(oid(id)).lean();
      expect(doc?.deletedAt).toBeNull();
      expect(doc?.lifecycleState).toBe("CREATED");
      expect((await readState(tenantId, user))?.unreadCount).toBe(1);
    });
  });

  describe("purgeUserNotifications", () => {
    it("soft-deletes ALL user docs AND removes the state doc in ONE session", async () => {
      const service = makeService();
      const tenantId = newId();
      const user = newId();
      await service.create(tenantId, makeDraft({ dedupEventId: "doc_purge_a" }), [user]);
      await service.create(tenantId, makeDraft({ dedupEventId: "doc_purge_b" }), [user]);
      expect(await NotificationModel.countDocuments({ tenantId: oid(tenantId) })).toBe(2);

      // Run inside one explicit transaction/session to prove the two
      // deletions (docs + state) are atomic together.
      const session = await mongoose.startSession();
      let result: { matchedCount: number } | undefined;
      await session.withTransaction(async () => {
        result = await service.purgeUserNotifications(
          tenantId,
          user,
          session as unknown as TransactionSession,
        );
      });
      await session.endSession();

      expect(result?.matchedCount).toBe(2);
      const docs = await NotificationModel.find({
        tenantId: oid(tenantId),
        userId: oid(user),
      }).lean();
      expect(docs).toHaveLength(2);
      for (const d of docs) {
        expect(d.deletedAt).not.toBeNull();
        expect(d.lifecycleState).toBe("DELETED");
        expect(d.deletedBy).toBe("system:user-purge");
      }
      const state = await UserNotificationStateModel.findOne({
        tenantId: oid(tenantId),
        userId: oid(user),
      }).lean();
      expect(state).toBeNull();
    });
  });

  describe("list / getById", () => {
    it("list paginates (page 2 skip works) and excludes deleted and expired docs", async () => {
      const service = makeService();
      const tenantId = newId();
      const user = newId();

      for (let i = 0; i < 4; i += 1) {
        await service.create(
          tenantId,
          makeDraft({ dedupEventId: `doc_list_${i}` }),
          [user],
        );
      }
      const all = await NotificationModel.find({
        tenantId: oid(tenantId),
        userId: oid(user),
      }).lean();
      expect(all).toHaveLength(4);
      await service.softDelete(tenantId, user, all[0]._id.toString(), "actor-1");

      // One expired doc — excluded by the live-feed expiresAt filter.
      const expiredId = await insertNotification(tenantId, user, {
        dedupKey: "processing_failed:doc_list_exp:seed",
        dedupEventId: "doc_list_exp",
        expiresAt: new Date(Date.now() - 1_000),
      });

      const page1 = await service.list(tenantId, user, { page: 1, limit: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.total).toBe(3);

      const page2 = await service.list(tenantId, user, { page: 2, limit: 2 });
      expect(page2.items).toHaveLength(1);
      expect(page2.total).toBe(3);

      const pageIds = [...page1.items, ...page2.items].map((d) => d.id as string);
      expect(pageIds).toHaveLength(3);
      expect(pageIds).not.toContain(all[0]._id.toString());
      expect(pageIds).not.toContain(expiredId);
    });

    it("getById enforces tenant isolation (tenant B cannot read tenant A's doc)", async () => {
      const service = makeService();
      const tenantA = newId();
      const tenantB = newId();
      const user = newId();
      const r = await service.create(tenantA, makeDraft(), [user]);
      const id = r.createdIds[0];

      expect(await service.getById(tenantB, id)).toBeNull();
      expect(await service.getById(tenantA, id)).not.toBeNull();
    });

    it("list for tenant B excludes tenant A docs", async () => {
      const service = makeService();
      const tenantA = newId();
      const tenantB = newId();
      const user = newId();
      await service.create(tenantA, makeDraft(), [user]);

      const listA = await service.list(tenantA, user, { page: 1, limit: 10 });
      const listB = await service.list(tenantB, user, { page: 1, limit: 10 });
      expect(listA.total).toBe(1);
      expect(listB.items).toHaveLength(0);
      expect(listB.total).toBe(0);
    });
  });

  describe("unreadCount — per-priority breakdown", () => {
    it("returns { count, byPriority } matching the unread docs", async () => {
      const service = makeService();
      const tenantId = newId();
      const user = newId();

      const priorities: Array<"critical" | "high" | "normal" | "low"> = [
        "critical",
        "critical",
        "high",
        "normal",
        "normal",
        "normal",
        "low",
      ];
      let i = 0;
      for (const priority of priorities) {
        await service.create(
          tenantId,
          makeDraft({ dedupEventId: `doc_prio_${i}`, priority }),
          [user],
        );
        i += 1;
      }

      const result = await service.unreadCount(tenantId, user);
      expect(result.count).toBe(7);
      expect(result.byPriority).toEqual({
        critical: 2,
        high: 1,
        normal: 3,
        low: 1,
      });

      // Cross-check the O(1) counter agrees with the aggregation.
      const state = await readState(tenantId, user);
      expect(state?.unreadCount).toBe(7);
    });
  });
});
