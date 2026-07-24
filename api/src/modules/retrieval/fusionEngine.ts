import type {
  FusionConfig,
  RetrievalMethod,
  RetrievalCandidate,
  ScoreBreakdown,
} from "./retrieval.types.js";

export class FusionEngine {
  private readonly config: FusionConfig;

  constructor(config?: Partial<FusionConfig>) {
    this.config = {
      strategies: config?.strategies ?? [
        { method: "vector", weight: 1 },
        { method: "keyword", weight: 1 },
      ],
      rrfK: config?.rrfK ?? 60,
      minScore: config?.minScore,
      maxCandidates: config?.maxCandidates ?? 50,
    };
  }

  /**
   * Fuse multiple retrieval result lists using Reciprocal Rank Fusion.
   *
   * For each result list, each item at rank `i` (0-indexed) receives an RRF score
   * of `weight / (rrfK + i + 1)`. Scores for the same `chunkId` are summed
   * across all strategies. Candidates are sorted descending by total score,
   * optionally filtered by `minScore`, and capped at `maxCandidates`.
   *
   * @param results - Map of retrieval method to its scored results
   * @returns Fused and ranked candidates
   */
  fuse(
    results: Map<RetrievalMethod, { chunkId: string; score: number }[]>,
  ): RetrievalCandidate[] {
    const activeMethods = [...results.entries()].filter(
      ([, items]) => items.length > 0,
    );

    // Passthrough: when only one strategy contributed, skip fusion overhead
    if (activeMethods.length <= 1) {
      if (activeMethods.length === 0) return [];
      const [method, items] = activeMethods[0];
      return items.slice(0, this.config.maxCandidates).map((item) => ({
        chunkId: item.chunkId,
        documentId: "",
        documentVersionId: "",
        tenantId: "",
        text: "",
        score: item.score,
        retrievalMethod: method,
        scoreBreakdown: {
          fusionScore: item.score,
          ...(method === "vector"
            ? { vectorScore: item.score }
            : {}),
          ...(method === "keyword"
            ? { keywordScore: item.score }
            : {}),
        } satisfies ScoreBreakdown,
      }));
    }

    // RRF score accumulation per chunkId across all strategies
    type ScoreAccumulator = {
      total: number;
      vectorScore: number;
      keywordScore: number;
    };

    const accumulator = new Map<string, ScoreAccumulator>();

    for (const [method, items] of results.entries()) {
      const strategy = this.config.strategies.find(
        (s) => s.method === method,
      );
      const weight = strategy?.weight ?? 1;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const rank = i + 1; // RRF uses 1-indexed rank
        const rrfScore = weight / (this.config.rrfK + rank);

        const entry = accumulator.get(item.chunkId);
        if (entry) {
          entry.total += rrfScore;
          if (method === "vector") entry.vectorScore += rrfScore;
          if (method === "keyword") entry.keywordScore += rrfScore;
        } else {
          accumulator.set(item.chunkId, {
            total: rrfScore,
            vectorScore: method === "vector" ? rrfScore : 0,
            keywordScore: method === "keyword" ? rrfScore : 0,
          });
        }
      }
    }

    // Convert accumulators to candidates, sort, filter, and cap
    let candidates = [...accumulator.entries()]
      .map(([chunkId, acc]) => ({
        chunkId,
        documentId: "",
        documentVersionId: "",
        tenantId: "",
        text: "",
        score: acc.total,
        retrievalMethod: "hybrid" as RetrievalMethod,
        scoreBreakdown: {
          fusionScore: acc.total,
          ...(acc.vectorScore > 0
            ? { vectorScore: acc.vectorScore }
            : {}),
          ...(acc.keywordScore > 0
            ? { keywordScore: acc.keywordScore }
            : {}),
        } satisfies ScoreBreakdown,
      }))
      .sort((a, b) => b.score - a.score);

    if (this.config.minScore !== undefined) {
      candidates = candidates.filter(
        (c) => c.score >= this.config.minScore!,
      );
    }

    return candidates.slice(0, this.config.maxCandidates);
  }
}
