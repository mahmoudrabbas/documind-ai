import test from "node:test";
import assert from "node:assert/strict";
import { NvidiaNimChatAdapter } from "./nvidiaNimChat.adapter.js";

const messages = [{ role: "user" as const, content: "Return JSON." }];

test("NVIDIA NIM builds an OpenAI-compatible request without native JSON mode", () => {
  const adapter = new NvidiaNimChatAdapter({
    apiKey: "test-key",
    model: "meta/llama-3.3-70b-instruct",
  });

  const params = adapter.buildRequestParams({
    messages,
    maxTokens: 512,
    structuredOutput: { type: "json_object" },
  });

  assert.equal(params.model, "meta/llama-3.3-70b-instruct");
  assert.equal(params.max_tokens, 512);
  assert.equal(params.response_format, undefined);
  assert.deepEqual(params.messages, messages);
});

test("NVIDIA NIM exposes its provider and model identity", () => {
  const adapter = new NvidiaNimChatAdapter({
    apiKey: "test-key",
    model: "qwen/qwen3-32b",
  });

  assert.equal(adapter.providerKey, "nvidia-nim");
  assert.equal(adapter.model, "qwen/qwen3-32b");
  assert.equal(adapter.runtimeIdentity?.provider, "nvidia-nim");
});

test("NVIDIA NIM keeps a bounded completion timeout", () => {
  const adapter = new NvidiaNimChatAdapter({
    apiKey: "test-key",
    model: "openai/gpt-oss-120b",
    timeoutMs: 7_500,
  });

  assert.equal(adapter.timeoutMs, 7_500);
});

test("NVIDIA NIM aborts a completion that exceeds its timeout", async () => {
  const adapter = new NvidiaNimChatAdapter({
    apiKey: "test-key",
    model: "openai/gpt-oss-120b",
    timeoutMs: 10,
  });
  (adapter as unknown as { client: unknown }).client = {
    chat: {
      completions: {
        create: async (_params: unknown, options?: { signal?: AbortSignal }) =>
          await new Promise((_resolve, reject) => {
            options?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("The operation was aborted.", "AbortError")),
              { once: true },
            );
          }),
      },
    },
  };

  const keepAlive = setTimeout(() => undefined, 100);
  try {
    await assert.rejects(
      adapter.complete({ messages, maxTokens: 512 }),
      (error: unknown) => error instanceof DOMException && error.name === "AbortError",
    );
  } finally {
    clearTimeout(keepAlive);
  }
});

test("NVIDIA NIM maps an OpenAI-compatible completion to the shared response", async () => {
  const adapter = new NvidiaNimChatAdapter({
    apiKey: "test-key",
    model: "meta/llama-3.3-70b-instruct",
  });
  (adapter as unknown as { client: unknown }).client = {
    chat: {
      completions: {
        create: async () => ({
          id: "chatcmpl-nvidia-1",
          model: "meta/llama-3.3-70b-instruct",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "{\"verified\":true}" },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
        }),
      },
    },
  };

  const response = await adapter.complete({
    messages,
    maxTokens: 512,
    structuredOutput: { type: "json_object" },
  });

  assert.equal(response.provider, "nvidia-nim");
  assert.equal(response.model, "meta/llama-3.3-70b-instruct");
  assert.equal(response.choices[0]?.message.content, '{"verified":true}');
  assert.equal(response.usage.totalTokens, 20);
});

test("NVIDIA NIM availability probe uses the configured base URL without exposing the key", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let authorization = "";
  globalThis.fetch = (async (input, init) => {
    requestedUrl = String(input);
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    return new Response(null, { status: 200 });
  }) as typeof fetch;

  try {
    const adapter = new NvidiaNimChatAdapter({
      apiKey: "test-key",
      baseUrl: "https://nvidia.test.invalid/v1/",
      model: "meta/llama-3.3-70b-instruct",
    });

    const availability = await adapter.checkAvailability();
    assert.equal(availability.available, true);
    assert.equal(availability.reason, undefined);
    assert.equal(requestedUrl, "https://nvidia.test.invalid/v1/models");
    assert.equal(authorization, "Bearer test-key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("NVIDIA NIM bounds thinking with a reasoning effort by default", () => {
  const adapter = new NvidiaNimChatAdapter({ apiKey: "test-key" });

  assert.equal(adapter.reasoningEffort, "low");
  assert.equal(
    adapter.buildRequestParams({ messages, maxTokens: 512 }).reasoning_effort,
    "low",
  );
});

test("NVIDIA NIM honours a configured reasoning effort", () => {
  const adapter = new NvidiaNimChatAdapter({
    apiKey: "test-key",
    reasoningEffort: "HIGH ",
  });

  assert.equal(adapter.reasoningEffort, "high");
  assert.equal(
    adapter.buildRequestParams({ messages, maxTokens: 512 }).reasoning_effort,
    "high",
  );
});

// The gateway answers 400 for a parameter a model does not implement, which
// would take the whole provider down. Anything outside the supported set - the
// documented "default", an empty value, or a typo - omits it instead.
for (const value of ["default", "", "   ", "medium-ish"]) {
  test(`NVIDIA NIM omits reasoning effort for ${JSON.stringify(value)}`, () => {
    const adapter = new NvidiaNimChatAdapter({
      apiKey: "test-key",
      reasoningEffort: value,
    });

    assert.equal(adapter.reasoningEffort, null);
    assert.equal(
      "reasoning_effort" in adapter.buildRequestParams({ messages, maxTokens: 512 }),
      false,
    );
  });
}

// The endpoint's queue latency does not track token count: a 815-token
// completion measured 100s against 69s for a 2558-token one. A default inside
// that spread aborts healthy requests and reads downstream as an outage.
test("NVIDIA NIM defaults its timeout above the measured queue latency", () => {
  const adapter = new NvidiaNimChatAdapter({ apiKey: "test-key" });

  assert.ok(
    adapter.timeoutMs >= 120_000,
    `expected the default timeout to clear 120s, got ${adapter.timeoutMs}`,
  );
});
