import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import NotificationModel, {
  isNotificationExpired,
} from "../../../db/models/notification.model.js";

const hasMongo = Boolean(process.env.MONGODB_URI);

function buildFullPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tenantId: new mongoose.Types.ObjectId(),
    userId: new mongoose.Types.ObjectId(),
    dedupKey: "processing_failed:doc_123:bucket-1",
    dedupEventId: "doc_123",
    deduplicatedAt: new Date("2026-07-30T12:00:00.000Z"),
    type: "processing_failed",
    category: "documents",
    priority: "high",
    title: { en: "Processing failed", ar: "فشل المعالجة" },
    body: { en: "Your document could not be processed.", ar: "تعذرت معالجة مستندك." },
    source: { type: "processing", id: "proc_1", displayName: "OCR Pipeline" },
    actorId: "actor_1",
    createdBy: "actor_1",
    updatedBy: null,
    traceIds: { traceId: "t-1", correlationId: "c-1", causationId: "cau-1" },
    actions: [
      {
        label: { en: "Retry", ar: "إعادة المحاولة" },
        url: "/documents/doc_123/ocr/retry",
        method: "POST",
        icon: "refresh",
        variant: "primary",
      },
    ],
    metadata: { documentId: "doc_123", errorCode: "OCR_TIMEOUT", stage: "ocr", retryable: true },
    lifecycleState: "CREATED",
    version: 1,
    deliveryStatus: "pending",
    deliveryAttempts: 0,
    failureReason: null,
    deliveredAt: null,
    isRead: false,
    readAt: null,
    isSeen: false,
    seenAt: null,
    isArchived: false,
    archivedAt: null,
    deletedAt: null,
    deletedBy: null,
    collapseKey: null,
    collapsedCount: 0,
    resolutionKey: null,
    ...overrides,
  };
}

