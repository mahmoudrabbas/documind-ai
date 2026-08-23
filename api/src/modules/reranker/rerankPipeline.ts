import type { RetrievalCandidate } from "../retrieval/retrieval.types.js";
import type {
  RerankRequest,
  RerankResponse,
  EvidenceItem,
  EvidenceScoreBreakdown,
  CitationAnchor,
  ConflictGroup,
  SufficiencyAssessment,
} from "./reranker.types.js";
import { EVIDENCE_ITEM_MIN_TOTAL_SCORE } from "./reranker.types.js";
import { selectDiverse, areRedundant, type ScoredItem } from "./diversity.js";
import {
  areEquivalentEvidenceAssertions,
  detectConflicts,
  type ConflictDetectorInput,
} from "./conflictDetector.js";
import { fitWithinBudget, type TokenBudgetItem } from "./tokenBudget.js";

/**
 * Shared reranking pipeline.
 *
 * Every step after relevance scoring — conflict detection, deduplication, MMR
 * diversity selection, token budgeting, sufficiency assessment — is shared
 * pipeline correctness and safety logic. The fake adapter supplies the
 * normalized retrieval relevance signal.
 *
 * Keeping the pipeline here means a provider swap cannot silently change
 * conflict detection or the fail-closed sufficiency contract.
 */

/**
 * Retrieval relevance for a candidate, preferring the normalized relevance the
 * fusion engine computed over the raw fused score.
 *
 * Raw RRF scores sit near 1/(60+rank) — roughly 0.016 to 0.033 — so using them
 * as a 0..1 relevance would push every item under
 * {@link EVIDENCE_ITEM_MIN_TOTAL_SCORE}.
 */
export function retrievalRelevanceOf(candidate: RetrievalCandidate): number {
  return (
    candidate.scoreBreakdown?.relevanceScore ??
    candidate.scoreBreakdown?.fusionScore ??
    candidate.score
  );
}

