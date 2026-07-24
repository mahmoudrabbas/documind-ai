import {
  type KeywordAdapter,
  type AdapterFilter,
} from './keywordAdapter.js';
// ---------------------------------------------------------------------------
// Internal stored shapes
// ---------------------------------------------------------------------------

interface StoredChunk {
  text: string;
  metadata: Record<string, unknown>;
}

/** Term-frequency entry keyed by document id. */
type Postings = Map<string, number>;

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

/**
 * Matches one or more word-characters in Latin or Arabic script.
 *
 * Covers:
 *  - a–z, A–Z, 0–9, _
 *  - Arabic block           \u0600–\u06FF
 *  - Arabic Supplement      \u0750–\u077F
 *  - Arabic Extended-A      \u08A0–\u08FF
 *  - Arabic Pres. Forms-A   \uFB50–\uFDFD
 *  - Arabic Pres. Forms-B   \uFE70–\uFEFF
 */
const TOKEN_RE = /[a-zA-Z0-9_\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFD\uFE70-\uFEFF]+/g;

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const re = new RegExp(TOKEN_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    tokens.push(match[0].toLowerCase());
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// BM25 constants
// ---------------------------------------------------------------------------

const K1 = 1.5;
const B = 0.75;

// ---------------------------------------------------------------------------
// FakeKeywordAdapter
// ---------------------------------------------------------------------------

export class FakeKeywordAdapter implements KeywordAdapter {
  readonly providerKey = 'fake' as const;

  // ---- test seams ---------------------------------------------------------

  /** Reset all stored state. Useful between tests. */
  _reset(): void {
    this.chunks.clear();
    this.invertedIndex.clear();
    this.docLengths.clear();
    this.totalDocs = 0;
    this.avgDocLen = 0;
  }

  // ---- KeywordAdapter contract --------------------------------------------

  async indexChunks(
    chunks: {
      chunkId: string;
      text: string;
      metadata: Record<string, unknown>;
    }[],
  ): Promise<void> {
    if (chunks.length === 0) return;

    let totalLength = this.avgDocLen * this.totalDocs;

    for (const chunk of chunks) {
      const tokens = tokenize(chunk.text);
      const docLen = tokens.length;

      // Store chunk data
      this.chunks.set(chunk.chunkId, {
        text: chunk.text,
        metadata: { ...chunk.metadata },
      });

      // Track length
      this.docLengths.set(chunk.chunkId, docLen);
      totalLength += docLen;

      // Build term-frequency map for this chunk
      const tf = new Map<string, number>();
      for (const t of tokens) {
        tf.set(t, (tf.get(t) ?? 0) + 1);
      }

      // Merge into global inverted index
      for (const [term, count] of tf) {
        let postings = this.invertedIndex.get(term);
        if (!postings) {
          postings = new Map();
          this.invertedIndex.set(term, postings);
        }
        postings.set(chunk.chunkId, count);
      }

      this.totalDocs++;
    }

    this.avgDocLen = this.totalDocs > 0 ? totalLength / this.totalDocs : 0;
  }

  async search(query: {
    queryText: string;
    topK: number;
    filter: AdapterFilter;
    signal?: AbortSignal;
  }): Promise<{ chunkId: string; score: number }[]> {
    const { queryText, topK, filter, signal } = query;

    if (signal?.aborted) return [];

    const queryTokens = tokenize(queryText);
    if (queryTokens.length === 0) return [];

    // Deduplicate query terms – each term contributes once per document
    const uniqueTerms = [...new Set(queryTokens)];

    // Determine which chunks survive the metadata filter
    const candidateIds = this.#filteredChunkIds(filter);
    if (candidateIds.size === 0) return [];

    const avgdl = this.avgDocLen || 1;
    const N = this.totalDocs;

    const scores = new Map<string, number>();

    for (const chunkId of candidateIds) {
      if (signal?.aborted) return [];

      const dl = this.docLengths.get(chunkId) ?? 1;
      let score = 0;

      for (const term of uniqueTerms) {
        const postings = this.invertedIndex.get(term);
        if (!postings) continue;

        const tf = postings.get(chunkId) ?? 0;
        if (tf === 0) continue;

        // Number of documents containing this term
        const n = postings.size;

        // BM25 IDF
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));

        // BM25 TF with saturation
        const numerator = tf * (K1 + 1);
        const denominator = tf + K1 * (1 - B + B * (dl / avgdl));
        const tfScore = numerator / denominator;

        score += idf * tfScore;
      }

      if (score > 0) {
        scores.set(chunkId, score);
      }
    }

    // Sort descending, take top K
    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([chunkId, score]) => ({ chunkId, score }));
  }

  async removeChunks(
    filter: Pick<AdapterFilter, 'tenantId' | 'documentIds'>,
  ): Promise<void> {
    const toRemove = this.#filteredChunkIds(filter);

    // Remove from all index structures
    for (const chunkId of toRemove) {
      this.chunks.delete(chunkId);
      this.docLengths.delete(chunkId);
    }

    // Purge from inverted index
    for (const [, postings] of this.invertedIndex) {
      for (const chunkId of toRemove) {
        postings.delete(chunkId);
      }
    }

    // Drop empty posting lists
    for (const [term, postings] of this.invertedIndex) {
      if (postings.size === 0) {
        this.invertedIndex.delete(term);
      }
    }

    // Recalculate statistics
    this.totalDocs = this.chunks.size;
    const totalLength = [...this.docLengths.values()].reduce(
      (sum, len) => sum + len,
      0,
    );
    this.avgDocLen = this.totalDocs > 0 ? totalLength / this.totalDocs : 0;
  }

  // ---- internal helpers ---------------------------------------------------

  readonly chunks = new Map<string, StoredChunk>();
  readonly invertedIndex = new Map<string, Postings>();
  readonly docLengths = new Map<string, number>();
  private totalDocs = 0;
  private avgDocLen = 0;

  /**
   * Returns the set of chunk ids that satisfy the metadata filter.
   * The `tenantId` field is always required and checked. `documentIds`
   * further narrows the set when provided.
   */
  #filteredChunkIds(
    filter: Pick<AdapterFilter, 'tenantId' | 'documentIds'>,
  ): Set<string> {
    const result = new Set<string>();

    const docIds = filter.documentIds;

    for (const [chunkId, chunk] of this.chunks) {
      const meta = chunk.metadata;

      // Tenant isolation – mandatory
      if (meta['tenantId'] !== filter.tenantId) continue;

      // Optional document-id narrowing
      if (docIds !== undefined && docIds.length > 0) {
        const docId = meta['documentId'] as string | undefined;
        if (!docId) continue;
        if (!docIds.includes(docId)) continue;
      }

      result.add(chunkId);
    }

    return result;
  }
}

export default FakeKeywordAdapter;
