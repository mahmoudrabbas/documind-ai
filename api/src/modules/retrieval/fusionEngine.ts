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

  get runtimeIdentity() {
    return Object.freeze({
      strategy: "reciprocal-rank-fusion",
      version: `rrf-k${this.config.rrfK}-v1`,
      weights: Object.freeze(Object.fromEntries(
        this.config.strategies.map((entry) => [entry.method, entry.weight]),
      )),
    });
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
      // Scaled the same way as a fused leg: a keyword-only result list is
      // BM25-scaled and would otherwise saturate every hit at 1.0 here too.
      const scaleRelevance = this.legRelevanceScaler(items);
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
          relevanceScore: scaleRelevance(item.score),
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
      relevanceScore: number;
      /**
       * Vector similarity, when the vector leg returned this chunk. `null`
       * means no semantic similarity was ever measured for it.
       */
      measuredRelevance: number | null;
      /** Strongest leg-normalized keyword relevance seen for this chunk. */
      keywordRelevance: number;
    };

    const accumulator = new Map<string, ScoreAccumulator>();

    for (const [method, items] of results.entries()) {
      const strategy = this.config.strategies.find(
        (s) => s.method === method,
      );
      const weight = strategy?.weight ?? 1;
      const scaleRelevance = this.legRelevanceScaler(items);

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const rank = i + 1; // RRF uses 1-indexed rank
        const rrfScore = weight / (this.config.rrfK + rank);
        const legRelevance = scaleRelevance(item.score);

        const entry = accumulator.get(item.chunkId) ?? {
          total: 0,
          vectorScore: 0,
          keywordScore: 0,
          relevanceScore: 0,
          measuredRelevance: null,
          keywordRelevance: 0,
        };
        entry.total += rrfScore;
        if (method === "vector") {
          entry.vectorScore += rrfScore;
          // Vector similarity is the only leg that measures semantic
          // relevance, so it is recorded as such rather than merged with the
          // keyword signal.
          entry.measuredRelevance = legRelevance;
        } else {
          if (method === "keyword") entry.keywordScore += rrfScore;
          entry.keywordRelevance = Math.max(entry.keywordRelevance, legRelevance);
        }
        accumulator.set(item.chunkId, entry);
      }
    }

    this.resolveRelevanceScores(accumulator);

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
          relevanceScore: acc.relevanceScore,
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

  private normalizeProviderScore(score: number): number {
    if (!Number.isFinite(score) || score <= 0) return 0;
    return Math.min(1, score);
  }

  /**
   * Builds a 0..1 relevance scaler for one retrieval leg.
   *
   * The two legs do not share a scale. Atlas `vectorSearchScore` is a true
   * similarity already inside 0..1, while Atlas Search `searchScore` is a
   * BM25-style relevance with no upper bound that routinely exceeds 1 on a
   * multi-term query. Clamping both with `min(1, score)` is not normalization
   * but saturation, and it inverted the ranking outright: every keyword hit
   * above 1 collapsed onto exactly 1.0, so a whole band of chunks tied at a
   * perfect relevance and their relative order fell to the remaining 30% of
   * the rerank formula. A chunk the vector leg had actually measured then
   * received its honest fractional cosine, which ranked it *below* the
   * saturated ties - being semantically retrieved became a penalty. Measured
   * on the indexed lecture deck, the page answering "how to install mysql in
   * linux" (cosine 0.679, rank 2 of 60) was pushed to evidence rank 18 while
   * page 1 of an unrelated CV (cosine 0.343, rank 51 of 60) was promoted to
   * rank 1.
   *
   * A leg whose scores already lie inside 0..1 is therefore left untouched -
   * rescaling it would inflate its best hit to a perfect 1.0 and defeat the
   * absolute-scale evidence gate, which has to be able to conclude that
   * nothing retrieved was relevant. An unbounded leg is divided by its own
   * maximum, which is monotone and so rank-preserving within that leg.
   */
  private legRelevanceScaler(
    items: readonly { score: number }[],
  ): (score: number) => number {
    let max = 0;
    for (const item of items) {
      if (Number.isFinite(item.score) && item.score > max) max = item.score;
    }
    if (max <= 1) return (score) => this.normalizeProviderScore(score);
    return (score) =>
      Number.isFinite(score) && score > 0
        ? Math.min(1, score / max)
        : 0;
  }

  /**
   * Resolves each chunk's semantic `relevanceScore` from the two signals.
   *
   * A measured vector similarity always wins. A chunk seen only by the keyword
   * leg has no measured similarity at all - BM25 relevance says a term
   * occurred, not that the passage answers the question - so the unmeasured
   * chunks are held at or below the weakest similarity that *was* measured in
   * this same fused set. That keeps them in the pool and still ranked by RRF
   * rank agreement, without letting an unmeasured term match displace a
   * passage whose similarity was actually computed. With no vector leg at all
   * there is nothing to be unfair to, so the keyword relevance stands.
   *
   * Two details matter, and each is a bug if got wrong:
   *
   *  - The band is imposed by scaling the whole unmeasured group, not by
   *    clamping each score with `min`. A clamp is the same saturation bug one
   *    level down: every hit above the ceiling would collapse onto the ceiling
   *    and tie, losing the leg's internal ordering. Scaling is monotone, so
   *    that ordering survives.
   *  - The scaling is applied only when the group would otherwise reach above
   *    the ceiling. Scaling unconditionally would push keyword scores that
   *    already sit below the measured floor further down for no reason, which
   *    is a second distortion rather than a correction.
   */
  private resolveRelevanceScores(
    accumulator: Map<
      string,
      {
        relevanceScore: number;
        measuredRelevance: number | null;
        keywordRelevance: number;
      }
    >,
  ): void {
    let weakestMeasured = Number.POSITIVE_INFINITY;
    let strongestUnmeasured = 0;
    for (const entry of accumulator.values()) {
      if (entry.measuredRelevance === null) {
        if (entry.keywordRelevance > strongestUnmeasured) {
          strongestUnmeasured = entry.keywordRelevance;
        }
      } else if (entry.measuredRelevance < weakestMeasured) {
        weakestMeasured = entry.measuredRelevance;
      }
    }
    const ceiling = Number.isFinite(weakestMeasured) ? weakestMeasured : 1;
    const scale =
      strongestUnmeasured > ceiling ? ceiling / strongestUnmeasured : 1;
    for (const entry of accumulator.values()) {
      entry.relevanceScore =
        entry.measuredRelevance ?? entry.keywordRelevance * scale;
    }
  }
}
