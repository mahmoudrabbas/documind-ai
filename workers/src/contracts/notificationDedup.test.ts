import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyDedupUpdateRule,
  buildDedupRangeQuery,
  buildNotificationDedupKey,
  DEDUP_WINDOW_HOURS,
  resolveDedup,
} from "./notificationDedup.js";

/**
 * T5 — worker-side node:test suite for the shared dedup contract.
 *
 * Cross-workspace consistency: the API vitest suite
 * (api/src/modules/notifications/__tests__/dedup.test.ts) imports the SAME
 * function through the "workers/contracts" built barrel; this suite imports
 * it from source. Both must compute the identical key for identical input.
 */

const SHARED_INPUT = {
  type: "processing_failed" as const,
  dedupEventId: "doc-42",
  now: new Date("2026-08-01T12:34:56.789Z"),
};

test("cross-workspace consistency: same input → identical bucketed key", () => {
  const key = buildNotificationDedupKey(
    SHARED_INPUT.type,
    SHARED_INPUT.dedupEventId,
    SHARED_INPUT.now,
  );
  const expected = `processing_failed:doc-42:${Math.floor(
    SHARED_INPUT.now.getTime() / (24 * 3600e3),
  )}`;
  assert.equal(key, expected);
  // The api-side suite asserts the same shape for the same input through the
  // built barrel — identical formula ⇒ identical key across workspaces.
});

test("key is deterministic for the same input", () => {
  const a = buildNotificationDedupKey(
    SHARED_INPUT.type,
    SHARED_INPUT.dedupEventId,
    SHARED_INPUT.now,
  );
  const b = buildNotificationDedupKey(
    SHARED_INPUT.type,
    SHARED_INPUT.dedupEventId,
    SHARED_INPUT.now,
  );
  assert.equal(a, b);
});

test("key differs across the 24h bucket boundary", () => {
  const boundary = new Date("2026-08-01T00:00:00.000Z");
  const before = new Date(boundary.getTime() - 1);
  const after = new Date(boundary.getTime() + 1);
  assert.notEqual(
    buildNotificationDedupKey("processing_failed", "doc-1", before),
    buildNotificationDedupKey("processing_failed", "doc-1", after),
  );
});

test("DEDUP_WINDOW_HOURS matches the plan exactly", () => {
  assert.deepEqual(DEDUP_WINDOW_HOURS, {
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

test("range query is a sliding 24h window on deduplicatedAt, desc, limit 1", () => {
  const range = buildDedupRangeQuery({
    tenantId: "t1",
    userId: "u1",
    type: "processing_failed",
    dedupEventId: "doc-1",
    now: SHARED_INPUT.now,
    windowHours: 24,
  });
  assert.deepEqual(range.filter, {
    tenantId: "t1",
    userId: "u1",
    type: "processing_failed",
    dedupEventId: "doc-1",
    deduplicatedAt: {
      $gt: new Date(SHARED_INPUT.now.getTime() - 24 * 3600e3),
    },
  });
  assert.deepEqual(range.sort, { deduplicatedAt: -1 });
  assert.equal(range.limit, 1);
});

test("bucket-boundary straddle is caught by the sliding window ($gt finds the first)", () => {
  const boundary = new Date("2026-08-01T00:00:00.000Z");
  const first = new Date(boundary.getTime() - 500); // 23:59:59.500
  const second = new Date(boundary.getTime() + 500); // 00:00:00.500
  // Bucketed keys differ (unique-index guard alone would miss the duplicate)...
  assert.notEqual(
    buildNotificationDedupKey("processing_failed", "doc-1", first),
    buildNotificationDedupKey("processing_failed", "doc-1", second),
  );
  // ...but the primary range gate still finds the first event.
  const range = buildDedupRangeQuery({
    tenantId: "t",
    userId: "u",
    type: "processing_failed",
    dedupEventId: "doc-1",
    now: second,
    windowHours: 24,
  });
  assert.ok(
    range.filter.deduplicatedAt.$gt.getTime() < first.getTime(),
    "$gt cutoff must precede the first event",
  );
  const resolution = resolveDedup(
    { version: 1, deduplicatedAt: first },
    { version: 1, metadata: { attempts: 2 } },
    "replace",
    { now: second, windowHours: 24 },
  );
  assert.equal(resolution.action, "update");
  assert.equal(resolution.next?.version, 2);
});

test("resolveDedup: within window → update/ignore per rule; outside → expired", () => {
  const now = new Date("2026-08-01T12:00:00.000Z");
  assert.equal(
    resolveDedup(
      { version: 1, deduplicatedAt: new Date("2026-08-01T10:00:00.000Z") },
      { version: 1 },
      "replace",
      { now, windowHours: 24 },
    ).action,
    "update",
  );
  assert.equal(
    resolveDedup(
      { version: 1, deduplicatedAt: new Date("2026-08-01T10:00:00.000Z") },
      { version: 1 },
      "ignore",
      { now, windowHours: 24 },
    ).action,
    "ignore",
  );
  assert.deepEqual(
    resolveDedup(
      { version: 1, deduplicatedAt: new Date(now.getTime() - 25 * 3600e3) },
      { version: 1 },
      "replace",
      { now, windowHours: 24 },
    ),
    { action: "expired", next: null },
  );
  assert.deepEqual(
    resolveDedup(null, { version: 1 }, "replace", { now, windowHours: 24 }),
    { action: "expired", next: null },
  );
});

test("applyDedupUpdateRule mirrors the lifecycle replace/merge/ignore semantics", () => {
  assert.equal(
    applyDedupUpdateRule(
      "replace",
      { version: 1, metadata: { documentId: "doc-1" } },
      { version: 1, metadata: { errorCode: "OCR_FAILED" } },
    ).next?.version,
    2,
  );
  assert.equal(
    applyDedupUpdateRule(
      "merge",
      { version: 1, metadata: { attempts: 1 } },
      { version: 1, metadata: { attempts: 2, errorCode: "OCR_FAILED" } },
    ).next?.version,
    2,
  );
  assert.deepEqual(
    applyDedupUpdateRule("ignore", { version: 4 }, { version: 1 }),
    { action: "ignore", next: null },
  );
});
