import assert from "node:assert/strict";
import test from "node:test";
import { EnvironmentValidationError, parseEnv } from "./env.js";

test("worker requires explicit dependencies outside development", () => {
  assert.throws(
    () => parseEnv({ NODE_ENV: "production" }),
    (error: unknown) => {
      assert(error instanceof EnvironmentValidationError);
      assert.deepEqual(error.keys, ["MONGODB_URI"]);
      return true;
    },
  );

  assert.throws(
    () =>
      parseEnv({
        NODE_ENV: "production",
        MONGODB_URI: "mongodb+srv://test:test@mongo.test.invalid/documind-test",
      }),
    (error: unknown) => {
      assert(error instanceof EnvironmentValidationError);
      assert.deepEqual(error.keys, [
        "EMAIL_VERIFICATION_JWT_SECRET",
        "REDIS_URL",
      ]);
      return true;
    },
  );
});

test("worker accepts explicit test dependencies", () => {
  const env = parseEnv({
    NODE_ENV: "test",
    MONGODB_URI: "mongodb+srv://test:test@mongo.test.invalid/documind-test",
    REDIS_URL: "redis://127.0.0.1:6379/1",
    EMAIL_VERIFICATION_JWT_SECRET: "test-worker-email-verification-secret",
  });
  assert.equal(env.NODE_ENV, "test");
});

test("notification socket env: NOTIFICATION_TRANSPORT defaults to rest with a socket URL", () => {
  const env = parseEnv({
    NODE_ENV: "test",
    MONGODB_URI: "mongodb+srv://test:test@mongo.test.invalid/documind-test",
    REDIS_URL: "redis://127.0.0.1:6379/1",
    EMAIL_VERIFICATION_JWT_SECRET: "test-worker-email-verification-secret",
  });
  assert.equal(env.NOTIFICATION_TRANSPORT, "rest");
  assert.equal(env.NOTIFICATION_SOCKET_URL, "http://localhost:5000");
});

test("notification socket env: NOTIFICATION_SOCKET_SERVICE_TOKEN required when transport=socket in production/test", () => {
  const base = {
    NODE_ENV: "production",
    MONGODB_URI: "mongodb+srv://test:test@mongo.test.invalid/documind-test",
    REDIS_URL: "redis://127.0.0.1:6379/1",
    EMAIL_VERIFICATION_JWT_SECRET: "test-worker-email-verification-secret",
  };

  assert.throws(
    () => parseEnv({ ...base, NOTIFICATION_TRANSPORT: "socket" }),
    (error: unknown) => {
      assert(error instanceof EnvironmentValidationError);
      assert.ok(error.keys.includes("NOTIFICATION_SOCKET_SERVICE_TOKEN"));
      return true;
    },
  );

  const env = parseEnv({
    ...base,
    NOTIFICATION_TRANSPORT: "socket",
    NOTIFICATION_SOCKET_SERVICE_TOKEN: "test-worker-socket-token",
  });
  assert.equal(env.NOTIFICATION_TRANSPORT, "socket");
  assert.equal(
    env.NOTIFICATION_SOCKET_SERVICE_TOKEN,
    "test-worker-socket-token",
  );
});
