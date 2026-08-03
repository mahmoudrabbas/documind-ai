import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import {
  applyDedupUpdateRule,
  buildDedupRangeQuery,
  buildNotificationDedupKey,
  DEDUP_WINDOW_HOURS,
  resolveDedup,
} from "workers/contracts";

/**
 * T5 — shared dedup contract, tested from the API workspace through the
 * "workers/contracts" barrel (the same built package the api service (T6) and
 * the worker producers (T9/T18/T25) import). Pure function tests, no DB.
 */

const BUCKET_BOUNDARY = new Date("2026-08-01T00:00:00.000Z");

describe("DEDUP_WINDOW_HOURS", () => {
  it("declares the exact per-type windows", () => {
    expect(DEDUP_WINDOW_HOURS).toEqual({
      processing_failed: 24,
      processing_complete: 24,
      quota_exceeded: 24,
      knowledge_gap_created: 168,
      invitation_accepted: 24,
      welcome: 168,
      role_changed: 24,
      document_uploaded: 24,
    });
  });

  it("knowledge_gap_created and welcome use the 168h window", () => {
    expect(DEDUP_WINDOW_HOURS.knowledge_gap_created).toBe(168);
    expect(DEDUP_WINDOW_HOURS.welcome).toBe(168);
  });
});

describe("buildNotificationDedupKey", () => {
  it("is stable within the same 24h bucket", () => {
    const within = new Date("2026-08-01T01:00:00.000Z");
    const later = new Date("2026-08-01T23:00:00.000Z");
    expect(buildNotificationDedupKey("processing_failed", "doc-1", within)).toBe(
      buildNotificationDedupKey("processing_failed", "doc-1", later),
    );
  });

  it("differs across the 24h boundary", () => {
    const before = new Date(BUCKET_BOUNDARY.getTime() - 1);
    const after = new Date(BUCKET_BOUNDARY.getTime() + 1);
    expect(buildNotificationDedupKey("processing_failed", "doc-1", before)).not.toBe(
      buildNotificationDedupKey("processing_failed", "doc-1", after),
    );
  });

  it("rotates with the caller-supplied window (168h for knowledge_gap)", () => {
    const t1 = new Date("2026-08-01T10:00:00.000Z");
    const t2 = new Date("2026-08-02T10:00:00.000Z");
    const t3 = new Date("2026-08-09T10:00:00.000Z");
    const window = DEDUP_WINDOW_HOURS.knowledge_gap_created;
    const k1 = buildNotificationDedupKey("knowledge_gap_created", "gap-1", t1, window);
    const k2 = buildNotificationDedupKey("knowledge_gap_created", "gap-1", t2, window);
    const k3 = buildNotificationDedupKey("knowledge_gap_created", "gap-1", t3, window);
    expect(k1).toBe(k2); // 24h apart — same 168h bucket
    expect(k1).not.toBe(k3); // 8 days later — new bucket
  });

  it("embeds type and dedupEventId in the documented format", () => {
    const now = new Date("2026-08-01T12:00:00.000Z");
    const expected = `processing_failed:doc-42:${Math.floor(now.getTime() / (24 * 3600e3))}`;
    expect(buildNotificationDedupKey("processing_failed", "doc-42", now)).toBe(expected);
  });
});

describe("buildDedupRangeQuery", () => {
  const now = new Date("2026-08-01T12:00:00.000Z");

  it("returns the sliding-window filter sorted deduplicatedAt desc, limit 1", () => {
    const range = buildDedupRangeQuery({
      tenantId: "tenant-1",
      userId: "user-1",
      type: "processing_failed",
      dedupEventId: "doc-1",
      now,
      windowHours: 24,
    });
    expect(range.filter).toEqual({
      tenantId: "tenant-1",
      userId: "user-1",
      type: "processing_failed",
      dedupEventId: "doc-1",
      deduplicatedAt: { $gt: new Date(now.getTime() - 24 * 3600e3) },
    });
    expect(range.sort).toEqual({ deduplicatedAt: -1 });
    expect(range.limit).toBe(1);
  });

  it("uses the type-specific window (168h for knowledge_gap)", () => {
    const range = buildDedupRangeQuery({
      tenantId: "t",
      userId: "u",
      type: "knowledge_gap_created",
      dedupEventId: "gap-1",
      now,
      windowHours: DEDUP_WINDOW_HOURS.knowledge_gap_created,
    });
    expect(range.filter.deduplicatedAt.$gt.getTime()).toBe(
      now.getTime() - 168 * 3600e3,
    );
  });

  it("passes mongoose ObjectIds through unchanged (generic TId)", () => {
    const tenantId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const range = buildDedupRangeQuery({
      tenantId,
      userId,
      type: "document_uploaded",
      dedupEventId: "doc-9",
      now,
      windowHours: 24,
    });
    expect(range.filter.tenantId).toBe(tenantId);
    expect(range.filter.userId).toBe(userId);
  });
});

describe("review round 4 #5 — bucket-boundary straddle (MUST-FIX)", () => {
  it("two duplicate events 1s apart across a bucket edge → ONE notification, version 2", () => {
    // 23:59:59.500 and 00:00:00.500 — opposite sides of a 24h bucket boundary.
    const first = new Date(BUCKET_BOUNDARY.getTime() - 500);
    const second = new Date(BUCKET_BOUNDARY.getTime() + 500);

    // The BUCKETED key differs across the edge — the unique-index guard alone
    // would NOT catch this duplicate...
    expect(
      buildNotificationDedupKey("processing_failed", "doc-1", first),
    ).not.toBe(buildNotificationDedupKey("processing_failed", "doc-1", second));

    // ...but the PRIMARY gate (sliding-window range query, 24h $gt) from the
    // second event's perspective still finds the first.
    const range = buildDedupRangeQuery({
      tenantId: "t",
      userId: "u",
      type: "processing_failed",
      dedupEventId: "doc-1",
      now: second,
      windowHours: 24,
    });
    expect(range.filter.deduplicatedAt.$gt.getTime()).toBeLessThan(first.getTime());

    // The service flow (T6): found existing → within window → update → v2.
    const existing = { version: 1, deduplicatedAt: first };
    const resolution = resolveDedup(
      existing,
      { version: 1, metadata: { attempts: 2 } },
      "replace",
      { now: second, windowHours: 24 },
    );
    expect(resolution.action).toBe("update");
    expect(resolution.next?.version).toBe(2);
  });
});

