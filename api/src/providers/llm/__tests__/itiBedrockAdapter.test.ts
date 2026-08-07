import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ItiBedrockChatAdapter } from "../itiBedrockAdapter.js";
import { FailoverModelAdapter } from "../failoverModelAdapter.js";
import type { AvailabilityProbeModelAdapter } from "../failoverModelAdapter.js";
import { mapLlmProviderError } from "../providerError.js";
import type {
  ModelCompletionMessage,
  ModelCompletionResponse,
} from "../../../modules/agents/agents.types.js";

const ORIGINAL_FETCH = globalThis.fetch;

interface RecordedCall {
  url: string;
  init?: RequestInit;
}

const calls: RecordedCall[] = [];

type FetchResult = {
  ok: boolean;
  status: number;
  headers: Headers;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
};

function result(
  body: unknown,
  init: { ok?: boolean; status?: number; headers?: Headers } = {},
): FetchResult {
  const ok = init.ok ?? true;
  const status = init.status ?? (ok ? 200 : 500);
  return {
    ok,
    status,
    headers: init.headers ?? new Headers(),
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

const CHAT_BODY = {
  id: "chat-1",
  model: "model-a",
  choices: [
    { index: 0, message: { role: "assistant", content: "Hello!" }, finish_reason: "stop" },
  ],
  usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
  created: Date.now(),
};

const MESSAGES: ModelCompletionMessage[] = [
  { role: "system", content: "sys" },
  { role: "user", content: "hi" },
];

function makeAdapter(
  overrides: Partial<ConstructorParameters<typeof ItiBedrockChatAdapter>[0]> = {},
): ItiBedrockChatAdapter {
  return new ItiBedrockChatAdapter({
    apiKey: "test-key",
    baseUrl: "https://gateway.test",
    maxRetries: 0,
    retryDelayMs: 1,
    model: "model-a",
    ...overrides,
  });
}

beforeEach(() => {
  calls.length = 0;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return result(CHAT_BODY);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

test("complete posts to <baseUrl>/chat/completions and never the legacy student route", async () => {
  const adapter = makeAdapter();
  await adapter.complete({ messages: MESSAGES, temperature: 0.2, topP: 0.9, maxTokens: 1000 });

  assert.equal(calls.length, 1);
  const chatCall = calls[0];
  assert.ok(chatCall.url.endsWith("/chat/completions"));
  assert.ok(
    !chatCall.url.includes("/api/v1/student/chat"),
    "must never use the legacy student chat route",
  );
  assert.equal(chatCall.init?.method, "POST");
  assert.equal((chatCall.init?.headers as Record<string, string>).Authorization, "Bearer test-key");
  const body = JSON.parse(String(chatCall.init?.body)) as Record<string, unknown>;
  assert.equal(body.model, "model-a");
  assert.ok(!("model_id" in body), "request must use `model`, never the legacy `model_id`");
  assert.deepEqual(body.messages, MESSAGES);
  assert.equal(body.temperature, 0.2);
  assert.equal(body.top_p, 0.9);
  assert.equal(body.max_tokens, 1000);
  assert.equal(body.stream, false);
});

test("complete defaults temperature to 0.7 and maps the OpenAI-compatible response", async () => {
  const adapter = makeAdapter();
  const response = await adapter.complete({ messages: MESSAGES });

  const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
  assert.equal(body.temperature, 0.7);

  assert.equal(response.id, "chat-1");
  assert.equal(response.provider, "iti-bedrock");
  assert.equal(response.model, "model-a");
  assert.equal(response.choices[0].index, 0);
  assert.equal(response.choices[0].message.role, "assistant");
  assert.equal(response.choices[0].message.content, "Hello!");
  assert.equal(response.choices[0].finishReason, "stop");
  assert.deepEqual(response.usage, { promptTokens: 5, completionTokens: 3, totalTokens: 8 });
  assert.equal(response.estimatedCost, 0);
});

test("complete forwards tools and tool_choice but never structuredOutput", async () => {
  const adapter = makeAdapter();
  const tools = [
    {
      type: "function",
      function: { name: "lookup_document", description: "Find a document", parameters: { type: "object" } },
    },
  ];
  await adapter.complete({
    messages: MESSAGES,
    tools,
    toolChoice: { type: "function", function: { name: "lookup_document" } },
    structuredOutput: { type: "json_object" },
  });

  const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
  assert.deepEqual(body.tools, tools);
  assert.deepEqual(body.tool_choice, { type: "function", function: { name: "lookup_document" } });
  assert.ok(!("response_format" in body), "structuredOutput must not be forwarded");
});

test("complete uses the configured model", async () => {
  const adapter = makeAdapter({ model: "openai.gpt-oss-120b-1:0" });
  await adapter.complete({ messages: MESSAGES, maxTokens: 200 });

  const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
  assert.equal(body.model, "openai.gpt-oss-120b-1:0");
});

test("model defaults to the documented ITI default when not configured", async () => {
  const adapter = new ItiBedrockChatAdapter({
    apiKey: "test-key",
    baseUrl: "https://gateway.test",
  });
  assert.equal(adapter.model, "openai.gpt-oss-120b-1:0");

  await adapter.complete({ messages: MESSAGES, maxTokens: 200 });
  const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
  assert.equal(body.model, "openai.gpt-oss-120b-1:0");
});

test("complete maps a valid gateway cost (iti.estimated_cost_usd) at the adapter boundary", async () => {
  globalThis.fetch = (async () =>
    result({ ...CHAT_BODY, iti: { estimated_cost_usd: 0.0042 } })) as unknown as typeof fetch;
  const adapter = makeAdapter();
  const response = await adapter.complete({ messages: MESSAGES });
  assert.equal(response.estimatedCost, 0.0042);
});

test("complete ignores invalid gateway cost values and keeps the safe estimate", async () => {
  for (const bad of ["0.0042", -1, Number.NaN]) {
    globalThis.fetch = (async () =>
      result({ ...CHAT_BODY, iti: { estimated_cost_usd: bad } })) as unknown as typeof fetch;
    const adapter = makeAdapter({ model: "openai.gpt-oss-120b-1:0" });
    const response = await adapter.complete({ messages: MESSAGES });
    assert.equal(
      response.estimatedCost,
      (response.usage.totalTokens / 1_000_000) * 0.5,
      `invalid cost value ${String(bad)} must fall back to the local estimate`,
    );
  }
});

test("complete throws a rate-limit error that mapLlmProviderError recognizes", async () => {
  globalThis.fetch = (async () =>
    result({}, { ok: false, status: 429, headers: new Headers({ "retry-after": "30" }) })) as unknown as typeof fetch;
  const adapter = makeAdapter({ maxRetries: 1 });

  await assert.rejects(
    adapter.complete({ messages: MESSAGES }),
    (error: unknown) => {
      const mapped = mapLlmProviderError(error);
      assert.equal(mapped.statusCode, 429);
      assert.equal(mapped.code, "LLM_RATE_LIMITED");
      assert.deepEqual(mapped.details, { retryAfterSeconds: 30 });
      return true;
    },
  );
});

test("complete retries retryable 503 responses and succeeds on the second attempt", async () => {
  let attempts = 0;
  globalThis.fetch = (async () => {
    attempts += 1;
    if (attempts === 1) return result({}, { ok: false, status: 503 });
    return result(CHAT_BODY);
  }) as unknown as typeof fetch;
  const adapter = makeAdapter({ maxRetries: 2, retryDelayMs: 1 });

  const response = await adapter.complete({ messages: MESSAGES });
  assert.equal(attempts, 2);
  assert.equal(response.choices[0].message.content, "Hello!");
});

test("complete does not retry after the caller aborts", async () => {
  let attempts = 0;
  globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
    if (init?.signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    attempts += 1;
    return result({}, { ok: false, status: 503 });
  }) as unknown as typeof fetch;
  const adapter = makeAdapter({ maxRetries: 3, retryDelayMs: 1 });

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    adapter.complete({ messages: MESSAGES, signal: controller.signal }),
    /aborted/i,
  );
  assert.equal(attempts, 0, "no request should be attempted against an aborted signal");
});

test("checkAvailability probes GET <baseUrl>/models — never the legacy student route", async () => {
  const adapter = makeAdapter();
  const availability = await adapter.checkAvailability();
  assert.equal(availability.available, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init?.method ?? "GET", "GET");
  assert.ok(calls[0].url.endsWith("/models"));
  assert.ok(
    !calls[0].url.includes("/api/v1/student/models"),
    "probe must not use the legacy StudentBedrockProvider route",
  );
});

test("checkAvailability reports unavailable on HTTP 404", async () => {
  globalThis.fetch = (async () =>
    result({}, { ok: false, status: 404 })) as unknown as typeof fetch;
  const adapter = makeAdapter();
  const availability = await adapter.checkAvailability();
  assert.equal(availability.available, false);
  assert.match(availability.reason ?? "", /404/);
});

test("checkAvailability reports unavailable on HTTP 401 / 403", async () => {
  for (const status of [401, 403]) {
    globalThis.fetch = (async () =>
      result({}, { ok: false, status })) as unknown as typeof fetch;
    const adapter = makeAdapter();
    const availability = await adapter.checkAvailability();
    assert.equal(availability.available, false, `status ${status}`);
    assert.match(availability.reason ?? "", new RegExp(String(status)));
  }
});

test("checkAvailability reports unavailable on HTTP 5xx", async () => {
  globalThis.fetch = (async () =>
    result({}, { ok: false, status: 503 })) as unknown as typeof fetch;
  const adapter = makeAdapter();
  const availability = await adapter.checkAvailability();
  assert.equal(availability.available, false);
  assert.match(availability.reason ?? "", /503/);
});

test("checkAvailability reports unavailable when the probe times out", async () => {
  globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
    if (init?.signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    return result(CHAT_BODY);
  }) as unknown as typeof fetch;
  const controller = new AbortController();
  controller.abort();
  const adapter = makeAdapter();
  const availability = await adapter.checkAvailability(controller.signal);
  assert.equal(availability.available, false);
});

test("checkAvailability reports unavailable on network failure", async () => {
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as unknown as typeof fetch;
  const adapter = makeAdapter();
  const availability = await adapter.checkAvailability();
  assert.equal(availability.available, false);
  assert.match(availability.reason ?? "", /fetch failed/i);
});

test("checkAvailability never leaks the API key in reasons or probe calls", async () => {
  const secret = "test-api-key-must-not-leak";
  const adapter = makeAdapter({ apiKey: secret });
  const scenarios = [
    { name: "network failure", status: undefined },
    { name: "HTTP 401", status: 401 },
    { name: "HTTP 403", status: 403 },
    { name: "HTTP 404", status: 404 },
    { name: "HTTP 500", status: 500 },
  ];

  for (const scenario of scenarios) {
    calls.length = 0;
    globalThis.fetch = (async () => {
      if (scenario.status === undefined) {
        throw new TypeError("fetch failed");
      }
      return result({}, { ok: false, status: scenario.status });
    }) as unknown as typeof fetch;

    const availability = await adapter.checkAvailability();
    assert.equal(availability.available, false, scenario.name);
    assert.ok(
      !(availability.reason ?? "").includes(secret),
      `${scenario.name}: reason leaked the API key`,
    );
    for (const call of calls) {
      assert.ok(
        !JSON.stringify(call).includes(secret),
        `${scenario.name}: probe call leaked the API key`,
      );
    }
  }
});

// ── Failover integration: real ItiBedrockChatAdapter + recording Groq ──────

class RecordingAdapter implements AvailabilityProbeModelAdapter {
  readonly providerKey = "groq";
  completeCalls = 0;

  async checkAvailability(): Promise<{ available: boolean; reason?: string }> {
    return { available: true };
  }

  async complete(): Promise<ModelCompletionResponse> {
    this.completeCalls += 1;
    return {
      id: "groq-1",
      provider: "groq",
      model: "groq-model",
      choices: [
        { index: 0, message: { role: "assistant", content: "ok" }, finishReason: "stop" },
      ],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      latencyMs: 1,
      estimatedCost: 0,
    };
  }
}

test("failover: ITI HTTP 200 succeeds without ever calling Groq", async () => {
  let groqHits = 0;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("api.groq.com")) groqHits += 1;
    return result(CHAT_BODY);
  }) as unknown as typeof fetch;
  const groq = new RecordingAdapter();
  const adapter = new FailoverModelAdapter([makeAdapter(), groq]);

  const response = await adapter.complete({ messages: MESSAGES });

  assert.equal(response.provider, "iti-bedrock");
  assert.equal(groq.completeCalls, 0);
  assert.equal(groqHits, 0);
});

