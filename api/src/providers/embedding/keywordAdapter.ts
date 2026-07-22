import type { AdapterFilter } from "./adapterFilter.types.js";

export type { AdapterFilter };

export interface KeywordAdapter {
  readonly providerKey: string;

  /**
   * The filter MUST be applied at the datastore level before scoring.
   * Adapters that fail will produce security-test failures.
   */
  search(query: {
    queryText: string;
    topK: number;
    filter: AdapterFilter;
    signal?: AbortSignal;
  }): Promise<{ chunkId: string; score: number }[]>;

  indexChunks(chunks: {
    chunkId: string;
    text: string;
    metadata: Record<string, unknown>;
  }[]): Promise<void>;

  removeChunks(filter: Pick<AdapterFilter, 'tenantId' | 'documentIds'>): Promise<void>;
}
