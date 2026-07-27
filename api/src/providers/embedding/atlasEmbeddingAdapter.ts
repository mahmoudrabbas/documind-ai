import type { EmbeddingAdapter } from "../../modules/agents/agents.types.js";
import type { EmbeddingProvider } from "./embeddingProvider.port.js";
import { logger } from "../../common/logger/logger.js";

export class EmbeddingProviderAdapter implements EmbeddingAdapter {
  readonly providerKey: string;

  private provider: EmbeddingProvider;

  constructor(provider: EmbeddingProvider) {
    this.provider = provider;
    this.providerKey = provider.name;
  }

  async embed(params: {
    inputs: string[];
    signal?: AbortSignal;
  }): Promise<{ vectors: number[][]; usage: { totalTokens: number } }> {
    const embeddings = await this.provider.embedBatch(
      params.inputs.map((text, i) => ({
        chunkId: `query_${i}`,
        text,
        idempotencyKey: `query_${Date.now()}_${i}`,
      })),
    );

    return {
      vectors: embeddings.map((e) => e.vector),
      usage: { totalTokens: embeddings.reduce((sum, e) => sum + e.tokenUsage, 0) },
    };
  }
}

let adapterInstance: EmbeddingProviderAdapter | null = null;

export async function getEmbeddingAdapter(): Promise<EmbeddingAdapter> {
  if (adapterInstance) return adapterInstance;

  const { getEmbeddingProviderAsync } = await import("./index.js");
  const provider = await getEmbeddingProviderAsync();
  adapterInstance = new EmbeddingProviderAdapter(provider);
  logger.info({ provider: provider.name }, "EmbeddingAdapter initialized from EmbeddingProvider");
  return adapterInstance;
}
