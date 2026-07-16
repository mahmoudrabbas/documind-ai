import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyError,
  computeBackoffMs,
  DEFAULT_RETRY_POLICY,
  RetryableJobError,
  PermanentJobError,
} from "../contracts/retryPolicy.js";
import { deriveIdempotencyKey, buildDedupKey, hashString } from "../contracts/idempotency.js";

test("classifyError marks PermanentJobError as permanent", () => {
  assert.equal(classifyError(new PermanentJobError("x")), "permanent");
});

test("classifyError marks RetryableJobError as retryable", () => {
  assert.equal(classifyError(new RetryableJobError("x")), "retryable");
});

test("classifyError treats abort/timeout as permanent", () => {
  const aborted = new Error("aborted");
  aborted.name = "AbortError";
  assert.equal(classifyError(aborted), "permanent");
});

test("classifyError treats network errors as retryable", () => {
  const e = new Error("reset") as Error & { code: string };
  e.code = "ECONNRESET";
  assert.equal(classifyError(e), "retryable");
});

test("computeBackoffMs respects policy ceiling", () => {
  const policy = { ...DEFAULT_RETRY_POLICY, baseDelayMs: 1000, backoffFactor: 2, maxDelayMs: 3000 };
  assert.equal(computeBackoffMs(1, policy), 1000);
  assert.equal(computeBackoffMs(2, policy), 2000);
  const far = computeBackoffMs(20, policy);
  assert.ok(far <= 3000, "backoff never exceeds maxDelayMs");
});

test("deriveIdempotencyKey is stable and tenant-scoped", () => {
  const a = deriveIdempotencyKey({ tenantId: "t1", jobType: "jt", resourceId: "r1" });
  const b = deriveIdempotencyKey({ tenantId: "t1", jobType: "jt", resourceId: "r1" });
  const c = deriveIdempotencyKey({ tenantId: "t2", jobType: "jt", resourceId: "r1" });
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("buildDedupKey combines jobType and idempotencyKey", () => {
  assert.equal(buildDedupKey("jt", "k"), "jt::k");
});

test("hashString is deterministic sha256", () => {
  assert.equal(hashString("abc"), hashString("abc"));
  assert.notEqual(hashString("abc"), hashString("abd"));
});
