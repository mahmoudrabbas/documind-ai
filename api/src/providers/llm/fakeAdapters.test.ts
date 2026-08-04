import test from "node:test";
import assert from "node:assert/strict";
import { FakeModelAdapter } from "./fakeAdapters.js";

const adapter = new FakeModelAdapter();

test("fake adapter truncates generation to the maxTokens budget", async () => {
  const response = await adapter.complete({
    messages: [
      {
        role: "system",
        content: "intent detection QueryPlan",
      },
      { role: "user", content: "Summarize the whole company handbook" },
    ],
    maxTokens: 128,
  });

  const content = response.choices[0].message.content;
  assert.equal(response.choices[0].finishReason, "length");
  assert.ok(content.length <= 128 * 4, `expected <= ${128 * 4} chars, got ${content.length}`);
});

test("fake adapter does not truncate when maxTokens is not set", async () => {
  const response = await adapter.complete({
    messages: [
      {
        role: "system",
        content: "intent detection QueryPlan",
      },
      { role: "user", content: "What is the company handbook about?" },
    ],
  });

  assert.equal(response.choices[0].finishReason, "stop");
  assert.ok(response.choices[0].message.content.length > 0);
});

test("fake adapter completeStream joins deltas equal to complete() content and final chunk carries usage + finish_reason", async () => {
  const params = { messages: [{ role: "user", content: "hello" }] };
  const response = await adapter.complete(params);
  const expectedContent = response.choices[0].message.content;
  const expectedUsage = response.usage;

  let joined = "";
  let sawFinalChunk = false;
  let finalUsage: unknown;
  let finalFinishReason: string | null | undefined;

  for await (const chunk of adapter.completeStream(params)) {
    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (delta) {
      joined += delta;
    }
    if (chunk.usage) {
      sawFinalChunk = true;
      finalUsage = chunk.usage;
      finalFinishReason = chunk.choices[0]?.finish_reason;
    }
  }

  assert.equal(sawFinalChunk, true, "completeStream must yield a final chunk carrying usage");
  assert.equal(joined, expectedContent);
  assert.deepEqual(finalUsage, expectedUsage);
  assert.equal(finalFinishReason, response.choices[0].finishReason);
});
