import assert from "node:assert/strict";
import test from "node:test";
import { EnvironmentValidationError, parseEnv } from "./env.js";

test("production fails fast with variable names and no environment values", () => {
  const marker = "must-never-appear-in-errors";
  assert.throws(
    () => parseEnv({ NODE_ENV: "production", JWT_SECRET: marker }),
    (error: unknown) => {
      assert(error instanceof EnvironmentValidationError);
      assert(error.keys.includes("JWT_SECRET"));
      assert(error.keys.includes("JWT_REFRESH_SECRET"));
      assert(!error.message.includes(marker));
      return true;
    },
  );
});

test("controlled environments accept explicit safe service contracts", () => {
  const secret = "test-only-secret-value-with-32-characters-minimum";
  const env = parseEnv({
    NODE_ENV: "test",
    MONGODB_URI: "mongodb://127.0.0.1:27017/documind-test",
    REDIS_URL: "redis://127.0.0.1:6379/1",
    APP_FRONTEND_URL: "https://app.test.invalid",
    JWT_SECRET: secret,
    JWT_REFRESH_SECRET: `${secret}-refresh`,
    EMAIL_VERIFICATION_JWT_SECRET: `${secret}-verification`,
    PASSWORD_RESET_JWT_SECRET: `${secret}-reset`,
    EMAIL_WEBHOOK_SECRET: `${secret}-webhook`,
  });
  assert.equal(env.NODE_ENV, "test");
});
