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
