import type { AdapterFilter } from "./adapterFilter.types.js";

export interface VectorStoreAdapter {
  readonly providerKey: string;

  /**
   * The filter MUST be applied at the datastore level before scoring.
   * Adapters that fail will produce security-test failures.
   */
  search(query: {
    vector: number[];
    topK: number;
    filter: AdapterFilter;
    signal?: AbortSignal;
  }): Promise<{ chunkId: string; score: number }[]>;

  storeChunks(chunks: {
    chunkId: string;
    vector: number[];
    metadata: Record<string, unknown>;
  }[]): Promise<void>;

  deleteChunks(filter: Pick<AdapterFilter, "tenantId" | "documentIds">): Promise<void>;
}