export function tokenizeForRerank(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s؀-ۿ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

export function computeExactTermScore(
  queryTerms: string[],
  candidateTerms: string[],
): number {
  if (queryTerms.length === 0) return 0;
  const candidateSet = new Set(candidateTerms);
  let matches = 0;
  for (const term of queryTerms) {
    if (candidateSet.has(term)) matches++;
  }
  return matches / queryTerms.length;
}

export function computeSourceAuthority(candidate: RetrievalCandidate): number {
  // Higher authority for public documents (widely accessible)
  const classScores: Record<string, number> = {
    public: 0.8,
    internal: 0.6,
    confidential: 0.5,
    restricted: 0.4,
  };
  return classScores[candidate.classification ?? "internal"] ?? 0.5;
}

export function computeVersionPreference(
  candidate: RetrievalCandidate,
  allCandidates: readonly RetrievalCandidate[],
): number {
  // Boost score if this is the only version or the latest version
  const docVersions = allCandidates
    .filter((c) => c.documentId === candidate.documentId)
    .map((c) => c.documentVersionId);
  const uniqueVersions = new Set(docVersions);
  if (uniqueVersions.size <= 1) return 0.8;
  // If multiple versions, slightly boost the candidate's version
  return 0.5;
}

function buildCitationAnchor(candidate: RetrievalCandidate): CitationAnchor {
  return {
    chunkId: candidate.chunkId,
    documentId: candidate.documentId,
    documentVersionId: candidate.documentVersionId,
    pageNumber: candidate.pageNumber,
    sectionTitle: candidate.sectionTitle,
  };
}

function assessSufficiency(
  items: EvidenceItem[],
  conflictGroups: ConflictGroup[],
): SufficiencyAssessment {
  if (items.length === 0) {
    return {
      level: "NO_EVIDENCE",
      reasons: ["No evidence items after reranking"],
    };
  }
  if (conflictGroups.length > 0) {
    return {
      level: "CONFLICTING",
      reasons: [
        `${conflictGroups.length} conflict group(s) detected`,
        ...conflictGroups.map((g) => g.description),
      ],
    };
  }
  // Sufficiency is decided by the same per-item gate the evidence evaluator
  // applies — does any single item clear EVIDENCE_ITEM_MIN_TOTAL_SCORE — and
  // not by the mean total score crossing 0.5.
  //
  // The mean was wrong on two counts, and both of them refused answers that
  // the bundle actually contained:
  //
  //  1. It was coupled to the provider's score *scale*. A cross-encoder emits
  //     a sharply peaked distribution (a handful of high scores, a long low
  //     tail) where lexical relevance emits a flat mid-range one. Swapping in
  //     a real reranker therefore dropped the average below 0.5 on the very
  //     bundles whose top items had gotten *better*, and because
  //     `evaluate_evidence` approves nothing from a bundle that is not
  //     SUFFICIENT, every question against those documents refused.
  //  2. It punished recall. Admitting more correct-but-lower-scoring items
  //     drags a mean down, so raising `maxItems` to stop truncating the
  //     answer out of the bundle could itself flip SUFFICIENT to WEAK.
  //
  // Counting qualifying items removes both couplings: it is scale-free, it
  // cannot be diluted by additional evidence, and it agrees by construction
  // with the per-item decision made downstream — a bundle is SUFFICIENT
  // exactly when the evaluator would approve something from it.
  const qualifying = items.filter(
    (item) => item.scoreBreakdown.totalScore >= EVIDENCE_ITEM_MIN_TOTAL_SCORE,
  );
  if (qualifying.length > 0) {
    // MMR ordering is not score-descending, so take the maximum rather than
    // the first item.
    const best = Math.max(
      ...qualifying.map((item) => item.scoreBreakdown.totalScore),
    );
    return {
      level: "SUFFICIENT",
      reasons: [
        `${qualifying.length} of ${items.length} item(s) score at or above ` +
          `${EVIDENCE_ITEM_MIN_TOTAL_SCORE} (best ${best.toFixed(3)})`,
      ],
    };
  }
  const bestOverall = Math.max(
    ...items.map((item) => item.scoreBreakdown.totalScore),
  );
  return {
    level: "WEAK",
    reasons: [
      `No item reached ${EVIDENCE_ITEM_MIN_TOTAL_SCORE}; ` +
        `best total score ${bestOverall.toFixed(3)}`,
    ],
  };
}

function buildScoreExplanation(
  items: EvidenceItem[],
  budgetResult: { truncatedCount: number; budgetUsed: number },
  conflictGroups: ConflictGroup[],
): string {
  if (items.length === 0) return "No evidence items";
  const parts = items.map(
    (item) =>
      `#${item.rank} score=${item.scoreBreakdown.totalScore.toFixed(3)} fusion=${item.scoreBreakdown.fusionScore.toFixed(3)} exact=${item.scoreBreakdown.exactTermScore.toFixed(3)}`,
  );
  const summary = `Reranked ${items.length} items (budget used: ${budgetResult.budgetUsed.toFixed(0)}%)`;
  const truncation =
    budgetResult.truncatedCount > 0
      ? ` [${budgetResult.truncatedCount} truncated]`
      : "";
  const conflicts =
    conflictGroups.length > 0 ? ` [${conflictGroups.length} conflict(s)]` : "";
  return `${summary}${truncation}${conflicts}: ${parts.join("; ")}`;
}

/**
 * Runs the provider-independent reranking pipeline.
 *
 * `semanticScores` must be index-aligned with `request.candidates` and
 * expressed on a 0..1 scale; it becomes the `semanticScore` term of each
 * item's score breakdown, carrying 70% of the rerank score and therefore 42%
 * of the total. Retrieval relevance carries the other 40% directly, so with a
 * passthrough provider such as {@link FakeRerankerAdapter} - where the
 * semantic signal *is* retrieval relevance - relevance decides 82% of the
 * total score.
 */
export function runRerankPipeline(
  request: RerankRequest,
  semanticScores: readonly number[],
): RerankResponse {
  const { candidates, queryText, maxItems = 10, maxTokenBudget = 4000 } = request;

  if (candidates.length === 0) {
    return {
      items: [],
      conflictGroups: [],
      sufficiency: {
        level: "NO_EVIDENCE",
        reasons: ["No candidates provided"],
      },
      scoreExplanation: "No candidates to rerank",
    };
  }

  // ── Step 1: Score each candidate ─────────────────────────────────
  const queryTerms = tokenizeForRerank(queryText);
  const scored: ScoredItem[] = [];
  const scoreBreakdowns = new Map<number, EvidenceScoreBreakdown>();

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]!;
    const candidateTerms = tokenizeForRerank(candidate.text);
    const exactTermScore = computeExactTermScore(queryTerms, candidateTerms);
    const semanticScore = semanticScores[i] ?? retrievalRelevanceOf(candidate);
    const sourceAuthorityScore = computeSourceAuthority(candidate);
    const versionPreferenceScore = computeVersionPreference(
      candidate,
      candidates,
    );
    const fusionScore = retrievalRelevanceOf(candidate);
    // Weights, and why exact-term overlap is only a tie-breaker.
    //
    // Nominal weight is not influence: what orders a bundle is how far each
    // signal *varies* across it. Measured on the indexed lecture deck for
    // "how to install MySQL on Linux?", semantic relevance spanned 0.733 to
    // 0.866 (spread 0.133) while exact-term overlap spanned 0.000 to 0.667
    // (spread 0.667). Under the previous 0.5/0.3 split that gave exact-term
    // 0.120 of the total score's spread against relevance's 0.093 - so the
    // crude lexical signal, on a third of the nominal weight, decided the
    // ranking outright. The page answering the question held the 4th-best
    // semantic score (0.830) and came out 12th overall, because it documents
    // `apt-get install mariadb-server` and never repeats the words "MySQL" or
    // "Linux" that pages beating it merely mention.
    //
    // Term overlap is also already counted once, in retrieval: the keyword leg
    // is BM25, which *is* term overlap, and it is fused into `fusionScore`.
    // Re-applying it here counted lexical matching twice and semantics once,
    // which is the opposite of a reranker's job - a reranker exists to correct
    // retrieval's lexical bias, not to amplify it.
    //
    // Relevance therefore carries the ranking and exact-term overlap breaks
    // ties among semantically comparable passages. It is deliberately not
    // dropped to zero: when two passages are equally on-topic, the one that
    // uses the asker's own words is the better citation.
    const rerankScore =
      semanticScore * 0.7 +
      exactTermScore * 0.1 +
      sourceAuthorityScore * 0.1 +
      versionPreferenceScore * 0.1;
    const totalScore = fusionScore * 0.4 + rerankScore * 0.6;

    scoreBreakdowns.set(i, {
      fusionScore,
      rerankScore,
      semanticScore,
      exactTermScore,
      sourceAuthorityScore,
      versionPreferenceScore,
      totalScore,
    });

    scored.push({
      index: i,
      totalScore,
      text: candidate.text,
      documentId: candidate.documentId,
    });
  }

  // ── Step 2: Conflict detection (before dedup so conflicts aren't lost) ──
  const preConflictInputs: ConflictDetectorInput[] = candidates.map((c) => ({
    text: c.text,
    documentId: c.documentId,
    documentVersionId: c.documentVersionId,
    tenantId: c.tenantId,
    sectionTitle: c.sectionTitle,
  }));
  const conflictGroups = detectConflicts(
    preConflictInputs,
    undefined,
    queryText,
  );
  const conflictingIndices = new Set<number>();
  for (const group of conflictGroups) {
    for (const idx of group.itemIndices) {
      conflictingIndices.add(idx);
    }
  }

  // ── Step 3: Deduplication (same doc + high overlap) ──────────────
  // Items in conflict groups are never deduplicated so both sides
  // of a conflict survive into the evidence bundle.
  const dedupedIndices: number[] = [];
  const dedupedSet = new Set<number>();
  for (const item of scored) {
    if (conflictingIndices.has(item.index)) {
      dedupedIndices.push(item.index);
      dedupedSet.add(item.index);
      continue;
    }
    const isDup = dedupedIndices.some((existingIdx) => {
      if (conflictingIndices.has(existingIdx)) return false;
      const existing = scored.find((s) => s.index === existingIdx)!;
      if (areEquivalentEvidenceAssertions(existing.text, item.text)) {
        return true;
      }
      return areRedundant(
        { text: existing.text, documentId: existing.documentId },
        { text: item.text, documentId: item.documentId },
      );
    });
    if (!isDup) {
      dedupedIndices.push(item.index);
      dedupedSet.add(item.index);
    }
  }

  const dedupedScored = scored
    .filter((s) => dedupedSet.has(s.index))
    .sort((a, b) => b.totalScore - a.totalScore);

  // ── Step 4: MMR diversity selection ──────────────────────────────
  const diverseIndices = selectDiverse(dedupedScored, maxItems);

  // ── Step 5: Token budget ─────────────────────────────────────────
  const budgetItems: (TokenBudgetItem & { originalIndex: number })[] =
    diverseIndices.map((divIdx) => {
      const scoredItem = dedupedScored[divIdx]!;
      const candidate = candidates[scoredItem.index]!;
      return {
        text: candidate.text,
        originalIndex: scoredItem.index,
      };
    });

  const budgetResult = fitWithinBudget(budgetItems, {
    maxTokens: maxTokenBudget,
    reservedTokens: 500,
    charsPerToken: 4,
  });

  // ── Step 6: Build evidence items ─────────────────────────────────
  const evidenceItems: EvidenceItem[] = budgetResult.items.map((item, rank) => {
    const candidate = candidates[item.originalIndex]!;
    const breakdown = scoreBreakdowns.get(item.originalIndex)!;
    return {
      rank: rank + 1,
      candidate,
      scoreBreakdown: breakdown,
      citationAnchor: buildCitationAnchor(candidate),
      textExcerpt: item.text,
      expanded: false,
      neighborChunkIds: [],
    };
  });

  // ── Step 7: Sufficiency assessment ───────────────────────────────
  const sufficiency = assessSufficiency(evidenceItems, conflictGroups);

  // ── Step 8: Score explanation ────────────────────────────────────
  const scoreExplanation = buildScoreExplanation(
    evidenceItems,
    budgetResult,
    conflictGroups,
  );

  return {
    items: evidenceItems,
    conflictGroups,
    sufficiency,
    scoreExplanation,
  };
}
