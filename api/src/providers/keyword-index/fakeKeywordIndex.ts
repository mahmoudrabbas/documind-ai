import type {
  KeywordSearchInput,
  KeywordSearchResult,
  KeywordIndex,
} from "./keywordIndex.port.js";

/**
 * In-memory fake keyword index for tests and parallel development.
 * Simple substring matching as a placeholder for Atlas Search text index.
 */
export class FakeKeywordIndex implements KeywordIndex {
  private entries: Map<string, { text: string; metadata: Record<string, unknown> }> = new Map();
  private indexReady = false;

  async search(input: KeywordSearchInput): Promise<KeywordSearchResult[]> {
    const queryLower = input.query.toLowerCase();
    const results: Array<{ chunkId: string; score: number; metadata: Record<string, unknown> }> = [];

    for (const [chunkId, entry] of this.entries) {
      if (entry.metadata.tenantId !== input.tenantId) continue;
      if (entry.metadata.generationId !== input.generationId) continue;

      if (input.filters?.documentId && entry.metadata.documentId !== input.filters.documentId) continue;

      const textLower = entry.text.toLowerCase();
      if (!textLower.includes(queryLower)) continue;

      const matches = textLower.split(queryLower).length - 1;
      const score = matches / Math.max(entry.text.split(/\s+/).length, 1);

      results.push({ chunkId, score, metadata: entry.metadata });
    }

    results.sort((a, b) => b.score - a.score);

    return results.slice(0, input.topK).map((r) => ({
      chunkId: r.chunkId,
      documentId: r.metadata.documentId as string,
      generationId: r.metadata.generationId as string,
      score: r.score,
      text: (r.metadata.text as string) || "",
      sectionPath: (r.metadata.sectionPath as string[]) || [],
      pageStart: (r.metadata.pageStart as number) || 1,
      pageEnd: (r.metadata.pageEnd as number) || 1,
      contentType: (r.metadata.contentType as string) || "paragraph",
      language: (r.metadata.language as string) || "en",
    }));
  }

  async indexDocument(
    chunkId: string,
    text: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    this.entries.set(chunkId, { text, metadata });
  }

  async ensureIndex(): Promise<void> {
    this.indexReady = true;
  }

  async getIndexStatus(): Promise<{ exists: boolean; status: string }> {
    return { exists: this.indexReady, status: this.indexReady ? "READY" : "UNKNOWN" };
  }

  reset(): void {
    this.entries.clear();
    this.indexReady = false;
  }
}
