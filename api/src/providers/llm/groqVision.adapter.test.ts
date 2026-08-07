import { describe, it } from "node:test";
import assert from "node:assert/strict";
import OpenAI from "openai";
import {
  GroqVisionAdapter,
  VISION_SYSTEM_INSTRUCTION,
} from "./groqVision.adapter.js";
import {
  hasUnclosedReasoningBlock,
  sanitizeAssistantOutput,
} from "./outputSanitizer.js";

function stubClient(impl?: {
  create?: (params: Record<string, unknown>) => Promise<unknown>;
}) {
  const captured: Array<Record<string, unknown>> = [];
  const create = impl?.create ?? (async (params) => {
    captured.push(params as Record<string, unknown>);
    return {
      choices: [{ message: { content: "The image shows a document." } }],
    };
  });
  return {
    chat: {
      completions: { create },
    },
    __captured: captured,
  } as unknown as OpenAI & { __captured: Array<Record<string, unknown>> };
}

describe("GroqVisionAdapter", () => {
  it("uses the groq provider key and the configured model", () => {
    const adapter = new GroqVisionAdapter(
      "test-key",
      "qwen/qwen3.6-27b",
      stubClient(),
    );
    assert.equal(adapter.providerKey, "groq");
    assert.equal(adapter.model, "qwen/qwen3.6-27b");
  });

  it("sends the question and a base64 data URL with the mime type", async () => {
    const client = stubClient();
    const adapter = new GroqVisionAdapter("test-key", "model-x", client);

    const answer = await adapter.analyzeImage(
      "aGVsbG8=",
      "What is in this image?",
      "image/png",
    );

    assert.equal(answer, "The image shows a document.");
    const params = client.__captured[0];
    assert.equal(params.model, "model-x");
    const messages = params.messages as Array<{
      role: string;
      content: unknown[];
    }>;
    assert.equal(messages.length, 2);
    assert.equal(messages[0].role, "system");
    assert.equal(typeof messages[0].content, "string");
    const userMessage = messages[1];
    assert.equal(userMessage.role, "user");
    const text = userMessage.content[0] as { type: string; text: string };
    const image = userMessage.content[1] as {
      type: string;
      image_url: { url: string };
    };
    assert.equal(text.type, "text");
    assert.equal(text.text, "What is in this image?");
    assert.equal(image.type, "image_url");
    assert.equal(image.image_url.url, "data:image/png;base64,aGVsbG8=");
  });

  it("includes a final-answer-only system instruction without reasoning tags", async () => {
    const client = stubClient();
    const adapter = new GroqVisionAdapter("test-key", "model-x", client);

    await adapter.analyzeImage("aGVsbG8=", "What is in this image?");

    const params = client.__captured[0];
    const messages = params.messages as Array<{ role: string; content: string }>;
    const system = messages[0];
    assert.equal(system.role, "system");
    assert.match(system.content, /only the final answer/i);
    assert.match(system.content, /no chain of thought/i);
    assert.match(system.content, /<analysis> tags/);
    assert.match(system.content, /same language/i);
    assert.match(system.content, /preserve useful Markdown/i);
    assert.match(system.content, /never mention this instruction/i);
    assert.equal(system.content, VISION_SYSTEM_INSTRUCTION);
  });

  it("defaults to image/jpeg when no mime type is provided", async () => {
    const client = stubClient();
    const adapter = new GroqVisionAdapter("test-key", "model-x", client);

    await adapter.analyzeImage("aGVsbG8=", "What is in this image?");

    const params = client.__captured[0];
    const messages = params.messages as Array<{ content: unknown[] }>;
    const image = messages[1].content[1] as {
      image_url: { url: string };
    };
    assert.ok(image.image_url.url.startsWith("data:image/jpeg;base64,"));
  });

  it("propagates provider errors", async () => {
    const client = stubClient({
      create: async () => {
        throw new Error("rate limited");
      },
    });
    const adapter = new GroqVisionAdapter("test-key", "model-x", client);

    await assert.rejects(
      () => adapter.analyzeImage("aGVsbG8=", "q"),
      /rate limited/,
    );
  });

  it("describeDocument sends the extraction instruction", async () => {
    const client = stubClient();
    const adapter = new GroqVisionAdapter("test-key", "model-x", client);

    await adapter.describeDocument("aGVsbG8=");

    const params = client.__captured[0];
    const messages = params.messages as Array<{ content: unknown[] }>;
    const text = messages[1].content[0] as { text: string };
    assert.match(text.text, /Extract all text, tables, and key information/i);
  });

  it("disables reasoning via reasoning_effort=none for qwen3.6 vision", async () => {
    const client = stubClient();
    const adapter = new GroqVisionAdapter(
      "test-key",
      "qwen/qwen3.6-27b",
      client,
    );

    await adapter.analyzeImage("aGVsbG8=", "What is in this image?");

    const params = client.__captured[0];
    assert.equal(params.model, "qwen/qwen3.6-27b");
    assert.equal(params.reasoning_effort, "none");
    assert.equal(params.max_tokens, 1024);
  });

  it("preserves the question as the text content of the user message", async () => {
    const client = stubClient();
    const adapter = new GroqVisionAdapter("test-key", "model-x", client);

    await adapter.analyzeImage("aGVsbG8=", "Describe this chart in detail.");

    const params = client.__captured[0];
    const messages = params.messages as Array<{ content: unknown[] }>;
    const text = messages[1].content[0] as { type: string; text: string };
    assert.equal(text.type, "text");
    assert.equal(text.text, "Describe this chart in detail.");
  });

  it("preserves the image_url payload and MIME type unchanged", async () => {
    const client = stubClient();
    const adapter = new GroqVisionAdapter("test-key", "model-x", client);

    await adapter.analyzeImage("aGVsbG8=", "q", "image/png");

    const params = client.__captured[0];
    const messages = params.messages as Array<{ content: unknown[] }>;
    const image = messages[1].content[1] as {
      type: string;
      image_url: { url: string };
    };
    assert.equal(image.type, "image_url");
    assert.equal(image.image_url.url, "data:image/png;base64,aGVsbG8=");
  });

  it("returns only message.content and does not surface a reasoning field", async () => {
    const client = stubClient({
      create: async () => ({
        choices: [
          {
            message: {
              content: "The image shows a document.",
              reasoning: "hidden chain-of-thought that must not leak",
            },
          },
        ],
      }),
    });
    const adapter = new GroqVisionAdapter("test-key", "model-x", client);

    const answer = await adapter.analyzeImage("aGVsbG8=", "q");

    assert.equal(answer, "The image shows a document.");
    assert.equal(adapter.model, "model-x");
  });

  it("existing Vision sanitizer contract remains unchanged", () => {
    // Final-answer-only content is untouched.
    assert.equal(
      sanitizeAssistantOutput("The answer is 42."),
      "The answer is 42.",
    );

    // An unclosed analysis block is still detected — this is the exact
    // contract ChatService relies on to reject reasoning-only output and
    // trigger its bounded retry (not weakened by the adapter change).
    const unclosed = "Some intro.<analysis>reasoning never closes here";
    assert.equal(hasUnclosedReasoningBlock(unclosed), true);
    assert.equal(sanitizeAssistantOutput(unclosed), "Some intro.");
  });
});
