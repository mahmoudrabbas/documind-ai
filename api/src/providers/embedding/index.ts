import type { EmbeddingProvider } from "./embeddingProvider.port.js";
import { FakeEmbeddingProvider } from "./fakeEmbeddingProvider.js";
import { OpenAIEmbeddingProvider } from "./openaiEmbedding.adapter.js";

let singleton: EmbeddingProvider | null = null;

/**
 * Returns the configured embedding provider singleton.
 * Set AI_PROVIDER=groq and JINA_API_KEY to use Jina embeddings (Groq stack).
 * Set AI_PROVIDER=openai and OPENAI_API_KEY to use the real OpenAI provider.
 * Set AI_PROVIDER=student-bedrock and SBG_API_KEY to use the Student Bedrock Gateway.
 * Falls back to FakeEmbeddingProvider only when AI_PROVIDER is unset or "fake".
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  if (singleton) return singleton;
  singleton = createEmbeddingProviderSync();
  return singleton;
}

function createEmbeddingProviderSync(): EmbeddingProvider {
  const aiProvider = process.env.AI_PROVIDER || "fake";

  if (aiProvider === "groq") {
    const apiKey = process.env.JINA_API_KEY;
    const model = process.env.JINA_EMBEDDING_MODEL || "jina-embeddings-v3";
    const dimensions = parseInt(process.env.JINA_EMBEDDING_DIMENSIONS || "1024", 10);
    if (!apiKey) throw new Error("JINA_API_KEY is required for groq provider");
    return new OpenAIEmbeddingProvider(apiKey, model, dimensions, "https://api.jina.ai/v1");
  }

  if (aiProvider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    const dimensions = parseInt(process.env.OPENAI_EMBEDDING_DIMENSIONS || "1536", 10);
    if (apiKey && apiKey !== "" && process.env.NODE_ENV !== "test") {
      const model = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
      return new OpenAIEmbeddingProvider(apiKey, model, dimensions);
    }
  }

  if (aiProvider === "student-bedrock") {
    // Bedrock requires async init; swap in on first async use.
    return new FakeEmbeddingProvider(parseInt(process.env.OPENAI_EMBEDDING_DIMENSIONS || "1536", 10));
  }

  const dimensions = parseInt(process.env.OPENAI_EMBEDDING_DIMENSIONS || "1536", 10);
  return new FakeEmbeddingProvider(dimensions);
}

export function setEmbeddingProvider(provider: EmbeddingProvider | null): void {
  singleton = provider;
}

// Async version for proper initialization
export async function getEmbeddingProviderAsync(): Promise<EmbeddingProvider> {
  if (singleton) return singleton;
  singleton = await createEmbeddingProvider();
  return singleton;
}

async function createEmbeddingProvider(): Promise<EmbeddingProvider> {
  const aiProvider = process.env.AI_PROVIDER || "fake";

  if (aiProvider === "fake") {
    const dimensions = parseInt(process.env.OPENAI_EMBEDDING_DIMENSIONS || "1536", 10);
    return new FakeEmbeddingProvider(dimensions);
  }

  if (aiProvider === "student-bedrock") {
    const { createStudentBedrockProvider } = await import("../bedrock/index.js");
    return createStudentBedrockProvider();
  }

  if (aiProvider === "groq") {
    const apiKey = process.env.JINA_API_KEY;
    const model = process.env.JINA_EMBEDDING_MODEL || "jina-embeddings-v3";
    const dimensions = parseInt(process.env.JINA_EMBEDDING_DIMENSIONS || "1024", 10);
    if (!apiKey) throw new Error("JINA_API_KEY is required for groq provider");
    return new OpenAIEmbeddingProvider(apiKey, model, dimensions, "https://api.jina.ai/v1");
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const dimensions = parseInt(process.env.OPENAI_EMBEDDING_DIMENSIONS || "1536", 10);

  if (apiKey && apiKey !== "" && process.env.NODE_ENV !== "test") {
    const model = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
    return new OpenAIEmbeddingProvider(apiKey, model, dimensions);
  }

  return new FakeEmbeddingProvider(dimensions);
}

export type { EmbeddingProvider, EmbeddingInput, EmbeddingResult } from "./embeddingProvider.port.js";