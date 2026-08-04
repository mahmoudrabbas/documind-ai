import test from "node:test";
import assert from "node:assert/strict";
import { GroqChatAdapter } from "./groqChat.adapter.js";
import type { ModelCompletionStreamChunk } from "../../modules/agents/agents.types.js";

test("groq adapter completeStream requests stream + usage and maps OpenAI chunks", async () => {
  const adapter = new GroqChatAdapter("sk-test", "model-x");

  const client = (adapter as unknown as {
    client: {
      chat: {
        completions: {
          create: (params: unknown, options?: unknown) => AsyncGenerator<unknown>;
        };
      };
    };
  }).client;

  let capturedParams: unknown;
  let capturedOptions: unknown;
  const signal = new AbortController().signal;

  client.chat.completions.create = (params: unknown, options?: unknown) => {
    capturedParams = params;
    capturedOptions = options;
    return (async function* () {
      yield {
        id: "chunk-1",
        model: "model-x",
        choices: [{ index: 0, delta: { role: "assistant", content: "Hel" }, finish_reason: null }],
      };
      yield {
        id: "chunk-2",
        model: "model-x",
        choices: [{ index: 0, delta: { content: "lo" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
      };
    })() as AsyncGenerator<unknown>;
  };

  const chunks: ModelCompletionStreamChunk[] = [];
  for await (const chunk of adapter.completeStream({
    messages: [{ role: "user", content: "hi" }],
    signal,
  })) {
    chunks.push(chunk);
  }

  const requestParams = capturedParams as Record<string, unknown>;
  assert.equal(requestParams.stream, true);
  const streamOptions = requestParams.stream_options as { include_usage?: boolean };
  assert.equal(streamOptions.include_usage, true);

  const options = capturedOptions as { signal?: AbortSignal };
  assert.equal(options.signal, signal);

  assert.equal(chunks.length, 2);
  assert.equal(chunks[0]?.provider, "groq");
  assert.equal(chunks[0]?.id, "chunk-1");
  assert.equal(chunks[0]?.model, "model-x");
  assert.equal(chunks[0]?.choices[0]?.delta.content, "Hel");
  assert.equal(chunks[0]?.choices[0]?.finish_reason, null);
  assert.equal(chunks[1]?.choices[0]?.delta.content, "lo");
  assert.equal(chunks[1]?.choices[0]?.finish_reason, "stop");
  assert.deepEqual(chunks[1]?.usage, { promptTokens: 5, completionTokens: 2, totalTokens: 7 });
});

test("groq adapter completeStream rethrows when create rejects", async () => {
  const adapter = new GroqChatAdapter("sk-test", "model-x");

  const client = (adapter as unknown as {
    client: {
      chat: {
        completions: {
          create: (params: unknown, options?: unknown) => unknown;
        };
      };
    };
  }).client;

  const boom = new Error("upstream create failed");
  client.chat.completions.create = async () => {
    throw boom;
  };

  await assert.rejects(
    async () => {
      for await (const _chunk of adapter.completeStream({
        messages: [{ role: "user", content: "hi" }],
      })) {
        // never reached: create() rejects before any chunk is yielded
      }
    },
    (error: unknown) => error === boom,
  );
});
