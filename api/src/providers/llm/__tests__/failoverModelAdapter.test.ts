import test from "node:test";
import assert from "node:assert/strict";
import { FailoverModelAdapter } from "../failoverModelAdapter.js";
import { mapLlmProviderError } from "../providerError.js";
import { AppError } from "../../../common/errors/AppError.js";
import { LLM_PROVIDER_UNAVAILABLE, LLM_RATE_LIMITED, LLM_TIMEOUT } from "../../../common/errors/errorCodes.js";
import type { AvailabilityProbeModelAdapter } from "../failoverModelAdapter.js";
import type {
  ModelAdapter,
  ModelCompletionResponse,
} from "../../../modules/agents/agents.types.js";

const PARAMS = { messages: [{ role: "user" as const, content: "hi" }] };

function success(provider: string): ModelCompletionResponse {
  return {
    id: `mock-${provider}`,
    provider,
    model: "mock",
    choices: [
      { index: 0, message: { role: "assistant", content: "ok" }, finishReason: "stop" },
    ],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    latencyMs: 1,
    estimatedCost: 0,
  };
}

function rateLimitError(): Error {
  const error = new Error(`rate limited`) as Error & {
    status?: number;
    headers?: Headers;
  };
  error.status = 429;
  error.headers = new Headers({ "retry-after": "120" });
  return error;
}

function httpStatusError(status: number): Error {
  const error = new Error(`HTTP ${status}`) as Error & { status?: number };
  error.status = status;
  return error;
}

class ProbeAdapter implements AvailabilityProbeModelAdapter {
  readonly providerKey: string;
  completeCalls = 0;
  probeCalls = 0;
  completeError?: unknown;
  probeResult: { available: boolean; reason?: string };

  constructor(
    providerKey: string,
    options: {
      probeResult?: { available: boolean; reason?: string };
      completeError?: unknown;
    } = {},
  ) {
    this.providerKey = providerKey;
    this.probeResult = options.probeResult ?? { available: true };
    this.completeError = options.completeError;
  }

  async checkAvailability(): Promise<{ available: boolean; reason?: string }> {
    this.probeCalls += 1;
    return this.probeResult;
  }

  async complete(): Promise<ModelCompletionResponse> {
    this.completeCalls += 1;
    if (this.completeError !== undefined) {
      throw this.completeError;
    }
    return success(this.providerKey);
  }
}

class ThrowingProbeAdapter extends ProbeAdapter {
  probeError: unknown;

  constructor(providerKey: string, probeError: unknown) {
    super(providerKey, { probeResult: { available: true } });
    this.probeError = probeError;
  }

  async checkAvailability(): Promise<{ available: boolean; reason?: string }> {
    this.probeCalls += 1;
    throw this.probeError;
  }
}

class PlainAdapter implements ModelAdapter {
  readonly providerKey: string;
  completeCalls = 0;
  fail: boolean;

  constructor(providerKey: string, fail = false) {
    this.providerKey = providerKey;
    this.fail = fail;
  }

  async complete(): Promise<ModelCompletionResponse> {
    this.completeCalls += 1;
    if (this.fail) {
      throw new Error(`mock ${this.providerKey} failure`);
    }
    return success(this.providerKey);
  }
}

test("primary probe ok → primary is used and fallback is untouched", async () => {
  const primary = new ProbeAdapter("groq");
  const fallback = new ProbeAdapter("iti-bedrock");
  const adapter = new FailoverModelAdapter([primary, fallback]);

  const response = await adapter.complete(PARAMS);

  assert.equal(response.provider, "groq");
  assert.equal(primary.completeCalls, 1);
  assert.equal(primary.probeCalls, 1);
  assert.equal(fallback.completeCalls, 0);
  assert.equal(fallback.probeCalls, 0);
});

test("primary probe down → skipped entirely, fallback is used", async () => {
  const primary = new ProbeAdapter("groq", { probeResult: { available: false, reason: "gateway down" } });
  const fallback = new ProbeAdapter("iti-bedrock");
  const adapter = new FailoverModelAdapter([primary, fallback]);

  const response = await adapter.complete(PARAMS);

  assert.equal(response.provider, "iti-bedrock");
  assert.equal(primary.completeCalls, 0, "downed provider must not even be attempted");
  assert.equal(primary.probeCalls, 1);
  assert.equal(fallback.completeCalls, 1);
});

