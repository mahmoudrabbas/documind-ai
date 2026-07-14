import assert from "node:assert/strict";
import test from "node:test";
import { EnvironmentValidationError, parseEnv } from "./env.js";

test("worker requires explicit dependencies outside development", () => {
  assert.throws(
    () => parseEnv({ NODE_ENV: "production" }),
    (error: unknown) => {
      assert(error instanceof EnvironmentValidationError);
      assert.deepEqual(error.keys, ["MONGODB_URI", "REDIS_URL"]);
      return true;
    },
  );
});

test("worker accepts explicit test dependencies", () => {
  const env = parseEnv({ NODE_ENV: "test", MONGODB_URI: "mongodb://127.0.0.1:27017/documind-test", REDIS_URL: "redis://127.0.0.1:6379/1" });
  assert.equal(env.NODE_ENV, "test");
});
