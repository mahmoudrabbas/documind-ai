import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getModelAdapter, setModelAdapter } from "../index.js";
import { AppError } from "../../../common/errors/AppError.js";
import { LLM_PROVIDER_UNAVAILABLE } from "../../../common/errors/errorCodes.js";

// The chain is built from process.env at first access. Each test resets the
// singleton and controls the environment directly.

const ORIGINAL_ENV = { ...process.env };

function withEnv(env: Record<string, string | undefined>): void {
  delete process.env.GROQ_API_KEY;
  delete process.env.SBG_API_KEY;
  delete process.env.SBG_BASE_URL;
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

beforeEach(() => {
  setModelAdapter(null);
});

afterEach(() => {
  setModelAdapter(null);
  process.env.NODE_ENV = ORIGINAL_ENV.NODE_ENV ?? "test";
});

test("under NODE_ENV=test with no real providers a FakeModelAdapter is used", () => {
  process.env.NODE_ENV = "test";
  withEnv({});

  assert.equal(getModelAdapter().providerKey, "fake");
});

test("outside tests with no real providers the chain throws a controlled LLM_PROVIDER_UNAVAILABLE error", () => {
  process.env.NODE_ENV = "development";
  withEnv({});

  assert.throws(
    () => getModelAdapter(),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal((err as AppError).statusCode, 503);
      assert.equal((err as AppError).code, LLM_PROVIDER_UNAVAILABLE);
      return true;
    },
  );
});

test("outside tests a single real provider returns that provider unwrapped — never a fake", () => {
  process.env.NODE_ENV = "production";
  withEnv({ GROQ_API_KEY: "test-groq-key" });

  assert.equal(getModelAdapter().providerKey, "groq");
});

test("outside tests real providers form a fallback chain that never contains the fake", () => {
  process.env.NODE_ENV = "production";
  withEnv({
    GROQ_API_KEY: "test-groq-key",
    SBG_API_KEY: "test-sbg-key",
    SBG_BASE_URL: "https://bedrock.test.invalid",
  });

  const providerKey = getModelAdapter().providerKey;
  assert.equal(providerKey, "fallback(groq,student-bedrock)");
  assert.ok(!providerKey.includes("fake"), "fake must never appear in the runtime chain");
});

test("under NODE_ENV=test real providers still win over the fake terminal", () => {
  process.env.NODE_ENV = "test";
  withEnv({ GROQ_API_KEY: "test-groq-key" });

  assert.equal(getModelAdapter().providerKey, "groq");
});