test("downed provider result is cached within the TTL window", async () => {
  const primary = new ProbeAdapter("groq", { probeResult: { available: false } });
  const fallback = new ProbeAdapter("iti-bedrock");
  const adapter = new FailoverModelAdapter([primary, fallback], { probeTtlMs: 60_000 });

  await adapter.complete(PARAMS);
  await adapter.complete(PARAMS);

  assert.equal(primary.probeCalls, 1, "probe must be cached within the TTL window");
  assert.equal(primary.completeCalls, 0);
  assert.equal(fallback.completeCalls, 2);
});

test("probe cache expires → provider is probed again", async () => {
  const primary = new ProbeAdapter("groq", { probeResult: { available: false } });
  const fallback = new ProbeAdapter("iti-bedrock");
  const adapter = new FailoverModelAdapter([primary, fallback], { probeTtlMs: 1 });

  await adapter.complete(PARAMS);
  await new Promise((resolve) => setTimeout(resolve, 5));
  await adapter.complete(PARAMS);

  assert.ok(primary.probeCalls >= 2, "expired cache must trigger a fresh probe");
});

test("primary completion failure (unavailable) → fallback used and primary marked down", async () => {
  const primary = new ProbeAdapter("groq", {
    completeError: new AppError(503, LLM_PROVIDER_UNAVAILABLE, "boom"),
  });
  const fallback = new ProbeAdapter("iti-bedrock");
  const adapter = new FailoverModelAdapter([primary, fallback], { probeTtlMs: 60_000 });

  const response = await adapter.complete(PARAMS);
  assert.equal(response.provider, "iti-bedrock");

  await adapter.complete(PARAMS);
  assert.equal(primary.completeCalls, 1, "marked-down primary must be skipped on the next request");
  assert.equal(primary.probeCalls, 1);
});

test("primary timeout → fallback used", async () => {
  const primary = new ProbeAdapter("groq", {
    completeError: new AppError(503, LLM_TIMEOUT, "timed out"),
  });
  const fallback = new ProbeAdapter("iti-bedrock");
  const adapter = new FailoverModelAdapter([primary, fallback]);

  const response = await adapter.complete(PARAMS);
  assert.equal(response.provider, "iti-bedrock");
  assert.equal(fallback.completeCalls, 1);
});

test("rate-limited primary is NOT marked down and still fails over", async () => {
  const primary = new ProbeAdapter("groq", { completeError: rateLimitError() });
  const fallback = new ProbeAdapter("iti-bedrock");
  const adapter = new FailoverModelAdapter([primary, fallback], { probeTtlMs: 60_000 });

  const response = await adapter.complete(PARAMS);
  assert.equal(response.provider, "iti-bedrock");

  await adapter.complete(PARAMS);
  assert.ok(primary.completeCalls >= 2, "rate-limited provider must not be skipped on the next request");
});

test("client 4xx completion errors do NOT fail over (400/401/403)", async () => {
  for (const status of [400, 401, 403]) {
    const primary = new ProbeAdapter("groq", { completeError: httpStatusError(status) });
    const fallback = new ProbeAdapter("iti-bedrock");
    const adapter = new FailoverModelAdapter([primary, fallback]);

    await assert.rejects(
      adapter.complete(PARAMS),
      (error: unknown) => {
        const mapped = mapLlmProviderError(error);
        assert.equal(mapped.statusCode, status, `status ${status} must be preserved`);
        return true;
      },
    );
    assert.equal(fallback.completeCalls, 0, `status ${status} must not fail over`);
  }
});

test("client 4xx errors do not mark the provider down", async () => {
  const primary = new ProbeAdapter("groq", { completeError: httpStatusError(400) });
  const fallback = new ProbeAdapter("iti-bedrock");
  const adapter = new FailoverModelAdapter([primary, fallback], { probeTtlMs: 60_000 });

  await assert.rejects(adapter.complete(PARAMS));
  await assert.rejects(adapter.complete(PARAMS));

  assert.equal(primary.completeCalls, 2, "client-error provider must be attempted again on the next request");
  assert.equal(fallback.completeCalls, 0);
});

