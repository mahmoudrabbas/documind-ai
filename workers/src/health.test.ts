import assert from "node:assert/strict";
import test from "node:test";
import { buildHealthResponse } from "./health.js";
import type { WorkerRuntime } from "./runtime.js";

function makeRuntime(ready: boolean): WorkerRuntime {
  return {
    adapterKind: "inmemory",
    dispatcher: {
      getMetrics: async () => ({
        queue: "inmemory",
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      }),
    } as WorkerRuntime["dispatcher"],
    registry: {
      list: () => [],
    } as WorkerRuntime["registry"],
    start: async () => {},
    stop: async () => {},
    readiness: async () => ({
      ready,
      checks: {
        redis: ready,
        mongodb: ready,
        handlersRegistered: ready,
        consumerRunning: ready,
      },
      details: {
        adapterKind: "inmemory",
        queue: "documind-jobs",
        handlerCount: 0,
      },
    }),
    shutdownSignal: new AbortController().signal,
  };
}

test("buildHealthResponse reports a live worker process", async () => {
  const response = await buildHealthResponse(makeRuntime(true), "/healthz");

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "ok");
  assert.equal(typeof response.body.checkedAt, "string");
  assert.equal(typeof response.body.uptimeMs, "number");
});

test("buildHealthResponse returns readiness details without exposing secrets", async () => {
  const readyResponse = await buildHealthResponse(makeRuntime(true), "/readyz");
  assert.equal(readyResponse.statusCode, 200);
  assert.equal(readyResponse.body.status, "ready");
  assert.equal((readyResponse.body as { checks: Record<string, boolean> }).checks.redis, true);
  assert.equal((readyResponse.body as { checks: Record<string, boolean> }).checks.consumerRunning, true);
  assert.equal(typeof readyResponse.body.checkedAt, "string");
  assert.equal(typeof readyResponse.body.uptimeMs, "number");

  const notReadyResponse = await buildHealthResponse(makeRuntime(false), "/readyz");
  assert.equal(notReadyResponse.statusCode, 503);
  assert.equal(notReadyResponse.body.status, "not_ready");
  assert.equal((notReadyResponse.body as { checks: Record<string, boolean> }).checks.redis, false);
  assert.equal(notReadyResponse.body.error, undefined);
  assert.equal(JSON.stringify(notReadyResponse.body).includes("secret"), false);
});

test("buildHealthResponse normalizes runtime failures and unknown paths", async () => {
  const failingRuntime = {
    ...makeRuntime(false),
    readiness: async () => {
      throw new Error("boom");
    },
  } as WorkerRuntime;

  const failed = await buildHealthResponse(failingRuntime, "/readyz");
  assert.equal(failed.statusCode, 503);
  assert.equal(failed.body.status, "not_ready");
  assert.equal(failed.body.error, "unavailable");

  const missing = await buildHealthResponse(makeRuntime(true), "/missing");
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.body.error, "not found");
});
