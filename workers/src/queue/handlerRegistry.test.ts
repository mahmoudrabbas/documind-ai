import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { InMemoryJobHandlerRegistry, executeHandler } from "../queue/handlerRegistry.js";
import { PermanentJobError, RetryableJobError } from "@documind/contracts";
import type { JobEnvelope } from "@documind/contracts";

function envelope(payload: unknown): JobEnvelope {
  return {
    jobType: "test.job",
    schemaVersion: "1.0.0",
    tenantId: "t",
    actorId: "a",
    traceId: "tr",
    idempotencyKey: "id",
    payload,
    createdAt: new Date().toISOString(),
  };
}

function ctx(payload: unknown, attemptsMade = 0) {
  return {
    envelope: envelope(payload, attemptsMade),
    traceId: "tr",
    isRetry: attemptsMade > 0,
    attemptsMade,
    maxAttempts: 5,
    signal: new AbortController().signal,
    progress: () => {},
  };
}

test("registry stores and retrieves handlers", () => {
  const reg = new InMemoryJobHandlerRegistry();
  const def = {
    jobType: "a.b",
    description: "d",
    payloadSchema: z.object({ x: z.number() }),
    handle: async () => {},
  };
  reg.register(def);
  assert.equal(reg.has("a.b"), true);
  assert.equal(reg.get("a.b"), def);
  assert.throws(() => reg.register(def));
});

test("executeHandler validates payload and dead-letters on mismatch", async () => {
  const handler = {
    jobType: "a.b",
    description: "d",
    payloadSchema: z.object({ x: z.number() }),
    handle: async () => {},
  };
  const outcome = await executeHandler(handler, ctx({ x: "not-a-number" }));
  assert.equal(outcome.ok, false);
  assert.equal(outcome.deadLettered, true);
  assert.match(outcome.failedReason ?? "", /validation/);
});

test("executeHandler runs successful handler", async () => {
  let ran = false;
  const handler = {
    jobType: "a.b",
    description: "d",
    payloadSchema: z.object({ x: z.number() }),
    handle: async () => {
      ran = true;
    },
  };
  const outcome = await executeHandler(handler, ctx({ x: 1 }));
  assert.equal(outcome.ok, true);
  assert.equal(ran, true);
});

test("executeHandler classifies retryable error and schedules retry", async () => {
  const handler = {
    jobType: "a.b",
    description: "d",
    payloadSchema: z.object({}),
    handle: async () => {
      throw new RetryableJobError("transient");
    },
  };
  const policy = { maxAttempts: 3, baseDelayMs: 100, backoffFactor: 2, maxDelayMs: 1000 };
  const outcome = await executeHandler(handler, ctx({}, 0), policy);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.shouldRetry, true);
  assert.equal(outcome.deadLettered, false);
  assert.ok(outcome.nextDelayMs > 0);
});

test("executeHandler dead-letters permanent error", async () => {
  const handler = {
    jobType: "a.b",
    description: "d",
    payloadSchema: z.object({}),
    handle: async () => {
      throw new PermanentJobError("bad input");
    },
  };
  const outcome = await executeHandler(handler, ctx({}, 0));
  assert.equal(outcome.shouldRetry, false);
  assert.equal(outcome.deadLettered, true);
});

test("executeHandler aborts before start", async () => {
  const controller = new AbortController();
  controller.abort();
  const handler = {
    jobType: "a.b",
    description: "d",
    payloadSchema: z.object({}),
    handle: async () => {},
  };
  const outcome = await executeHandler(handler, {
    ...ctx({}),
    signal: controller.signal,
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.deadLettered, true);
});
