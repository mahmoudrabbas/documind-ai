import assert from "node:assert/strict";
import test from "node:test";
import {
  getCurrentRequestId,
  getPropagationHeaders,
  withRequestContext,
} from "./requestContext.js";

test("propagates request IDs through async boundaries", async () => {
  const result = await withRequestContext("req-123", async () => {
    const current = getCurrentRequestId();
    await Promise.resolve();
    return current;
  });

  assert.equal(result, "req-123");
});

test("creates propagation headers for downstream workers and LLM calls", () => {
  const headers = getPropagationHeaders("req-456");

  assert.deepEqual(headers, {
    "x-request-id": "req-456",
    "x-correlation-id": "req-456",
  });
});
