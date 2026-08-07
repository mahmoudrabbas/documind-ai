import test from "node:test";
import assert from "node:assert/strict";
import { GroqChatAdapter } from "../groqChat.adapter.js";

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
