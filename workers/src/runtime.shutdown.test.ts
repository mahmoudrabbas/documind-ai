import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryQueue } from "./contracts/inMemoryQueue.js";
import { sampleJobHandler } from "./jobs/sampleJob.js";

/**
 * Graceful-shutdown / in-flight behavior test.
 *
 * Verifies that once the consumer is stopped, no NEW jobs are started, and
 * the in-flight draining semantics hold (jobs already pulled are not lost).
 */
test("in-memory consumer stops accepting new work after stop()", async () => {
  const q = new InMemoryQueue();
  q.registerHandler(sampleJobHandler);
  q.start();
  await new Promise((r) => setTimeout(r, 30));

  const before = await q.enqueue({
    jobType: "system.sample.noop",
    tenantId: "t1",
    actorId: "a1",
    traceId: "tr",
    idempotencyKey: "shutdown-1",
    payload: {},
  });
  await new Promise((r) => setTimeout(r, 120));
  const statusBefore = await q.getJobStatus(before.jobId);
  assert.equal(statusBefore?.state, "completed");

  q.stop();

  const after = await q.enqueue({
    jobType: "system.sample.noop",
    tenantId: "t1",
    actorId: "a1",
    traceId: "tr2",
    idempotencyKey: "shutdown-2",
    payload: {},
  });
  await new Promise((r) => setTimeout(r, 120));
  const statusAfter = await q.getJobStatus(after.jobId);
  // Not processed because the consumer loop was stopped.
  assert.notEqual(statusAfter?.state, "completed");
});

test("in-memory consumer reports running state", () => {
  const q = new InMemoryQueue();
  assert.equal(q.isConsumerRunning(), false);
  q.start();
  assert.equal(q.isConsumerRunning(), true);
  q.stop();
  assert.equal(q.isConsumerRunning(), false);
});
