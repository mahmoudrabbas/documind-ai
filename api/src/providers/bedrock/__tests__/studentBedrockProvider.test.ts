import { describe, test, expect, beforeEach, vi } from "vitest";
import { StudentBedrockProvider, createStudentBedrockProvider } from "../studentBedrockProvider.js";
import type { EmbeddingInput } from "../../embedding/embeddingProvider.port.js";
import type { ModelCompletionMessage } from "../../../modules/agents/agents.types.js";

vi.mock("node:fetch", () => ({
  default: vi.fn(),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const defaultModelsResponse = {
  ok: true,
  json: async () => ({ data: [{ model_id: "embed-model-1", is_active: true }, { model_id: "model-1", is_active: true }] }),
};

const defaultEmbedResponse = {
  ok: true,
  json: async () => ({
    data: [{ embedding: [0.1, 0.2, 0.3], index: 0, object: "embedding" }],
    model: "embed-model-1",
    usage: { prompt_tokens: 10, total_tokens: 10 },
  }),
};

const defaultChatResponse = {
  ok: true,
  json: async () => ({
    id: "chat-1",
    model: "model-1",
    choices: [{ index: 0, message: { role: "assistant", content: "Hello!" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
    created: Date.now(),
  }),
};

function setupDefaultMocks(): void {
  mockFetch.mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/models")) {
      return Promise.resolve(defaultModelsResponse);
    }
    if (typeof url === "string" && url.includes("/embed")) {
      return Promise.resolve(defaultEmbedResponse);
    }
    if (typeof url === "string" && url.includes("/chat")) {
      return Promise.resolve(defaultChatResponse);
    }
    return Promise.resolve(defaultModelsResponse);
  });
}

describe("StudentBedrockProvider", () => {
  let provider: StudentBedrockProvider;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.SBG_API_KEY = "test-api-key";
    process.env.SBG_BASE_URL = "https://api.test.com";
    process.env.BEDROCK_CHAT_MODELS = "model-1,model-2";
    process.env.BEDROCK_FAST_CHAT_MODELS = "fast-model-1";
    process.env.BEDROCK_EMBEDDING_MODELS = "embed-model-1,embed-model-2";
    process.env.BEDROCK_IMAGE_MODEL = "image-model-1";
    process.env.BEDROCK_AUDIO_MODEL = "audio-model-1";

    setupDefaultMocks();
    provider = createStudentBedrockProvider();
  });

  test("should have correct provider metadata", () => {
    expect(provider.name).toBe("student-bedrock");
    expect(provider.providerKey).toBe("student-bedrock");
    expect(provider.model).toBe("model-1");
    expect(provider.dimensions).toBe(1024);
  });

  test("should return current chat model", () => {
    expect(provider.getChatModel()).toBe("model-1");
  });

  test("should return current embedding model", () => {
    expect(provider.getEmbeddingModel()).toBe("embed-model-1");
  });

  test("should throw on missing API key", () => {
    delete process.env.SBG_API_KEY;
    expect(() => createStudentBedrockProvider()).toThrow("SBG_API_KEY environment variable is required");
  });

  test("should throw on missing base URL", () => {
    delete process.env.SBG_BASE_URL;
    expect(() => createStudentBedrockProvider()).toThrow("SBG_BASE_URL environment variable is required");
  });

  test("should embed batch successfully using texts field", async () => {
    const inputs: EmbeddingInput[] = [
      { chunkId: "chunk-1", text: "test text", idempotencyKey: "key-1" },
    ];

    const results = await provider.embedBatch(inputs);

    expect(results).toHaveLength(1);
    expect(results[0].chunkId).toBe("chunk-1");
    expect(results[0].vector).toEqual([0.1, 0.2, 0.3]);
    expect(results[0].tokenUsage).toBe(10);
    expect(results[0].modelVersion).toBe("embed-model-1");

    const embedCall = mockFetch.mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && call[0].includes("/embed")
    );
    expect(embedCall).toBeDefined();
    const callArgs = (embedCall as unknown[])[1] as { body: string };
    const requestBody = JSON.parse(callArgs.body);
    expect(requestBody).toHaveProperty("texts", ["test text"]);
    expect(requestBody).not.toHaveProperty("input");
  });

  test("should complete chat successfully", async () => {
    const params: ModelCompletionMessage[] = [
      { role: "user", content: "Hello" },
    ];

    const response = await provider.complete({ messages: params });

    expect(response.id).toBe("chat-1");
    expect(response.provider).toBe("student-bedrock");
    expect(response.model).toBe("model-1");
    expect(response.choices[0].message.content).toBe("Hello!");
    expect(response.usage.totalTokens).toBe(8);
  });

  test("should handle auth error", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/models")) {
        return Promise.resolve(defaultModelsResponse);
      }
      return Promise.resolve({
        ok: false,
        status: 401,
        text: async () => "Invalid API key",
      });
    });

    await expect(provider.embedBatch([
      { chunkId: "chunk-1", text: "test", idempotencyKey: "key-1" },
    ])).rejects.toThrow();
  });

  test("should handle rate limit error", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/models")) {
        return Promise.resolve(defaultModelsResponse);
      }
      return Promise.resolve({
        ok: false,
        status: 429,
        text: async () => "Rate limited",
        headers: new Map(),
      });
    });

    await expect(provider.embedBatch([
      { chunkId: "chunk-1", text: "test", idempotencyKey: "key-1" },
    ])).rejects.toThrow();
  });

  test("should retry on timeout", async () => {
    let callCount = 0;
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/models")) {
        return Promise.resolve(defaultModelsResponse);
      }
      callCount++;
      if (callCount < 3) {
        return Promise.reject(new Error("Timeout"));
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [{ embedding: [0.1], index: 0, object: "embedding" }],
          model: "embed-model-1",
          usage: { prompt_tokens: 10, total_tokens: 10 },
        }),
      });
    });

    const results = await provider.embedBatch([
      { chunkId: "chunk-1", text: "test", idempotencyKey: "key-1" },
    ]);

    expect(results).toHaveLength(1);
    expect(callCount).toBe(3);
  });

  test("should use correct URL path with /api/v1/student", async () => {
    await provider.embedBatch([
      { chunkId: "chunk-1", text: "test", idempotencyKey: "key-1" },
    ]);

    const embedCall = mockFetch.mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && call[0].includes("/embed")
    );
    expect(embedCall).toBeDefined();
    expect((embedCall as unknown[])[0]).toBe("https://api.test.com/api/v1/student/embed");
  });

  test("should validate models on startup (non-fatal)", async () => {
    const newProvider = createStudentBedrockProvider();

    await new Promise((resolve) => setTimeout(resolve, 100));

    const modelsCall = mockFetch.mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && call[0].includes("/models")
    );
    expect(modelsCall).toBeDefined();
    expect((modelsCall as unknown[])[0]).toBe("https://api.test.com/api/v1/student/models");
    expect((modelsCall as unknown[])[1]).toEqual(
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "Authorization": "Bearer test-api-key",
        }),
      })
    );
    expect(newProvider).toBeDefined();
  });

  test("should handle startup validation network failure gracefully", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/models")) {
        return Promise.reject(new Error("Network error"));
      }
      return Promise.resolve(defaultEmbedResponse);
    });

    const failingProvider = createStudentBedrockProvider();

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(failingProvider).toBeDefined();
    expect(failingProvider.name).toBe("student-bedrock");
  });
});
