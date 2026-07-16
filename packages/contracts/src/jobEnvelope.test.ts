import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateJobEnvelope,
  isPayloadWithinSizeLimit,
  MAX_JOB_PAYLOAD_BYTES,
} from "@documind/contracts";

function validEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    jobType: "system.sample.noop",
    schemaVersion: "1.0.0",
    tenantId: "tenant-1",
    actorId: "actor-1",
    traceId: "trace-1",
    idempotencyKey: "idem-1",
    payload: { label: "test" },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

test("validateJobEnvelope accepts a well-formed envelope", () => {
  const result = validateJobEnvelope(validEnvelope());
  assert.equal(result.ok, true);
  assert.equal(result.value?.jobType, "system.sample.noop");
});

test("validateJobEnvelope rejects missing required fields", () => {
  const result = validateJobEnvelope({ jobType: "x" });
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /tenantId/);
});

test("validateJobEnvelope rejects invalid jobType characters", () => {
  const result = validateJobEnvelope(validEnvelope({ jobType: "bad type!" }));
  assert.equal(result.ok, false);
});

test("validateJobEnvelope rejects oversized payloads", () => {
  const big = "x".repeat(MAX_JOB_PAYLOAD_BYTES + 10);
  const result = validateJobEnvelope(validEnvelope({ payload: big }));
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /maximum size/);
});

test("isPayloadWithinSizeLimit is false for >256KiB", () => {
  assert.equal(
    isPayloadWithinSizeLimit("x".repeat(MAX_JOB_PAYLOAD_BYTES + 1)),
    false,
  );
  assert.equal(isPayloadWithinSizeLimit({ a: 1 }), true);
});
