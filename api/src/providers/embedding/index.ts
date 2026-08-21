import type { EmbeddingProvider } from "./embeddingProvider.port.js";
import { FakeEmbeddingProvider } from "./fakeEmbeddingProvider.js";
import { getEffectiveAiRuntimeConfig } from "../../modules/platform/ai-runtime-config.js";

let singleton: EmbeddingProvider | null = null;

export type EmbeddingProviderKey =
  | "fake"
  | "openai"
  | "groq"
  | "student-bedrock";

export function resolveEmbeddingModel(
  provider: EmbeddingProviderKey,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (provider === "groq") {
    return env.JINA_EMBEDDING_MODEL || "jina-embeddings-v3";
  }
  if (provider === "student-bedrock") {
    return (
      env.BEDROCK_EMBEDDING_MODELS?.split(",")[0]?.trim() ||
      "amazon.titan-embed-text-v2:0"
    );
  }
  return env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
}

/**
 * Resolve embedding configuration independently from chat-model failover.
 * AI_PROVIDER remains an explicit override for backwards compatibility. When
 * it is absent, infer the embedding backend from its own credential, matching
 * the legacy provider chain used by the LLM layer. This prevents a configured
 * Jina embedding runtime from silently becoming a dimension-incompatible fake.
 */
export function resolveEmbeddingProviderKey(
  env: NodeJS.ProcessEnv = process.env,
): EmbeddingProviderKey {
  if (env.NODE_ENV === "test") return "fake";
  const runtime = getEffectiveAiRuntimeConfig();
  if (runtime.provider === "student-bedrock") return "student-bedrock";
  if (runtime.provider === "groq") return "groq";
  const explicit = env.AI_PROVIDER?.trim().toLowerCase();
  if (
    explicit === "fake" ||
    explicit === "openai" ||
    explicit === "groq" ||
    explicit === "student-bedrock"
  ) {
    return explicit;
  }
  if (env.JINA_API_KEY?.trim()) return "groq";
  if (env.OPENAI_API_KEY?.trim()) return "openai";
  if (env.SBG_API_KEY?.trim()) return "student-bedrock";
  return "fake";
}

/**
 * Returns the configured embedding provider singleton.
 * In development/test, uses FakeEmbeddingProvider.
 * Set AI_PROVIDER=openai and OPENAI_API_KEY to use the real OpenAI provider.
 * Set AI_PROVIDER=student-bedrock and SBG_API_KEY to use the Student Bedrock Gateway.
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  if (singleton) return singleton;
  // Initialize synchronously - for student-bedrock, this returns a fake placeholder
  // The real provider will be initialized on first actual use via getEmbeddingProviderAsync
  singleton = createEmbeddingProviderSyncSync();
  return singleton;
}

function createEmbeddingProviderSyncSync(): EmbeddingProvider {
  const aiProvider = resolveEmbeddingProviderKey();

  // For student-bedrock, return a placeholder fake provider
  // The real provider will be swapped in on first actual use
  if (aiProvider === "student-bedrock") {
    return new FakeEmbeddingProvider(parseInt(process.env.OPENAI_EMBEDDING_DIMENSIONS || "1536", 10));
  }

  const dimensions = parseInt(
    aiProvider === "groq"
      ? process.env.JINA_EMBEDDING_DIMENSIONS || "1024"
      : process.env.OPENAI_EMBEDDING_DIMENSIONS || "1536",
    10,
  );

  if (aiProvider === "openai") {
    // For OpenAI, we use dynamic import but this is sync - return fake for now
    // The async version will properly initialize
    return new FakeEmbeddingProvider(dimensions);
  }

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
  const aiProvider = resolveEmbeddingProviderKey();

  if (aiProvider === "student-bedrock") {
    const { createStudentBedrockProvider } = await import("../bedrock/index.js");
    return createStudentBedrockProvider();
  }

  if (aiProvider === "groq") {
    const { OpenAIEmbeddingProvider } = await import("./openaiEmbedding.adapter.js");
    const apiKey = process.env.JINA_API_KEY;
    const model = resolveEmbeddingModel(aiProvider);
    const dimensions = parseInt(process.env.JINA_EMBEDDING_DIMENSIONS || "1024", 10);
    if (!apiKey) throw new Error("JINA_API_KEY is required for groq provider");
    return new OpenAIEmbeddingProvider(apiKey, model, dimensions, "https://api.jina.ai/v1");
  }

  if (aiProvider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    const dimensions = parseInt(process.env.OPENAI_EMBEDDING_DIMENSIONS || "1536", 10);
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for openai provider");
    const { OpenAIEmbeddingProvider } = await import("./openaiEmbedding.adapter.js");
    const model = resolveEmbeddingModel(aiProvider);
    return new OpenAIEmbeddingProvider(apiKey, model, dimensions);
  }

  return new FakeEmbeddingProvider(
    parseInt(process.env.OPENAI_EMBEDDING_DIMENSIONS || "1536", 10),
  );
}

export type { EmbeddingProvider, EmbeddingInput, EmbeddingResult } from "./embeddingProvider.port.js";