describe.skipIf(!hasMongo)("NotificationModel", () => {
  let connectedByThisFile = false;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI as string);
      connectedByThisFile = true;
    }
    await NotificationModel.init();
  });

  afterAll(async () => {
    if (connectedByThisFile) await mongoose.disconnect();
  });

  beforeEach(async () => {
    await NotificationModel.deleteMany({});
  });

  it("round-trips a full document with all fields identical", async () => {
    const payload = buildFullPayload();
    const created = await NotificationModel.create(payload);
    const found = await NotificationModel.findById(created._id).lean();

    expect(found).not.toBeNull();
    expect(found!.tenantId.toString()).toBe(payload.tenantId!.toString());
    expect(found!.userId.toString()).toBe(payload.userId!.toString());
    expect(found!.dedupKey).toBe("processing_failed:doc_123:bucket-1");
    expect(found!.dedupEventId).toBe("doc_123");
    expect(found!.deduplicatedAt).toEqual(new Date("2026-07-30T12:00:00.000Z"));
    expect(found!.type).toBe("processing_failed");
    expect(found!.category).toBe("documents");
    expect(found!.priority).toBe("high");
    expect(found!.title).toEqual({ en: "Processing failed", ar: "فشل المعالجة" });
    expect(found!.body).toEqual({
      en: "Your document could not be processed.",
      ar: "تعذرت معالجة مستندك.",
    });
    expect(found!.source).toEqual({
      type: "processing",
      id: "proc_1",
      displayName: "OCR Pipeline",
    });
    expect(found!.actorId).toBe("actor_1");
    expect(found!.createdBy).toBe("actor_1");
    expect(found!.updatedBy).toBeNull();
    expect(found!.traceIds).toEqual({ traceId: "t-1", correlationId: "c-1", causationId: "cau-1" });
    expect(found!.actions).toEqual([
      {
        label: { en: "Retry", ar: "إعادة المحاولة" },
        url: "/documents/doc_123/ocr/retry",
        method: "POST",
        icon: "refresh",
        variant: "primary",
      },
    ]);
    expect(found!.metadata).toEqual({
      documentId: "doc_123",
      errorCode: "OCR_TIMEOUT",
      stage: "ocr",
      retryable: true,
    });
    expect(found!.lifecycleState).toBe("CREATED");
    expect(found!.version).toBe(1);
    expect(found!.deliveryStatus).toBe("pending");
    expect(found!.deliveryAttempts).toBe(0);
    expect(found!.failureReason).toBeNull();
    expect(found!.deliveredAt).toBeNull();
    expect(found!.isRead).toBe(false);
    expect(found!.readAt).toBeNull();
    expect(found!.isSeen).toBe(false);
    expect(found!.seenAt).toBeNull();
    expect(found!.isArchived).toBe(false);
    expect(found!.archivedAt).toBeNull();
    expect(found!.deletedAt).toBeNull();
    expect(found!.deletedBy).toBeNull();
    expect(found!.collapseKey).toBeNull();
    expect(found!.collapsedCount).toBe(0);
    expect(found!.resolutionKey).toBeNull();
    expect(found!.createdAt).toBeInstanceOf(Date);
    expect(found!.updatedAt).toBeInstanceOf(Date);
    expect(found!.expiresAt).toBeInstanceOf(Date);
    expect(found!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects a duplicate {tenantId, userId, dedupKey} with E11000", async () => {
    const payload = buildFullPayload();
    await NotificationModel.create(payload);

    const err = await NotificationModel.create(payload).then(
      () => null,
      (e: unknown) => e,
    );

    expect(err).not.toBeNull();
    const mongoError = err as { code?: number; name?: string };
    expect(mongoError.code).toBe(11000);
    expect(mongoError.name).toBe("MongoServerError");

    await NotificationModel.deleteMany({});
  });

  it("creates the expected unique, feed compound, dedup range, partial, and TTL indexes", async () => {
    const indexes = await NotificationModel.collection.indexes();

    const uniq = indexes.find((i) => i.name === "uniq_notif_dedup");
    expect(uniq).toBeDefined();
    expect(uniq!.unique).toBe(true);
    expect(uniq!.key).toEqual({ tenantId: 1, userId: 1, dedupKey: 1 });

    const tenantTime = indexes.find(
      (i) =>
        JSON.stringify(i.key) === JSON.stringify({ tenantId: 1, userId: 1, createdAt: -1 }),
    );
    expect(tenantTime).toBeDefined();

    const feed = indexes.find(
      (i) =>
        JSON.stringify(i.key) ===
        JSON.stringify({ tenantId: 1, userId: 1, isArchived: 1, deletedAt: 1, createdAt: -1 }),
    );
    expect(feed).toBeDefined();
    expect(feed!.key).toEqual({
      tenantId: 1,
      userId: 1,
      isArchived: 1,
      deletedAt: 1,
      createdAt: -1,
    });

    const dedupRange = indexes.find(
      (i) =>
        JSON.stringify(i.key) ===
        JSON.stringify({ tenantId: 1, userId: 1, type: 1, dedupEventId: 1, deduplicatedAt: 1 }),
    );
    expect(dedupRange).toBeDefined();

    const partial = indexes.find(
      (i) =>
        i.partialFilterExpression &&
        JSON.stringify(i.partialFilterExpression) === JSON.stringify({ isRead: false }),
    );
    expect(partial).toBeDefined();
    expect(partial!.key).toEqual({ tenantId: 1, userId: 1, isRead: 1, createdAt: -1 });
    expect(partial!.partialFilterExpression).toEqual({ isRead: false });

    const ttl = indexes.find(
      (i) =>
        i.key &&
        "expiresAt" in i.key &&
        (i.key as Record<string, number>).expiresAt === 1 &&
        "expireAfterSeconds" in i,
    );
    expect(ttl).toBeDefined();
    expect(ttl!.expireAfterSeconds).toBe(0);
  });

  it("QA#8 TTL purge path: past-expiry doc is excluded from the live feed and marked EXPIRED", async () => {
    const pastExpiry = new Date(Date.now() - 1000);
    const expiredDoc = await NotificationModel.create(
      buildFullPayload({ expiresAt: pastExpiry }),
    );
    const liveDoc = await NotificationModel.create(buildFullPayload({ dedupKey: "live-doc-key" }));

    const liveFeed = await NotificationModel.find({ expiresAt: { $gt: new Date() } });
    const liveIds = liveFeed.map((d) => d._id.toString());
    expect(liveIds).toContain(liveDoc._id.toString());
    expect(liveIds).not.toContain(expiredDoc._id.toString());

    expect(isNotificationExpired(pastExpiry, new Date())).toBe(true);
    expect(isNotificationExpired(expiredDoc.expiresAt, new Date())).toBe(true);
    expect(isNotificationExpired(liveDoc.expiresAt, new Date())).toBe(false);
    expect(isNotificationExpired(null)).toBe(false);
    expect(isNotificationExpired(undefined)).toBe(false);
  });
});