describe("resolveDedup window resolution", () => {
  const now = new Date("2026-08-01T12:00:00.000Z");

  it("existing within window + replace → update with version++", () => {
    const resolution = resolveDedup(
      { version: 1, deduplicatedAt: new Date("2026-08-01T10:00:00.000Z") },
      { version: 1, title: { en: "new" }, metadata: { attempts: 2 } },
      "replace",
      { now, windowHours: 24 },
    );
    expect(resolution.action).toBe("update");
    expect(resolution.next).toEqual({
      version: 2,
      title: { en: "new" },
      metadata: { attempts: 2 },
    });
  });

  it("existing within window + merge → update with metadata merged", () => {
    const resolution = resolveDedup(
      {
        version: 1,
        deduplicatedAt: new Date("2026-08-01T10:00:00.000Z"),
        metadata: { attempts: 1 },
      },
      { version: 1, metadata: { attempts: 2, errorCode: "OCR_FAILED" } },
      "merge",
      { now, windowHours: 24 },
    );
    expect(resolution.action).toBe("update");
    expect(resolution.next).toEqual({
      version: 2,
      metadata: { attempts: 2, errorCode: "OCR_FAILED" },
    });
  });

  it("existing within window + ignore → ignore, no version change", () => {
    const resolution = resolveDedup(
      { version: 1, deduplicatedAt: new Date("2026-08-01T10:00:00.000Z") },
      { version: 1, metadata: { attempts: 9 } },
      "ignore",
      { now, windowHours: 24 },
    );
    expect(resolution).toEqual({ action: "ignore", next: null });
  });

  it("existing outside the window → expired → new doc allowed", () => {
    const outside = new Date(now.getTime() - 25 * 3600e3); // 25h ago > 24h window
    const resolution = resolveDedup(
      { version: 1, deduplicatedAt: outside },
      { version: 1 },
      "replace",
      { now, windowHours: 24 },
    );
    expect(resolution).toEqual({ action: "expired", next: null });
  });

  it("existing exactly at the window edge is OUTSIDE ($gt semantics, matching the range-query filter)", () => {
    // The range query uses strict $gt (deduplicatedAt: {$gt: now - windowHours}),
    // so a doc at the exact cutoff is excluded from the lookup and a new doc
    // is created. resolveDedup must agree with the query: at-edge → expired.
    const atEdge = new Date(now.getTime() - 24 * 3600e3);
    expect(
      resolveDedup(
        { version: 3, deduplicatedAt: atEdge },
        { version: 1 },
        "replace",
        { now, windowHours: 24 },
      ),
    ).toEqual({ action: "expired", next: null });
    // 1ms inside the edge → still within the window → update.
    const justInside = new Date(atEdge.getTime() + 1);
    const resolution = resolveDedup(
      { version: 3, deduplicatedAt: justInside },
      { version: 1 },
      "replace",
      { now, windowHours: 24 },
    );
    expect(resolution.action).toBe("update");
    expect(resolution.next?.version).toBe(4);
  });

  it("no existing doc → expired → new doc allowed", () => {
    expect(resolveDedup(null, { version: 1 }, "replace", { now, windowHours: 24 })).toEqual(
      { action: "expired", next: null },
    );
    expect(resolveDedup(undefined, { version: 1 }, "merge", { now, windowHours: 24 })).toEqual(
      { action: "expired", next: null },
    );
  });

  it("supports string deduplicatedAt values", () => {
    const resolution = resolveDedup(
      { version: 1, deduplicatedAt: "2026-08-01T10:00:00.000Z" },
      { version: 1 },
      "replace",
      { now, windowHours: 24 },
    );
    expect(resolution.action).toBe("update");
  });
});

describe("applyDedupUpdateRule (local mirror of lifecycle applyUpdateRule)", () => {
  it("replace overwrites content and increments the version exactly once", () => {
    const result = applyDedupUpdateRule(
      "replace",
      { version: 1, metadata: { documentId: "doc-1" } },
      { version: 1, metadata: { errorCode: "OCR_FAILED" } },
    );
    expect(result).toEqual({
      action: "update",
      next: { version: 2, metadata: { errorCode: "OCR_FAILED" } },
    });
  });

  it("merge preserves existing metadata keys and deep-merges", () => {
    const result = applyDedupUpdateRule(
      "merge",
      { version: 1, metadata: { nested: { x: 1, keep: true } } },
      { version: 1, metadata: { nested: { y: 2 } } },
    );
    expect(result.next?.metadata).toEqual({ nested: { x: 1, keep: true, y: 2 } });
    expect(result.next?.version).toBe(2);
  });

  it("ignore returns {action:'ignore', next:null} without touching the version", () => {
    const existing = { version: 4, metadata: { documentId: "doc-1" } };
    expect(applyDedupUpdateRule("ignore", existing, { version: 1 })).toEqual({
      action: "ignore",
      next: null,
    });
    expect(existing.version).toBe(4);
  });
});
