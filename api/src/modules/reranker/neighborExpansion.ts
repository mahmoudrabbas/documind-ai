/**
 * Neighbor expansion — adds context from adjacent chunks when a clause or
 * table requires surrounding context to be understood.
 *
 * When a selected chunk appears to be a clause, table row, or partial
 * statement, we expand to include its neighbors (previous/next chunkIndex)
 * from the same document, while preserving tenant access filters.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface NeighborExpansionConfig {
  /** Maximum number of neighbors to add per side (before + after). */
  maxNeighborsPerSide: number;
  /** Maximum additional tokens allowed for expanded neighbors. */
  maxExpansionTokens: number;
  /** Patterns that indicate a chunk needs neighbor context. */
  needsContextPatterns: RegExp[];
}

export const DEFAULT_NEIGHBOR_EXPANSION_CONFIG: NeighborExpansionConfig = {
  maxNeighborsPerSide: 1,
  maxExpansionTokens: 500,
  needsContextPatterns: [
    // Table-like content
    /\|.*\|.*\|/,
    // Clause references
    /\b(clause|section|article|paragraph|item)\s+\d+/i,
    /\b(بند|مادة|فقرة)\s+\d+/,
    // Incomplete sentences (ends with conjunction or preposition)
    /\b(and|or|but|including|such as|in|of|for|to)\s*$/i,
    /\b(و|أو|لكن|بما في ذلك|من|في|لـ)\s*$/,
    // List items
    /^\s*[-•*]\s/,
    /^\s*\d+[.)]\s/,
  ],
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface NeighborCandidate {
  chunkId: string;
  chunkIndex: number;
  documentId: string;
  documentVersionId: string;
  tenantId: string;
  text: string;
  pageNumber?: number;
  sectionTitle?: string;
  [key: string]: unknown;
}

export interface ExpandedGroup<T extends NeighborCandidate> {
  /** The primary (selected) chunk. */
  primary: T;
  /** Neighbor chunks added for context. */
  neighbors: T[];
  /** Combined text of primary + neighbors. */
  combinedText: string;
  /** Whether expansion was applied. */
  expanded: boolean;
}

/**
 * Expands selected chunks with their neighbors when context is needed.
 *
 * @param selectedChunks - The chunks selected by the reranker.
 * @param allChunks - All available chunks (for neighbor lookup).
 * @param config - Expansion configuration.
 * @returns Expanded groups with neighbor context.
 */
export function expandNeighbors<T extends NeighborCandidate>(
  selectedChunks: T[],
  allChunks: T[],
  config: NeighborExpansionConfig = DEFAULT_NEIGHBOR_EXPANSION_CONFIG,
): ExpandedGroup<T>[] {
  // Build lookup by (documentId, chunkIndex)
  const chunkIndex = new Map<string, T>();
  for (const chunk of allChunks) {
    const key = `${chunk.documentId}:${chunk.chunkIndex}`;
    chunkIndex.set(key, chunk);
  }

  // Build document → chunks sorted by index
  const docChunks = new Map<string, T[]>();
  for (const chunk of allChunks) {
    if (!docChunks.has(chunk.documentId)) docChunks.set(chunk.documentId, []);
    docChunks.get(chunk.documentId)!.push(chunk);
  }
  for (const chunks of docChunks.values()) {
    chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  const results: ExpandedGroup<T>[] = [];
  let expansionTokensUsed = 0;

  for (const chunk of selectedChunks) {
    const needsContext = config.needsContextPatterns.some((p) => p.test(chunk.text));

    if (!needsContext || expansionTokensUsed >= config.maxExpansionTokens) {
      results.push({
        primary: chunk,
        neighbors: [],
        combinedText: chunk.text,
        expanded: false,
      });
      continue;
    }

    const docChunksList = docChunks.get(chunk.documentId) ?? [];
    const currentIdx = docChunksList.findIndex(
      (c) => c.chunkId === chunk.chunkId,
    );

    if (currentIdx < 0) {
      results.push({
        primary: chunk,
        neighbors: [],
        combinedText: chunk.text,
        expanded: false,
      });
      continue;
    }

    const neighbors: T[] = [];

    // Add previous neighbors
    for (let n = 1; n <= config.maxNeighborsPerSide; n++) {
      const prevIdx = currentIdx - n;
      if (prevIdx < 0) break;
      const prev = docChunksList[prevIdx]!;
      // Skip if already selected as a primary
      if (selectedChunks.some((s) => s.chunkId === prev.chunkId)) continue;
      const estTokens = Math.ceil(prev.text.length / 4);
      if (expansionTokensUsed + estTokens > config.maxExpansionTokens) break;
      neighbors.unshift(prev);
      expansionTokensUsed += estTokens;
    }

    // Add next neighbors
    for (let n = 1; n <= config.maxNeighborsPerSide; n++) {
      const nextIdx = currentIdx + n;
      if (nextIdx >= docChunksList.length) break;
      const next = docChunksList[nextIdx]!;
      if (selectedChunks.some((s) => s.chunkId === next.chunkId)) continue;
      const estTokens = Math.ceil(next.text.length / 4);
      if (expansionTokensUsed + estTokens > config.maxExpansionTokens) break;
      neighbors.push(next);
      expansionTokensUsed += estTokens;
    }

    const combinedText =
      neighbors.length > 0
        ? [...neighbors.filter((n) => n.chunkIndex < chunk.chunkIndex), chunk, ...neighbors.filter((n) => n.chunkIndex > chunk.chunkIndex)]
            .map((n) => n.text)
            .join("\n\n")
        : chunk.text;

    results.push({
      primary: chunk,
      neighbors,
      combinedText,
      expanded: neighbors.length > 0,
    });
  }

  return results;
}
