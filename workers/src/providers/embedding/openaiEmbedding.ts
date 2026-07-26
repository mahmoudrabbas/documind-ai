import { createHash } from "node:crypto";
import OpenAI from "openai";

export interface EmbeddingInput {
  chunkId: string;
  text: string;
  idempotencyKey: string;
}

export interface EmbeddingResult {
  chunkId: string;
  vector: number[];
  tokenUsage: number;
  costUsd: number;
  modelVersion: string;
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly dimensions: number;
  embedBatch(inputs: EmbeddingInput[]): Promise<EmbeddingResult[]>;
}

const EMBEDDING_BATCH_SIZE = 100;
const COST_PER_TOKEN = 0.00000002;

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openai";
  readonly model: string;
  readonly dimensions: number;
  private client: OpenAI;

  constructor(apiKey: string, model = "text-embedding-3-small", dimensions = 1536, baseURL?: string) {
    this.client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
    this.model = model;
    this.dimensions = dimensions;
  }

  async embedBatch(inputs: EmbeddingInput[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];

    for (let i = 0; i < inputs.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = inputs.slice(i, i + EMBEDDING_BATCH_SIZE);
      const texts = batch.map((input) => input.text);

      let lastError: Error | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const response = await this.client.embeddings.create({
            model: this.model,
            input: texts,
            dimensions: this.dimensions,
          });

          for (let j = 0; j < batch.length; j++) {
            const data = response.data[j];
            results.push({
              chunkId: batch[j].chunkId,
              vector: data.embedding,
              tokenUsage: response.usage.total_tokens,
              costUsd: response.usage.total_tokens * COST_PER_TOKEN,
              modelVersion: this.model,
            });
          }
          lastError = null;
          break;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          if (attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          }
        }
      }

      if (lastError) {
        throw lastError;
      }
    }

    return results;
  }
}

export class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly name = "fake";
  readonly model = "fake-embedding-v1";
  readonly dimensions: number;

  constructor(dimensions = 1536) {
    this.dimensions = dimensions;
  }

  async embedBatch(inputs: EmbeddingInput[]): Promise<EmbeddingResult[]> {
    return inputs.map((input) => {
      const hash = createHash("sha256").update(input.text).digest("hex");
      const vector = this.hashToVector(hash);
      const tokenUsage = Math.ceil(input.text.split(/\s+/).length * 1.3);

      return {
        chunkId: input.chunkId,
        vector,
        tokenUsage,
        costUsd: tokenUsage * 0.00000002,
        modelVersion: "fake-v1",
      };
    });
  }

  private hashToVector(hash: string): number[] {
    const vector: number[] = [];
    for (let i = 0; i < this.dimensions; i++) {
      const byteIndex = i % (hash.length / 2);
      const hexPair = hash.substring(byteIndex * 2, byteIndex * 2 + 2);
      vector.push((parseInt(hexPair, 16) - 128) / 128);
    }
    return vector;
  }
}

export class StudentBedrockEmbeddingProvider implements EmbeddingProvider {
  readonly name = "student-bedrock";
  readonly model: string;
  readonly dimensions: number;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly embeddingModels: string[];
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private currentModelIndex = 0;

  constructor(
    apiKey: string,
    baseUrl: string,
    embeddingModels: string[],
    timeoutMs: number,
    maxRetries: number,
    retryDelayMs: number
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.embeddingModels = embeddingModels;
    this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries;
    this.retryDelayMs = retryDelayMs;
    this.model = embeddingModels[0] || "amazon.titan-embed-text-v2:0";
    this.dimensions = 1024;
  }

  private getCurrentModel(): string {
    return this.embeddingModels[this.currentModelIndex % this.embeddingModels.length];
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Request timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async embedBatch(inputs: EmbeddingInput[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];

    for (const input of inputs) {
      const model = this.getCurrentModel();
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          const response = await this.fetchWithTimeout(
            `${this.baseUrl}/api/v1/student/embed`,
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${this.apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model_id: model,
                texts: [input.text],
              }),
            },
            this.timeoutMs
          );

          if (!response.ok) {
            const errorText = await response.text().catch(() => "Unknown error");
            let error: Error;

            switch (response.status) {
              case 401:
                error = new Error(`Authentication failed: ${errorText}`);
                break;
              case 429:
                error = new Error(`Rate limited: ${errorText}`);
                break;
              case 408:
                error = new Error(`Request timeout: ${errorText}`);
                break;
              case 503:
                error = new Error(`Service unavailable: ${errorText}`);
                break;
              default:
                if (response.status >= 500) {
                  error = new Error(`Server error: ${errorText}`);
                } else {
                  error = new Error(`HTTP ${response.status}: ${errorText}`);
                }
            }
            throw error;
          }

          const data = await response.json() as {
            data: Array<{ embedding: number[]; index: number }>;
            usage?: { total_tokens: number; prompt_tokens: number };
          };

          const embedding = data.data[0];
          const tokenUsage = data.usage?.total_tokens || 0;

          results.push({
            chunkId: input.chunkId,
            vector: embedding.embedding,
            tokenUsage,
            costUsd: tokenUsage * COST_PER_TOKEN,
            modelVersion: model,
          });

          lastError = null;
          break;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));

          const errorMessage = lastError.message.toLowerCase();
          const isRetryable = errorMessage.includes("rate limit") ||
            errorMessage.includes("timeout") ||
            errorMessage.includes("503") ||
            errorMessage.includes("502") ||
            errorMessage.includes("504") ||
            errorMessage.includes("network");

          if (!isRetryable || attempt >= this.maxRetries) {
            break;
          }

          const backoffMs = this.retryDelayMs * Math.pow(2, attempt - 1);
          await this.sleep(backoffMs);
        }
      }

      if (lastError) {
        const errorMessage = lastError.message.toLowerCase();
        if (errorMessage.includes("rate limit") || errorMessage.includes("timeout") || errorMessage.includes("503")) {
          this.currentModelIndex = (this.currentModelIndex + 1) % this.embeddingModels.length;
          console.warn(`[StudentBedrock] Falling back to next embedding model: ${this.getCurrentModel()}`);
        }
        throw lastError;
      }
    }

    return results;
  }
}

export function createEmbeddingProvider(): EmbeddingProvider {
  const aiProvider = process.env.AI_PROVIDER || "fake";

  if (aiProvider === "student-bedrock") {
    const apiKey = process.env.SBG_API_KEY;
    const baseUrl = process.env.SBG_BASE_URL;

    if (!apiKey || !baseUrl) {
      throw new Error("SBG_API_KEY and SBG_BASE_URL are required for student-bedrock provider");
    }

    const embeddingModels = (process.env.BEDROCK_EMBEDDING_MODELS || "amazon.titan-embed-text-v2:0,us.cohere.embed-v4:0")
      .split(",")
      .map((m) => m.trim())
      .filter((m) => m.length > 0);

    return new StudentBedrockEmbeddingProvider(
      apiKey,
      baseUrl,
      embeddingModels,
      parseInt(process.env.BEDROCK_TIMEOUT_MS || "30000", 10),
      parseInt(process.env.BEDROCK_MAX_RETRIES || "3", 10),
      parseInt(process.env.BEDROCK_RETRY_DELAY_MS || "1000", 10)
    );
  }

  if (aiProvider === "groq") {
    const apiKey = process.env.JINA_API_KEY || "";
    const model = process.env.JINA_EMBEDDING_MODEL || "jina-embeddings-v3";
    const dimensions = parseInt(process.env.JINA_EMBEDDING_DIMENSIONS || "1024", 10);
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