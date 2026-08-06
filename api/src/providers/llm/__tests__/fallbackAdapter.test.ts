import test from "node:test";
import assert from "node:assert/strict";
import { FallbackModelAdapter } from "../fallbackAdapter.js";
import type {
  ModelAdapter,
  ModelCompletionResponse,
} from "../../../modules/agents/agents.types.js";

class MockAdapter implements ModelAdapter {
  readonly providerKey: string;
  calls = 0;

  private readonly failTimes: number;

  constructor(providerKey: string, failTimes = 0) {
    this.providerKey = providerKey;
    this.failTimes = failTimes;
  }

  async complete(): Promise<ModelCompletionResponse> {
    this.calls += 1;
    if (this.failTimes < 0 || this.calls <= this.failTimes) {
      throw new Error(`mock ${this.providerKey} failure ${this.calls}`);
    }
    return {
      id: `mock-${this.providerKey}`,
      provider: this.providerKey,
      model: "mock",
      choices: [
        { index: 0, message: { role: "assistant", content: "ok" }, finishReason: "stop" },
      ],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      latencyMs: 1,
      estimatedCost: 0,
    };
  }
}

class RateLimitMockAdapter implements ModelAdapter {
  readonly providerKey: string;
  calls = 0;

  constructor(providerKey: string) {
    this.providerKey = providerKey;
  }

  async complete(): Promise<ModelCompletionResponse> {
    this.calls += 1;
    const error = new Error(`mock ${this.providerKey} rate limit`) as Error & {
      status?: number;
      headers?: Headers;
    };
    error.status = 429;
    error.headers = new Headers({ "retry-after": "120" });
    throw error;
  }
}

test("primary succeeds → returns result without falling back", async () => {
  const primary = new MockAdapter("groq");
  const secondary = new MockAdapter("bedrock");
  const adapter = new FallbackModelAdapter([primary, secondary], { maxRetries: 2, retryDelayMs: 1 });

  const response = await adapter.complete({ messages: [{ role: "user", content: "hi" }] });

  assert.equal(response.provider, "groq");
  assert.equal(primary.calls, 1);
  assert.equal(secondary.calls, 0);
});

test("primary fails once → retries and succeeds", async () => {
  const primary = new MockAdapter("groq", 1);
  const secondary = new MockAdapter("bedrock");
  const adapter = new FallbackModelAdapter([primary, secondary], { maxRetries: 2, retryDelayMs: 1 });

  const response = await adapter.complete({ messages: [{ role: "user", content: "hi" }] });

  assert.equal(response.provider, "groq");
  assert.equal(primary.calls, 2);
  assert.equal(secondary.calls, 0);
});

test("primary exhausted → falls back to secondary", async () => {
  const primary = new MockAdapter("groq", -1);
  const secondary = new MockAdapter("bedrock");
  const adapter = new FallbackModelAdapter([primary, secondary], { maxRetries: 1, retryDelayMs: 1 });

  const response = await adapter.complete({ messages: [{ role: "user", content: "hi" }] });

  assert.equal(response.provider, "bedrock");
  assert.equal(primary.calls, 2);
  assert.equal(secondary.calls, 1);
});

test("all providers fail → throws last error", async () => {
  const primary = new MockAdapter("groq", -1);
  const secondary = new MockAdapter("bedrock", -1);
  const adapter = new FallbackModelAdapter([primary, secondary], { maxRetries: 1, retryDelayMs: 1 });

  await assert.rejects(
    adapter.complete({ messages: [{ role: "user", content: "hi" }] }),
    /mock bedrock failure 2/,
  );
});

test("circuit opens after N failures → provider is skipped", async () => {
  const primary = new MockAdapter("groq", -1);
  const secondary = new MockAdapter("bedrock");
  const adapter = new FallbackModelAdapter([primary, secondary], {
    maxRetries: 1,
    retryDelayMs: 1,
    circuitBreakerThreshold: 2,
    circuitBreakerResetMs: 60_000,
  });

  await adapter.complete({ messages: [{ role: "user", content: "hi" }] });
  assert.equal(primary.calls, 2);

  await adapter.complete({ messages: [{ role: "user", content: "hi" }] });
  assert.equal(primary.calls, 2);
  assert.equal(secondary.calls, 2);
});

test("circuit resets after timeout → provider is retried (half-open)", async () => {
  const primary = new MockAdapter("groq", -1);
  const secondary = new MockAdapter("bedrock");
  const adapter = new FallbackModelAdapter([primary, secondary], {
    maxRetries: 1,
    retryDelayMs: 1,
    circuitBreakerThreshold: 2,
    circuitBreakerResetMs: 10,
  });

  await adapter.complete({ messages: [{ role: "user", content: "hi" }] });
  await adapter.complete({ messages: [{ role: "user", content: "hi" }] });
  const callsWhileOpen = primary.calls;
  assert.equal(callsWhileOpen, 2);

  await new Promise((resolve) => setTimeout(resolve, 30));

  await adapter.complete({ messages: [{ role: "user", content: "hi" }] });
  assert.ok(primary.calls > callsWhileOpen, "half-open provider should be attempted again");
});

test("providerKey reports the chain composition", () => {
  const adapter = new FallbackModelAdapter([
    new MockAdapter("groq"),
    new MockAdapter("bedrock"),
    new MockAdapter("fake"),
  ]);
  assert.equal(adapter.providerKey, "fallback(groq,bedrock,fake)");
});

test("constructor rejects an empty chain", () => {
  assert.throws(() => new FallbackModelAdapter([]), /at least one/);
});

test("rate-limited provider with a long retry-after is not retried in-request and propagates the controlled 429", async () => {
  const primary = new RateLimitMockAdapter("groq");
  const adapter = new FallbackModelAdapter([primary], { maxRetries: 3, retryDelayMs: 1 });

  await assert.rejects(
    adapter.complete({ messages: [{ role: "user", content: "hi" }] }),
    (err: unknown) => {
      const error = err as {
        statusCode?: number;
        code?: string;
        details?: { retryAfterSeconds?: number };
      };
      assert.equal(primary.calls, 1, "rate-limited provider must not be retried in-request");
      assert.equal(error.statusCode, 429);
      assert.equal(error.code, "LLM_RATE_LIMITED");
      assert.equal(error.details?.retryAfterSeconds, 120);
      return true;
    },
  );
});

test("rate-limited provider falls straight to the next real provider", async () => {
  const primary = new RateLimitMockAdapter("groq");
  const secondary = new MockAdapter("bedrock");
  const adapter = new FallbackModelAdapter([primary, secondary], { maxRetries: 3, retryDelayMs: 1 });

  const response = await adapter.complete({ messages: [{ role: "user", content: "hi" }] });

  assert.equal(response.provider, "bedrock");
  assert.equal(primary.calls, 1, "rate-limited provider must not be retried in-request");
  assert.equal(secondary.calls, 1);
});
