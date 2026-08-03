import assert from "node:assert/strict";
import test from "node:test";
import { getAllowedOrigins, resolveCorsOrigin } from "./corsOrigins.js";

type EnvKey = "CORS_ORIGIN" | "APP_FRONTEND_URL" | "NODE_ENV";
const ENV_KEYS: readonly EnvKey[] = ["CORS_ORIGIN", "APP_FRONTEND_URL", "NODE_ENV"];

const snapshotEnv = (): Partial<Record<EnvKey, string | undefined>> => {
  const saved: Partial<Record<EnvKey, string | undefined>> = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
  }
  return saved;
};

const restoreEnv = (saved: Partial<Record<EnvKey, string | undefined>>) => {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
};

let savedEnv: Partial<Record<EnvKey, string | undefined>>;

test.beforeEach(() => {
  savedEnv = snapshotEnv();
});

test.afterEach(() => {
  restoreEnv(savedEnv);
});

test("(a) development: CORS_ORIGIN + APP_FRONTEND_URL + localhost:3000 are all allowed", () => {
  process.env.NODE_ENV = "development";
  process.env.CORS_ORIGIN = "http://a.com,http://b.com/";
  process.env.APP_FRONTEND_URL = "http://c.com";

  const allowed = getAllowedOrigins();

  assert.deepEqual(
    [...allowed].sort(),
    ["http://a.com", "http://b.com", "http://c.com", "http://localhost:3000"],
  );
  assert.equal(resolveCorsOrigin("http://b.com/"), true);
});

test("(b) production: localhost:3000 is NOT allowed when no origins are configured", () => {
  process.env.NODE_ENV = "production";
  delete process.env.CORS_ORIGIN;
  delete process.env.APP_FRONTEND_URL;

  const allowed = getAllowedOrigins();

  assert.equal(allowed.size, 0);
  assert.equal(allowed.has("http://localhost:3000"), false);
  assert.equal(resolveCorsOrigin("http://localhost:3000"), false);
});

test("(c) resolveCorsOrigin returns true for falsy origins (server-to-server, curl, health checks)", () => {
  assert.equal(resolveCorsOrigin(undefined), true);
  assert.equal(resolveCorsOrigin(""), true);
});

test("(d) resolveCorsOrigin rejects origins that are not in the allowed set", () => {
  process.env.NODE_ENV = "development";
  delete process.env.CORS_ORIGIN;
  delete process.env.APP_FRONTEND_URL;

  assert.equal(resolveCorsOrigin("http://evil.example"), false);
  assert.equal(resolveCorsOrigin("http://localhost:3000"), true);
});

test("(e) CORS_ORIGIN with stray spaces and empty entries normalizes cleanly", () => {
  process.env.NODE_ENV = "production";
  process.env.CORS_ORIGIN = " http://x.com , , http://y.com ";
  delete process.env.APP_FRONTEND_URL;

  const allowed = getAllowedOrigins();

  assert.deepEqual([...allowed].sort(), ["http://x.com", "http://y.com"]);
  assert.equal([...allowed].some((origin) => origin.trim().length === 0), false);
});
