import type { VectorStoreAdapter } from "./vectorStoreAdapter.js";
import type { AdapterFilter } from "./adapterFilter.types.js";

interface StoredVector {
  vector: number[];
  metadata: Record<string, unknown>;
}

export class FakeVectorStoreAdapter implements VectorStoreAdapter {
  readonly providerKey = "fake";

  private readonly store = new Map<string, StoredVector>();

  async search(query: {
    vector: number[];
    topK: number;
    filter: AdapterFilter;
    signal?: AbortSignal;
  }): Promise<{ chunkId: string; score: number }[]> {
    const { vector, topK, filter, signal } = query;

    /* 1. Filter at the datastore level before scoring */
    const candidates: { chunkId: string; storedVector: number[]; storedNorm: number }[] = [];

    for (const [chunkId, stored] of this.store) {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      const meta = stored.metadata;

      // tenantId is required metadata field for isolation
      if (meta.tenantId !== filter.tenantId) continue;

      if (filter.classification) {
        const val = meta.classification as string | undefined;
        if (!val || !filter.classification.$in.includes(val)) continue;
      }
      if (filter.department) {
        const val = meta.department as string | undefined;
        if (!val || !filter.department.$in.includes(val)) continue;
      }
      if (filter.category) {
        const val = meta.category as string | undefined;
        if (!val || !filter.category.$in.includes(val)) continue;
      }
      if (filter.allowAiUse !== undefined) {
        if (meta.allowAiUse !== filter.allowAiUse) continue;
      }
      if (filter.documentIds) {
        const docId = meta.documentId as string | undefined;
        if (!docId || !filter.documentIds.includes(docId)) continue;
      }
      if (filter.documentVersionId) {
        if (meta.documentVersionId !== filter.documentVersionId) continue;
      }

      candidates.push({
        chunkId,
        storedVector: stored.vector,
        storedNorm: this.norm(stored.vector),
      });
    }

    /* 2. Compute cosine similarity for each candidate */
    const queryNorm = this.norm(vector);
    const scored = candidates.map(({ chunkId, storedVector, storedNorm }) => {
      const score = this.cosineSimilarity(vector, storedVector, queryNorm, storedNorm);
      return { chunkId, score };
    });

    /* 3. Sort descending by score (highest similarity first) */
    scored.sort((a, b) => b.score - a.score);

    /* 4. Return topK results */
    return scored.slice(0, topK);
  }

  async storeChunks(
    chunks: {
      chunkId: string;
      vector: number[];
      metadata: Record<string, unknown>;
    }[],
  ): Promise<void> {
    for (const chunk of chunks) {
      this.store.set(chunk.chunkId, {
        vector: chunk.vector,
        metadata: { ...chunk.metadata },
      });
    }
  }

  async deleteChunks(
    filter: Pick<AdapterFilter, "tenantId" | "documentIds">,
  ): Promise<void> {
    for (const [chunkId, stored] of this.store) {
      const meta = stored.metadata;
      if (meta.tenantId !== filter.tenantId) continue;
      if (filter.documentIds) {
        const docId = meta.documentId as string | undefined;
        if (docId && !filter.documentIds.includes(docId)) continue;
      }
      this.store.delete(chunkId);
    }
  }

  /** Reset all stored data (useful in tests). */
  _reset(): void {
    this.store.clear();
  }

  /**
   * Cosine similarity between two vectors.
   * Returns 0 if either vector has zero magnitude.
   */
  private cosineSimilarity(
    a: number[],
    b: number[],
    normA: number,
    normB: number,
  ): number {
    if (normA === 0 || normB === 0) return 0;
    let dot = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
    }
    return dot / (normA * normB);
  }

  /** Euclidean norm (L2) of a vector. */
  private norm(v: number[]): number {
    let sumSq = 0;
    for (let i = 0; i < v.length; i++) {
      sumSq += v[i] * v[i];
    }
    return Math.sqrt(sumSq);
  }
}

export function createFakeVectorStoreAdapter(): FakeVectorStoreAdapter {
  return new FakeVectorStoreAdapter();
}
