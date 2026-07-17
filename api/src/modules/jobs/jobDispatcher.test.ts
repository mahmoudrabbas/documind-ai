import { test } from "node:test";
import assert from "node:assert/strict";
import type { JobEnvelope } from "workers/contracts";
import { ApiJobDispatcher } from "./jobDispatcher.js";

/**
 * Minimal fake of the BullMQ `Queue` surface the dispatcher uses, so the
 * producer logic (validation, dedup, tenant-scoping) can be tested without
 * Redis/Mongo infrastructure.
 */
class FakeQueue {
  jobs = new Map<string, { id: string; data: JobEnvelope }>();
  addCalls: Array<{ name: string; data: JobEnvelope; opts: unknown }> = [];

  async getJob(id: string) {
    return this.jobs.get(id) ?? null;
  }

  async add(name: string, data: JobEnvelope, opts: unknown) {
    const id = `${name}::${data.idempotencyKey}`;
    const job = { id, data };
    this.jobs.set(id, job);
    this.addCalls.push({ name, data, opts });
    return { id };
  }
}

function makeEnvelope(
  overrides: Partial<JobEnvelope> = {},
): Record<string, unknown> {
  return {
    jobType: "system.sample.noop",
    tenantId: "tenant-A",
    actorId: "actor-1",
    traceId: "trace-1",
    idempotencyKey: "idem-1",
    payload: { label: "x" },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

test("enqueue validates the envelope and rejects malformed input", async () => {
  const dispatcher = new ApiJobDispatcher(new FakeQueue() as never);
  const result = await dispatcher.enqueue({ bad: "envelope" });
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /envelope|jobType|tenantId/);
});

test("enqueue stores tenant from the envelope (auth context in route)", async () => {
  const fake = new FakeQueue();
  const dispatcher = new ApiJobDispatcher(fake as never);
  const res = await dispatcher.enqueue(makeEnvelope());
  assert.equal(res.ok, true);
  assert.equal(res.deduplicated, false);
  assert.equal(fake.addCalls.length, 1);
  assert.equal(fake.addCalls[0].data.tenantId, "tenant-A");
});

test("duplicate idempotency key is suppressed and returns same jobId", async () => {
  const fake = new FakeQueue();
  const dispatcher = new ApiJobDispatcher(fake as never);
  const first = await dispatcher.enqueue(
    makeEnvelope({ idempotencyKey: "dup" }),
  );
  const second = await dispatcher.enqueue(
    makeEnvelope({ idempotencyKey: "dup" }),
  );
  assert.equal(first.deduplicated, false);
  assert.equal(second.deduplicated, true);
  assert.equal(first.jobId, second.jobId);
  assert.equal(fake.addCalls.length, 1, "should only add once");
});

test("rejects oversized payloads via shared contract validation", async () => {
  const dispatcher = new ApiJobDispatcher(new FakeQueue() as never);
  const big = "x".repeat(256 * 1024 + 10);
  const result = await dispatcher.enqueue(makeEnvelope({ payload: big }));
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /maximum size/);
});
