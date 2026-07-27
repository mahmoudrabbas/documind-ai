import type {
  VectorSearchInput,
  VectorSearchResult,
  VectorIndex,
} from "./vectorIndex.port.js";

/**
 * In-memory fake vector index for tests and parallel development.
 * Stores vectors in a Map and performs brute-force cosine similarity search.
 */
export class FakeVectorIndex implements VectorIndex {
  readonly indexName = "fake-vector-index";

  private vectors: Map<string, { vector: number[]; metadata: Record<string, unknown> }> = new Map();
  private indexReady = false;

  async search(input: VectorSearchInput): Promise<VectorSearchResult[]> {
    const results: Array<{ chunkId: string; score: number; metadata: Record<string, unknown> }> = [];

    for (const [chunkId, entry] of this.vectors) {
      if (entry.metadata.tenantId !== input.tenantId) continue;
      if (entry.metadata.generationId !== input.generationId) continue;

      if (input.filters?.documentId && entry.metadata.documentId !== input.filters.documentId) continue;

      const score = this.cosineSimilarity(input.vector, entry.vector);
      results.push({ chunkId, score, metadata: entry.metadata });
    }

    results.sort((a, b) => b.score - a.score);

    return results.slice(0, input.topK).map((r) => ({
      chunkId: r.chunkId,
      documentId: r.metadata.documentId as string,
      generationId: r.metadata.generationId as string,
      similarityScore: r.score,
      text: (r.metadata.text as string) || "",
      sectionPath: (r.metadata.sectionPath as string[]) || [],
      pageStart: (r.metadata.pageStart as number) || 1,
      pageEnd: (r.metadata.pageEnd as number) || 1,
      contentType: (r.metadata.contentType as string) || "paragraph",
      language: (r.metadata.language as string) || "en",
    }));
  }

  async upsertVector(
    chunkId: string,
    vector: number[],
    metadata: Record<string, unknown>,
  ): Promise<void> {
    this.vectors.set(chunkId, { vector, metadata });
  }

  async ensureIndex(_dimensions: number): Promise<void> {
    this.indexReady = true;
  }

  async getIndexStatus(): Promise<{ exists: boolean; status: string }> {
    return { exists: this.indexReady, status: this.indexReady ? "READY" : "UNKNOWN" };
  }

  async deleteByGeneration(_tenantId: string, _generationId: string): Promise<void> {
    for (const [chunkId, entry] of this.vectors) {
      if (entry.metadata.generationId === _generationId && entry.metadata.tenantId === _tenantId) {
        this.vectors.delete(chunkId);
      }
    }
  }

  reset(): void {
    this.vectors.clear();
    this.indexReady = false;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
