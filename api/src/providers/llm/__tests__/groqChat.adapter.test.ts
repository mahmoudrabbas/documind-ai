import test from "node:test";
import assert from "node:assert/strict";
import { GroqChatAdapter } from "../groqChat.adapter.js";
import { LLM_RATE_LIMITED } from "../../../common/errors/errorCodes.js";

const MESSAGES = [{ role: "user" as const, content: "Hello" }];

function installStubClient(
  adapter: GroqChatAdapter,
  impl: () => Promise<unknown>,
): { calls: () => number } {
  let callCount = 0;
  (adapter as unknown as { client: unknown }).client = {
    chat: {
      completions: {
        create: async () => {
          callCount += 1;
          return impl();
        },
      },
    },
  };
  return { calls: () => callCount };
}

const successResponse = {
  id: "chatcmpl-1",
  model: "llama-3.3-70b-versatile",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "Hi" },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};

function rateLimitError(retryAfterSeconds = 60) {
  return {
    status: 429,
    code: "rate_limit_exceeded",
    headers: new Headers({ "retry-after": String(retryAfterSeconds) }),
  };
}

test("structuredOutput json_object maps to native Groq response_format json_object", () => {
  const adapter = new GroqChatAdapter("test-key", "llama-3.3-70b-versatile");

  const params = adapter.buildRequestParams({
    messages: [{ role: "system", content: "Return JSON ONLY." }, { role: "user", content: "Question?" }],
    temperature: 0.3,
    maxTokens: 512,
    structuredOutput: { type: "json_object" },
  });

  assert.deepEqual(params.response_format, { type: "json_object" });
  assert.equal(params.model, "llama-3.3-70b-versatile");
  assert.equal(params.messages.length, 2);
  assert.equal(params.temperature, 0.3);
  assert.equal(params.max_tokens, 512);
});

test("no structuredOutput leaves the provider request free-form (backward compatible)", () => {
  const adapter = new GroqChatAdapter("test-key", "llama-3.3-70b-versatile");

  const params = adapter.buildRequestParams({
    messages: [{ role: "user", content: "Hello" }],
  });

  assert.equal(params.response_format, undefined);
});

test("structuredOutput is orthogonal to tool requests", () => {
  const adapter = new GroqChatAdapter("test-key", "llama-3.3-70b-versatile");

  const params = adapter.buildRequestParams({
    messages: [{ role: "user", content: "Call a tool" }],
    tools: [{ type: "function", function: { name: "echo", description: "echo", parameters: { type: "object", properties: {} } } }],
    toolChoice: "required",
    structuredOutput: { type: "json_object" },
  });

  assert.deepEqual(params.response_format, { type: "json_object" });
  assert.ok(Array.isArray(params.tools));
  assert.equal(params.tool_choice, "required");
});

test("after a 429, subsequent completions are short-circuited without calling the provider", async () => {
  const adapter = new GroqChatAdapter("test-key", "llama-3.3-70b-versatile");
  const stub = installStubClient(adapter, () => {
    throw rateLimitError(60);
  });

  const first = await adapter.complete({ messages: MESSAGES }).then(
    () => null,
    (error: unknown) => error,
  );
  assert.ok(first !== null, "rate-limited completion must reject");

  const second = await adapter.complete({ messages: MESSAGES }).then(
    () => null,
    (error: unknown) => error,
  );
  assert.ok(second instanceof Error);
  assert.equal((second as { code?: string }).code, LLM_RATE_LIMITED);
  assert.equal(stub.calls(), 1, "provider must not be called again during the cooldown window");
});

test("a successful completion clears a stale cooldown and reaches the provider", async () => {
  const adapter = new GroqChatAdapter("test-key", "llama-3.3-70b-versatile");

  (adapter as unknown as { rateLimitedUntil: number | null }).rateLimitedUntil =
    Date.now() - 1;
  (adapter as unknown as { rateLimitRetryAfterSeconds: number | null }).rateLimitRetryAfterSeconds =
    1;

  const stub = installStubClient(adapter, async () => successResponse);
  const response = await adapter.complete({ messages: MESSAGES });
  assert.equal(response.choices[0].message.content, "Hi");
  assert.equal(stub.calls(), 1);
  assert.equal(
    (adapter as unknown as { rateLimitedUntil: number | null }).rateLimitedUntil,
    null,
    "cooldown must be cleared after a successful completion",
  );
});

