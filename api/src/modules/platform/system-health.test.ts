import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("source-contract: system-health.ts performs real probes for MongoDB, Redis, API, and workers", async () => {
  const src = await readFile(new URL("./system-health.ts", import.meta.url), "utf8");

  assert.ok(src.includes("db.admin().command({ ping: 1 })"), "MongoDB probe uses ping");
  assert.ok(src.includes("redis.ping()"), "Redis probe uses PING");
  assert.ok(src.includes("process.uptime()"), "API health reports uptime");
  assert.ok(src.includes('buildServiceHealth("API", "healthy", null'), "API health does not fake latency");
  assert.ok(src.includes("config.WORKER_HEALTH_URL"), "Worker probe uses a validated health URL");
  assert.ok(src.includes("status === \"ready\""), "Worker readiness uses the worker health response");
  assert.ok(src.includes("normalizeWorkerProbeFailure"), "Worker probe normalizes transport failures");
  assert.ok(src.includes('reason:') && src.includes('"not_ready"'), "Worker probe reports a safe reason");
  assert.ok(src.includes("buildPlatformHealthSummary"), "Exports summary builder");
});

test("source-contract: system-health.ts normalizes overall platform state from service probes", async () => {
  const src = await readFile(new URL("./system-health.ts", import.meta.url), "utf8");

  assert.ok(src.includes('if (values.some((status) => status === "unavailable")) return "down";'));
  assert.ok(src.includes('if (values.some((status) => status === "degraded")) return "degraded";'));
  assert.ok(src.includes('const summary ='), "Builds a human-readable summary");
});