test("failover: ITI retryable failure calls Groq exactly once", async () => {
  globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
    if ((init?.method ?? "GET") === "GET") return result(CHAT_BODY); // probe ok
    return result({}, { ok: false, status: 503 }); // completion fails
  }) as unknown as typeof fetch;
  const groq = new RecordingAdapter();
  const adapter = new FailoverModelAdapter([makeAdapter(), groq]);

  const response = await adapter.complete({ messages: MESSAGES });

  assert.equal(response.provider, "groq");
  assert.equal(groq.completeCalls, 1);
});

test("failover: ITI 400/401/403 do NOT trigger Groq", async () => {
  for (const status of [400, 401, 403]) {
    globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "GET") return result(CHAT_BODY);
      return result({}, { ok: false, status });
    }) as unknown as typeof fetch;
    const groq = new RecordingAdapter();
    const adapter = new FailoverModelAdapter([makeAdapter(), groq]);

    await assert.rejects(
      adapter.complete({ messages: MESSAGES }),
      (error: unknown) => {
        const mapped = mapLlmProviderError(error);
        assert.equal(mapped.statusCode, status, `status ${status} must be preserved`);
        return true;
      },
    );
    assert.equal(groq.completeCalls, 0, `status ${status} must not fail over`);
  }
});

test("failover: ITI 429/timeout/network/5xx may trigger Groq", async () => {
  const scenarios = [
    { name: "429 rate limit", run: () => result({}, { ok: false, status: 429 }) },
    { name: "408 timeout", run: () => result({}, { ok: false, status: 408 }) },
    { name: "500 server error", run: () => result({}, { ok: false, status: 500 }) },
    { name: "network failure", run: () => { throw new TypeError("fetch failed"); } },
  ];

  for (const scenario of scenarios) {
    globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "GET") return result(CHAT_BODY);
      return scenario.run();
    }) as unknown as typeof fetch;
    const groq = new RecordingAdapter();
    const adapter = new FailoverModelAdapter([makeAdapter(), groq]);

    const response = await adapter.complete({ messages: MESSAGES });
    assert.equal(response.provider, "groq", scenario.name);
    assert.equal(groq.completeCalls, 1, scenario.name);
  }
});
