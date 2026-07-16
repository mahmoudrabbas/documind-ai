import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { InMemoryQueue } from "../queue/inMemoryQueue.js";
import { sampleJobHandler } from "../jobs/sampleJob.js";
import { RetryableJobError } from "@documind/contracts";

test("in-memory adapter enqueues, executes, and completes a sample job", async () => {
  const q = new InMemoryQueue();
  q.registerHandler(sampleJobHandler);
  q.start();

  const res = await q.enqueue({
    jobType: "system.sample.noop",
    tenantId: "t1",
    actorId: "a1",
    traceId: "trace-1",
    idempotencyKey: "idem-1",
    payload: { label: "hello" },
  });
  assert.equal(res.deduplicated, false);
  assert.ok(res.jobId.startsWith("job:"));

  // Allow the consumer loop to drain.
  await new Promise((r) => setTimeout(r, 200));

  const status = await q.getJobStatus(res.jobId);
  assert.equal(status?.state, "completed");

  const metrics = await q.getMetrics();
  assert.equal(metrics.completed, 1);
  assert.equal(metrics.queue, "inmemory");

  q.stop();
});

test("in-memory adapter suppresses duplicate idempotency keys", async () => {
  const q = new InMemoryQueue();
  q.registerHandler(sampleJobHandler);

  const first = await q.enqueue({
    jobType: "system.sample.noop",
    tenantId: "t1",
    actorId: "a1",
    traceId: "trace-1",
    idempotencyKey: "dup-key",
    payload: {},
  });
  const second = await q.enqueue({
    jobType: "system.sample.noop",
    tenantId: "t1",
    actorId: "a1",
    traceId: "trace-2",
    idempotencyKey: "dup-key",
    payload: {},
  });

  assert.equal(first.deduplicated, false);
  assert.equal(second.deduplicated, true);
  // Same underlying jobId returned for the duplicate.
  assert.equal(first.jobId, second.jobId);
});

test("in-memory adapter retries then completes on failOnce", async () => {
  const q = new InMemoryQueue();
  q.registerHandler(sampleJobHandler);
  q.start();

  const res = await q.enqueue({
    jobType: "system.sample.noop",
    tenantId: "t1",
    actorId: "a1",
    traceId: "trace-retry",
    idempotencyKey: "retry-1",
    payload: { failOnce: true },
  });

  // Wait through at least one retry cycle.
  await new Promise((r) => setTimeout(r, 400));

  const status = await q.getJobStatus(res.jobId);
  assert.equal(status?.state, "completed");
  assert.ok((status?.attemptsMade ?? 0) >= 2, "should have retried at least once");

  q.stop();
});

test("in-memory adapter dead-letters permanent failures", async () => {
  const failingHandler = {
    jobType: "test.permanent",
    description: "always fails permanently",
    payloadSchema: z.object({}),
    handle: async () => {
      throw new RetryableJobError("never recovers");
    },
  };
  const q = new InMemoryQueue({ maxAttempts: 2 });
  q.registerHandler(failingHandler);
  q.start();

  const res = await q.enqueue({
    jobType: "test.permanent",
    tenantId: "t1",
    actorId: "a1",
    traceId: "trace-fail",
    idempotencyKey: "fail-1",
    payload: {},
  });

  await new Promise((r) => setTimeout(r, 400));

  const status = await q.getJobStatus(res.jobId);
  assert.equal(status?.state, "failed");
  assert.ok((status?.attemptsMade ?? 0) >= 2);

  q.stop();
});
