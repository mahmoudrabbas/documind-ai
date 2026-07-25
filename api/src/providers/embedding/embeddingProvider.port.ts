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
