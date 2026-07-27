import { createHash } from "node:crypto";
import type {
  EmbeddingInput,
  EmbeddingResult,
  EmbeddingProvider,
} from "./embeddingProvider.port.js";

/**
 * Deterministic fake embedding provider for tests and parallel development.
 * Produces a hash-based pseudo-vector of the correct dimensionality so that
 * vector search contracts can be tested without live OpenAI access.
 */
export class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly name = "fake";
  readonly model = "fake-embedding-v1";
  readonly dimensions: number;
  readonly costPerToken: number;

  private embedCalls: EmbeddingInput[] = [];

  constructor(dimensions = 1536, costPerToken = 0) {
    this.dimensions = dimensions;
    this.costPerToken = costPerToken;
  }

  async embedBatch(inputs: EmbeddingInput[]): Promise<EmbeddingResult[]> {
    this.embedCalls.push(...inputs);

    return inputs.map((input) => {
      const hash = createHash("sha256").update(input.text).digest("hex");
      const vector = this.hashToVector(hash);
      const tokenUsage = Math.ceil(input.text.split(/\s+/).length * 1.3);

      return {
        chunkId: input.chunkId,
        vector,
        tokenUsage,
        costUsd: tokenUsage * this.costPerToken,
        modelVersion: "fake-v1",
      };
    });
  }

  getEmbedCalls(): readonly EmbeddingInput[] {
    return this.embedCalls;
  }

  reset(): void {
    this.embedCalls = [];
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
