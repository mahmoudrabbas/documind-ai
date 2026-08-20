import assert from "node:assert/strict";
import test from "node:test";
import { EnvironmentValidationError, parseEnv } from "./env.js";

test("production fails fast with variable names and no environment values", () => {
  const marker = "must-never-appear-in-errors";
  assert.throws(
    () => parseEnv({
      NODE_ENV: "production",
      MONGODB_URI: "mongodb+srv://test:test@mongo.test.invalid/documind-test",
      JWT_SECRET: marker,
    }),
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
    MONGODB_URI: "mongodb+srv://test:test@mongo.test.invalid/documind-test",
    REDIS_URL: "redis://127.0.0.1:6379/1",
    APP_FRONTEND_URL: "https://app.test.invalid",
    JWT_SECRET: secret,
    JWT_REFRESH_SECRET: `${secret}-refresh`,
    EMAIL_VERIFICATION_JWT_SECRET: `${secret}-verification`,
    PASSWORD_RESET_JWT_SECRET: `${secret}-reset`,
    EMAIL_WEBHOOK_SECRET: `${secret}-webhook`,
    NOTIFICATION_SOCKET_SERVICE_TOKEN: `${secret}-socket`,
  });
  assert.equal(env.NODE_ENV, "test");
});

test("Stripe requires webhook verification in test as well as production", () => {
  assert.throws(
    () => parseEnv({ NODE_ENV: "test", MONGODB_URI: "mongodb://127.0.0.1:27017/documind-test", NOTIFICATION_SOCKET_SERVICE_TOKEN: "test-only-secret-value-with-32-characters-minimum-socket", PAYMENT_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk_test_explicit" }),
    (error: unknown) => error instanceof EnvironmentValidationError && error.keys.includes("STRIPE_WEBHOOK_SECRET"),
  );
});

test("fake provider does not require Stripe secrets", () => {
  const secret = "test-only-secret-value-with-32-characters-minimum";
  const env = parseEnv({ NODE_ENV: "test", PAYMENT_PROVIDER: "fake", MONGODB_URI: "mongodb://127.0.0.1:27017/documind-test", REDIS_URL: "redis://127.0.0.1:6379/1", APP_FRONTEND_URL: "https://app.test.invalid", JWT_SECRET: secret, JWT_REFRESH_SECRET: `${secret}-refresh`, EMAIL_VERIFICATION_JWT_SECRET: `${secret}-verification`, PASSWORD_RESET_JWT_SECRET: `${secret}-reset`, EMAIL_WEBHOOK_SECRET: `${secret}-webhook`, NOTIFICATION_SOCKET_SERVICE_TOKEN: `${secret}-socket` });
  assert.equal(env.PAYMENT_PROVIDER, "fake");
  assert.equal(env.STRIPE_BILLING_PORTAL_RETURN_URL, "http://localhost:3000/dashboard/settings/billing");
});

test("WORKER_HEALTH_URL accepts a valid internal worker readiness endpoint", () => {
  const secret = "test-only-secret-value-with-32-characters-minimum";
  const env = parseEnv({
    NODE_ENV: "test",
    PAYMENT_PROVIDER: "fake",
    MONGODB_URI: "mongodb://127.0.0.1:27017/documind-test",
    REDIS_URL: "redis://127.0.0.1:6379/1",
    APP_FRONTEND_URL: "https://app.test.invalid",
    WORKER_HEALTH_URL: "http://worker:3001/readyz",
    JWT_SECRET: secret,
    JWT_REFRESH_SECRET: `${secret}-refresh`,
    EMAIL_VERIFICATION_JWT_SECRET: `${secret}-verification`,
    PASSWORD_RESET_JWT_SECRET: `${secret}-reset`,
    EMAIL_WEBHOOK_SECRET: `${secret}-webhook`,
    NOTIFICATION_SOCKET_SERVICE_TOKEN: `${secret}-socket`,
  });
  assert.equal(env.WORKER_HEALTH_URL, "http://worker:3001/readyz");
});

test("Stripe portal return URL must match its configured allowed origin", () => {
  assert.throws(
    () => parseEnv({ NODE_ENV: "test", MONGODB_URI: "mongodb://127.0.0.1:27017/documind-test", NOTIFICATION_SOCKET_SERVICE_TOKEN: "test-only-secret-value-with-32-characters-minimum-socket", PAYMENT_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk_test_explicit", STRIPE_WEBHOOK_SECRET: "whsec_explicit", STRIPE_BILLING_PORTAL_RETURN_URL: "https://evil.example/checkout", BILLING_PORTAL_ALLOWED_ORIGIN: "https://app.example" }),
    (error: unknown) => error instanceof EnvironmentValidationError && error.keys.includes("STRIPE_BILLING_PORTAL_RETURN_URL"),
  );
});

test("Stripe general portal configuration remains optional so Phase 2 can fail safe", () => {
  const env = parseEnv({
    NODE_ENV: "test",
    PAYMENT_PROVIDER: "stripe",
    STRIPE_SECRET_KEY: "sk_test_explicit",
    STRIPE_WEBHOOK_SECRET: "whsec_explicit",
    MONGODB_URI: "mongodb://127.0.0.1:27017/documind-test",
    REDIS_URL: "redis://127.0.0.1:6379/1",
    APP_FRONTEND_URL: "https://app.test.invalid",
    JWT_SECRET: "test-only-secret-value-with-32-characters-minimum",
    JWT_REFRESH_SECRET: "test-only-secret-value-with-32-characters-minimum-refresh",
    EMAIL_VERIFICATION_JWT_SECRET: "test-only-secret-value-with-32-characters-minimum-verify",
    PASSWORD_RESET_JWT_SECRET: "test-only-secret-value-with-32-characters-minimum-reset",
    EMAIL_WEBHOOK_SECRET: "test-only-secret-value-with-32-characters-minimum-webhook",
    NOTIFICATION_SOCKET_SERVICE_TOKEN: "test-only-secret-value-with-32-characters-minimum-socket",
  });
   assert.equal(env.STRIPE_BILLING_PORTAL_GENERAL_CONFIGURATION_ID, "");
   assert.equal(env.STRIPE_BILLING_PORTAL_PAYMENT_METHOD_CONFIGURATION_ID, "");
 });

test("past-due grace rejects negative or non-integer policy values", () => {
  const secret = "test-only-secret-value-with-32-characters-minimum";
  const base = { NODE_ENV: "test", PAYMENT_PROVIDER: "fake", MONGODB_URI: "mongodb://127.0.0.1:27017/documind-test", REDIS_URL: "redis://127.0.0.1:6379/1", APP_FRONTEND_URL: "https://app.test.invalid", JWT_SECRET: secret, JWT_REFRESH_SECRET: `${secret}-refresh`, EMAIL_VERIFICATION_JWT_SECRET: `${secret}-verification`, PASSWORD_RESET_JWT_SECRET: `${secret}-reset`, EMAIL_WEBHOOK_SECRET: `${secret}-webhook`, NOTIFICATION_SOCKET_SERVICE_TOKEN: `${secret}-socket` };
  assert.throws(() => parseEnv({ ...base, BILLING_PAST_DUE_GRACE_DAYS: "-1" }), EnvironmentValidationError);
  assert.throws(() => parseEnv({ ...base, BILLING_PAST_DUE_GRACE_DAYS: "1.5" }), EnvironmentValidationError);
});
