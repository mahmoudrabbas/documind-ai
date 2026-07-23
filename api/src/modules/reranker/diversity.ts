/**
 * Diversity scoring using Maximal Marginal Relevance (MMR).
 *
 * MMR balances relevance to the query against diversity among selected items.
 * It penalizes items that are too similar to already-selected items, ensuring
 * the evidence package covers different aspects of the query.
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DiversityConfig {
  /** Lambda controls the relevance-vs-diversity trade-off (0 = pure diversity, 1 = pure relevance). */
  lambda: number;
  /** Minimum Jaccard similarity threshold to consider two items as redundant. */
  redundancyThreshold: number;
}

export const DEFAULT_DIVERSITY_CONFIG: DiversityConfig = {
  lambda: 0.7,
  redundancyThreshold: 0.6,
};

export interface ScoredItem {
  index: number;
  totalScore: number;
  text: string;
  documentId: string;
}

/**
 * Selects a diverse subset from a scored list using MMR.
 *
 * @param items - Items sorted by relevance score (descending).
 * @param maxItems - Maximum number of items to select.
 * @param config - Diversity configuration.
 * @returns Indices of selected items in their MMR order.
 */
export function selectDiverse(
  items: ScoredItem[],
  maxItems: number,
  config: DiversityConfig = DEFAULT_DIVERSITY_CONFIG,
): number[] {
  if (items.length === 0) return [];
  if (items.length <= maxItems) return items.map((_, i) => i);

  const selected: number[] = [];
  const remaining = items.map((item, i) => ({ ...item, originalIndex: i }));

  // First item is always the highest-scored
  selected.push(remaining[0]!.originalIndex);
  remaining.splice(0, 1);

  while (selected.length < maxItems && remaining.length > 0) {
    let bestIdx = -1;
    let bestMmr = -Infinity;

    for (let r = 0; r < remaining.length; r++) {
      const candidate = remaining[r]!;

      // Max similarity to any already-selected item
      let maxSim = 0;
      for (const selIdx of selected) {
        const sim = jaccardSimilarity(
          tokenize(items[selIdx]!.text),
          tokenize(candidate.text),
        );
        if (sim > maxSim) maxSim = sim;
      }

      // MMR score: lambda * relevance - (1 - lambda) * max similarity to selected
      const mmr =
        config.lambda * candidate.totalScore -
        (1 - config.lambda) * maxSim;

      if (mmr > bestMmr) {
        bestMmr = mmr;
        bestIdx = r;
      }
    }

    if (bestIdx >= 0) {
      selected.push(remaining[bestIdx]!.originalIndex);
      remaining.splice(bestIdx, 1);
    } else {
      break;
    }
  }

  return selected;
}

/**
 * Checks whether two items are redundant (same document + high text overlap).
 */
export function areRedundant(
  itemA: { text: string; documentId: string },
  itemB: { text: string; documentId: string },
  config: DiversityConfig = DEFAULT_DIVERSITY_CONFIG,
): boolean {
  if (itemA.documentId !== itemB.documentId) return false;
  const sim = jaccardSimilarity(tokenize(itemA.text), tokenize(itemB.text));
  return sim >= config.redundancyThreshold;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s\u0600-\u06FF]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
