import OpenAI from "openai";
import type {
  EmbeddingInput,
  EmbeddingResult,
  EmbeddingProvider,
} from "./embeddingProvider.port.js";

const MAX_BATCH_SIZE = 2048;
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 1000;

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openai";
  readonly model: string;
  readonly dimensions: number;

  private client: OpenAI;
  private modelVersion: string;

  constructor(apiKey: string, model: string, dimensions: number) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
    this.dimensions = dimensions;
    this.modelVersion = model;
  }

  async embedBatch(inputs: EmbeddingInput[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];
    const batches = this.chunkArray(inputs, MAX_BATCH_SIZE);

    for (const batch of batches) {
      const batchResults = await this.embedBatchWithRetry(batch);
      results.push(...batchResults);
    }

    return results;
  }

  private async embedBatchWithRetry(
    batch: EmbeddingInput[],
    attempt = 0,
  ): Promise<EmbeddingResult[]> {
    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: batch.map((b) => b.text),
        dimensions: this.dimensions,
      });

      return batch.map((input, i) => {
        const data = response.data[i];
        return {
          chunkId: input.chunkId,
          vector: data.embedding,
          tokenUsage: response.usage.prompt_tokens,
          costUsd: this.estimateCost(response.usage.prompt_tokens),
          modelVersion: this.modelVersion,
        };
      });
    } catch (error: unknown) {
      const err = error as { status?: number; code?: string };
      const isRetryable = err.status === 429 || (err.status !== undefined && err.status >= 500);

      if (isRetryable && attempt < MAX_RETRIES) {
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt) + Math.random() * 1000;
        await new Promise((resolve) => setTimeout(resolve, backoff));
        return this.embedBatchWithRetry(batch, attempt + 1);
      }

      throw error;
    }
  }

  private estimateCost(tokens: number): number {
    if (this.model === "text-embedding-3-small") {
      return (tokens / 1_000_000) * 0.02;
    }
    if (this.model === "text-embedding-3-large") {
      return (tokens / 1_000_000) * 0.13;
    }
    return 0;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