test("5xx and network failures still fail over", async () => {
  for (const error of [httpStatusError(500), new TypeError("fetch failed")]) {
    const primary = new ProbeAdapter("groq", { completeError: error });
    const fallback = new ProbeAdapter("iti-bedrock");
    const adapter = new FailoverModelAdapter([primary, fallback]);

    const response = await adapter.complete(PARAMS);
    assert.equal(response.provider, "iti-bedrock");
    assert.equal(fallback.completeCalls, 1);
  }
});

test("unexpected non-LLM AppErrors are rethrown, not failed over", async () => {
  const primary = new ProbeAdapter("groq", {
    completeError: new AppError(400, "SOME_OTHER_CODE", "client contract error"),
  });
  const fallback = new ProbeAdapter("iti-bedrock");
  const adapter = new FailoverModelAdapter([primary, fallback]);

  await assert.rejects(adapter.complete(PARAMS), /client contract error/);
  assert.equal(fallback.completeCalls, 0);
});

test("all providers fail → last mapped error is thrown", async () => {
  const primary = new ProbeAdapter("groq", { completeError: rateLimitError() });
  const fallback = new ProbeAdapter("iti-bedrock", {
    completeError: new AppError(503, LLM_PROVIDER_UNAVAILABLE, "down"),
  });
  const adapter = new FailoverModelAdapter([primary, fallback]);

  await assert.rejects(
    adapter.complete(PARAMS),
    (error: unknown) => {
      const mapped = mapLlmProviderError(error);
      assert.equal(mapped.code, LLM_PROVIDER_UNAVAILABLE);
      assert.equal(mapped.message, "down");
      return true;
    },
  );
});

test("probe that throws is treated as unavailable and skipped", async () => {
  const primary = new ThrowingProbeAdapter("groq", new TypeError("fetch failed"));
  const fallback = new ProbeAdapter("iti-bedrock");
  const adapter = new FailoverModelAdapter([primary, fallback]);

  const response = await adapter.complete(PARAMS);
  assert.equal(response.provider, "iti-bedrock");
  assert.equal(primary.completeCalls, 0);
});

test("non-probe adapters are always attempted", async () => {
  const primary = new PlainAdapter("plain-primary", true);
  const fallback = new ProbeAdapter("iti-bedrock");
  const adapter = new FailoverModelAdapter([primary, fallback]);

  const response = await adapter.complete(PARAMS);
  assert.equal(response.provider, "iti-bedrock");
  assert.equal(primary.completeCalls, 1, "plain adapters have no probe; they are attempted");
});

test("caller cancellation does not trigger failover", async () => {
  const primary = new ProbeAdapter("groq", {
    completeError: new Error("The operation was aborted."),
  });
  const fallback = new ProbeAdapter("iti-bedrock");
  const adapter = new FailoverModelAdapter([primary, fallback]);

  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    adapter.complete({ ...PARAMS, signal: controller.signal }),
    /aborted/i,
  );
  assert.equal(fallback.completeCalls, 0, "no failover after the caller aborted");
});

test("providerKey reports the failover composition", () => {
  const adapter = new FailoverModelAdapter([
    new ProbeAdapter("groq"),
    new ProbeAdapter("iti-bedrock"),
  ]);
  assert.equal(adapter.providerKey, "failover(groq,iti-bedrock)");
});

test("constructor rejects an empty chain", () => {
  assert.throws(() => new FailoverModelAdapter([]), /at least one/);
});

test("rate-limited primary alone propagates the controlled 429", async () => {
  const primary = new ProbeAdapter("groq", { completeError: rateLimitError() });
  const adapter = new FailoverModelAdapter([primary]);

  await assert.rejects(
    adapter.complete(PARAMS),
    (error: unknown) => {
      const mapped = mapLlmProviderError(error);
      assert.equal(mapped.statusCode, 429);
      assert.equal(mapped.code, LLM_RATE_LIMITED);
      assert.deepEqual(mapped.details, { retryAfterSeconds: 120 });
      return true;
    },
  );
});
