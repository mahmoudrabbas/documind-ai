import { test } from "node:test";
import assert from "node:assert/strict";
import { Redis } from "ioredis";
import { BullMQQueue } from "../queue/bullmqQueue.js";
import { sampleJobHandler } from "../jobs/sampleJob.js";

/**
 * Integration contract test for the BullMQ adapter.
 *
 * Requires a disposable Redis at REDIS_URL (default redis://127.0.0.1:6379).
 * Skipped automatically when Redis is unreachable so it never blocks CI
 * without infrastructure. Run via:
 *   REDIS_URL=redis://127.0.0.1:6379 npm test
 */
const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

async function redisReachable(): Promise<boolean> {
  const client = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await client.connect();
    await client.ping();
    return true;
  } catch {
    return false;
  } finally {
    client.disconnect();
  }
}

async function makeAdapter(): Promise<BullMQQueue> {
  const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  const adapter = new BullMQQueue({
    queueName: `test-${Math.random().toString(36).slice(2)}`,
    connection,
    concurrency: 1,
    removeOnComplete: 100,
    removeOnFail: false,
  });
  adapter.registerHandler(sampleJobHandler);
  return adapter;
}

test("bullmq adapter enqueues, executes, and completes a sample job", { skip: !REDIS_URL }, async (t) => {
  if (!(await redisReachable())) {
    t.skip("redis not reachable");
    return;
  }
  const adapter = await makeAdapter();
  try {
    adapter.start(new AbortController().signal);

    const res = await adapter.enqueue({
      jobType: "system.sample.noop",
      tenantId: "t1",
      actorId: "a1",
      traceId: "trace-bull-1",
      idempotencyKey: "bull-1",
      payload: { label: "bullmq" },
    });
    assert.equal(res.deduplicated, false);
    assert.ok(res.jobId);

    // Wait for the worker to process.
    await new Promise((r) => setTimeout(r, 1500));

    const status = await adapter.getJobStatus(res.jobId);
    assert.equal(status?.state, "completed");

    const metrics = await adapter.getMetrics();
    assert.equal(metrics.waiting + metrics.active + metrics.completed + metrics.failed, 1);
  } finally {
    await adapter.close();
  }
});

test("bullmq adapter suppresses duplicate idempotency keys", { skip: !REDIS_URL }, async (t) => {
  if (!(await redisReachable())) {
    t.skip("redis not reachable");
    return;
  }
  const adapter = await makeAdapter();
  try {
    adapter.start(new AbortController().signal);
    const idem = `bull-dup-${Math.random().toString(36).slice(2)}`;
    const first = await adapter.enqueue({
      jobType: "system.sample.noop",
      tenantId: "t1",
      actorId: "a1",
      traceId: "t1",
      idempotencyKey: idem,
      payload: {},
    });
    const second = await adapter.enqueue({
      jobType: "system.sample.noop",
      tenantId: "t1",
      actorId: "a1",
      traceId: "t2",
      idempotencyKey: idem,
      payload: {},
    });
    assert.equal(first.deduplicated, false);
    assert.equal(second.deduplicated, true);
    assert.equal(first.jobId, second.jobId);
  } finally {
    await adapter.close();
  }
});

test("bullmq adapter dead-letters and replays a failing job", { skip: !REDIS_URL }, async (t) => {
  if (!(await redisReachable())) {
    t.skip("redis not reachable");
    return;
  }
  const failing = {
    jobType: "test.bull.fail",
    description: "always permanent fail",
    payloadSchema: (await import("zod")).z.object({}),
    handle: async () => {
      throw new (await import("@documind/contracts")).PermanentJobError("nope");
    },
  };
  const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  const adapter = new BullMQQueue({
    queueName: `test-fail-${Math.random().toString(36).slice(2)}`,
    connection,
    concurrency: 1,
    removeOnFail: false,
  });
  adapter.registerHandler(failing);
  try {
    adapter.start(new AbortController().signal);
    const res = await adapter.enqueue({
      jobType: "test.bull.fail",
      tenantId: "t1",
      actorId: "a1",
      traceId: "tf",
      idempotencyKey: "bull-fail-1",
      payload: {},
    });
    await new Promise((r) => setTimeout(r, 2000));
    const status = await adapter.getJobStatus(res.jobId);
    assert.equal(status?.state, "failed");

    const replayed = await adapter.replayJob(res.jobId);
    assert.equal(replayed, true);
    await new Promise((r) => setTimeout(r, 2000));
    const status2 = await adapter.getJobStatus(res.jobId);
    assert.equal(status2?.state, "failed");
  } finally {
    await adapter.close();
  }
});
