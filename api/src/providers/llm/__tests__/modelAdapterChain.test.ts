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
  delete process.env.ITI_BEDROCK_BASE_URL;
  delete process.env.ITI_BEDROCK_MODEL;
  delete process.env.LLM_PRIMARY_PROVIDER;
  delete process.env.LLM_FALLBACK_PROVIDER;
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

test("LLM_PRIMARY_PROVIDER=groq returns the single provider unwrapped", () => {
  process.env.NODE_ENV = "production";
  withEnv({
    LLM_PRIMARY_PROVIDER: "groq",
    GROQ_API_KEY: "test-groq-key",
  });

  assert.equal(getModelAdapter().providerKey, "groq");
});

test("LLM_PRIMARY_PROVIDER + LLM_FALLBACK_PROVIDER build a failover chain", () => {
  process.env.NODE_ENV = "production";
  withEnv({
    LLM_PRIMARY_PROVIDER: "groq",
    LLM_FALLBACK_PROVIDER: "iti-bedrock",
    GROQ_API_KEY: "test-groq-key",
    SBG_API_KEY: "test-sbg-key",
    ITI_BEDROCK_BASE_URL: "http://host.docker.internal:8787/v1",
  });

  assert.equal(getModelAdapter().providerKey, "failover(groq,iti-bedrock)");
  assert.ok(!getModelAdapter().providerKey.includes("fake"));
});

test("iti-bedrock + SBG_API_KEY + ITI_BEDROCK_BASE_URL builds the dedicated ItiBedrockAdapter", () => {
  process.env.NODE_ENV = "production";
  withEnv({
    LLM_PRIMARY_PROVIDER: "iti-bedrock",
    SBG_API_KEY: "test-sbg-key",
    ITI_BEDROCK_BASE_URL: "http://host.docker.internal:8787/v1",
    ITI_BEDROCK_MODEL: "openai.gpt-oss-120b-1:0",
  });

  const adapter = getModelAdapter();
  assert.equal(adapter.providerKey, "iti-bedrock");
});

test("iti-bedrock does not require SBG_BASE_URL", () => {
  process.env.NODE_ENV = "production";
  withEnv({
    LLM_PRIMARY_PROVIDER: "iti-bedrock",
    SBG_API_KEY: "test-sbg-key",
    ITI_BEDROCK_BASE_URL: "http://host.docker.internal:8787/v1",
  });

  assert.equal(getModelAdapter().providerKey, "iti-bedrock");
});

test("LLM_PRIMARY_PROVIDER=iti-bedrock + LLM_FALLBACK_PROVIDER=groq builds ITI primary with Groq fallback", () => {
  process.env.NODE_ENV = "production";
  withEnv({
    LLM_PRIMARY_PROVIDER: "iti-bedrock",
    LLM_FALLBACK_PROVIDER: "groq",
    SBG_API_KEY: "test-sbg-key",
    ITI_BEDROCK_BASE_URL: "http://host.docker.internal:8787/v1",
    GROQ_API_KEY: "test-groq-key",
  });

  assert.equal(getModelAdapter().providerKey, "failover(iti-bedrock,groq)");
});

test("iti-bedrock without SBG_API_KEY fails safely outside tests", () => {
  process.env.NODE_ENV = "production";
  withEnv({
    LLM_PRIMARY_PROVIDER: "iti-bedrock",
    ITI_BEDROCK_BASE_URL: "http://host.docker.internal:8787/v1",
  });

  assert.throws(
    () => getModelAdapter(),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal((err as AppError).statusCode, 503);
      assert.equal((err as AppError).code, LLM_PROVIDER_UNAVAILABLE);
      assert.match((err as AppError).message, /SBG_API_KEY/);
      return true;
    },
  );
});

test("iti-bedrock without ITI_BEDROCK_BASE_URL fails safely outside tests", () => {
  process.env.NODE_ENV = "production";
  withEnv({
    LLM_PRIMARY_PROVIDER: "iti-bedrock",
    SBG_API_KEY: "test-sbg-key",
  });

  assert.throws(
    () => getModelAdapter(),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal((err as AppError).code, LLM_PROVIDER_UNAVAILABLE);
      assert.match((err as AppError).message, /ITI_BEDROCK_BASE_URL/);
      return true;
    },
  );
});

test("under NODE_ENV=test iti-bedrock without SBG_API_KEY degrades to the fake terminal", () => {
  process.env.NODE_ENV = "test";
  withEnv({
    LLM_PRIMARY_PROVIDER: "iti-bedrock",
    ITI_BEDROCK_BASE_URL: "http://host.docker.internal:8787/v1",
  });

  assert.equal(getModelAdapter().providerKey, "fake");
});

test("unknown LLM_PRIMARY_PROVIDER throws a controlled configuration error", () => {
  process.env.NODE_ENV = "production";
  withEnv({ LLM_PRIMARY_PROVIDER: "openai" });

  assert.throws(
    () => getModelAdapter(),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal((err as AppError).code, LLM_PROVIDER_UNAVAILABLE);
      assert.match((err as AppError).message, /LLM_PRIMARY_PROVIDER/);
      return true;
    },
  );
});

test("LLM_FALLBACK_PROVIDER equal to the primary throws a controlled error", () => {
  process.env.NODE_ENV = "production";
  withEnv({
    LLM_PRIMARY_PROVIDER: "groq",
    LLM_FALLBACK_PROVIDER: "groq",
    GROQ_API_KEY: "test-groq-key",
  });

  assert.throws(
    () => getModelAdapter(),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal((err as AppError).code, LLM_PROVIDER_UNAVAILABLE);
      assert.match((err as AppError).message, /must differ/);
      return true;
    },
  );
});

test("missing credentials for the selected provider throws outside tests", () => {
  process.env.NODE_ENV = "production";
  withEnv({ LLM_PRIMARY_PROVIDER: "groq" });

  assert.throws(
    () => getModelAdapter(),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal((err as AppError).code, LLM_PROVIDER_UNAVAILABLE);
      assert.match((err as AppError).message, /GROQ_API_KEY/);
      return true;
    },
  );
});

test("under NODE_ENV=test a missing credential degrades to the fake terminal", () => {
  process.env.NODE_ENV = "test";
  withEnv({ LLM_PRIMARY_PROVIDER: "groq" });

  assert.equal(getModelAdapter().providerKey, "fake");
});

test("LLM_FALLBACK_PROVIDER=none keeps a single unwrapped primary", () => {
  process.env.NODE_ENV = "production";
  withEnv({
    LLM_PRIMARY_PROVIDER: "groq",
    LLM_FALLBACK_PROVIDER: "none",
    GROQ_API_KEY: "test-groq-key",
  });

  assert.equal(getModelAdapter().providerKey, "groq");
});

test("legacy env still drives the FallbackModelAdapter when LLM_PRIMARY_PROVIDER is empty", () => {
  process.env.NODE_ENV = "production";
  withEnv({
    GROQ_API_KEY: "test-groq-key",
    SBG_API_KEY: "test-sbg-key",
    SBG_BASE_URL: "https://bedrock.test.invalid",
  });

  assert.equal(getModelAdapter().providerKey, "fallback(groq,student-bedrock)");
});

test("legacy StudentBedrock embedding provider is untouched (SBG-only legacy chain)", () => {
  process.env.NODE_ENV = "production";
  withEnv({
    SBG_API_KEY: "test-sbg-key",
    SBG_BASE_URL: "https://bedrock.test.invalid",
  });

  assert.equal(getModelAdapter().providerKey, "student-bedrock");
});
