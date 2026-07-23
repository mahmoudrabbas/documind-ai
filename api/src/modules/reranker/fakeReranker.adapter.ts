import type { RetrievalCandidate } from "../retrieval/retrieval.types.js";
import type {
  RerankerAdapter,
  RerankRequest,
  RerankResponse,
  EvidenceItem,
  EvidenceScoreBreakdown,
  CitationAnchor,
  ConflictGroup,
  SufficiencyAssessment,
} from "./reranker.types.js";
import { selectDiverse, areRedundant, type ScoredItem } from "./diversity.js";
import {
  detectConflicts,
  type ConflictDetectorInput,
} from "./conflictDetector.js";
import {
  fitWithinBudget,
  type TokenBudgetItem,
} from "./tokenBudget.js";

/**
 * FakeRerankerAdapter — deterministic lexical reranker for testing.
 *
 * Phase 2 features:
 * - MMR-based diversity scoring to avoid redundant adjacent chunks
 * - Conflict detection (negation, value contradictions, version conflicts)
 * - Token budgeting with safe-boundary truncation
 * - Neighbor expansion for clauses and tables
 * - Deduplication within same document
 *
 * This adapter satisfies the RerankerAdapter port and can be replaced by a
 * production cross-encoder reranker without changing consumers.
 */
export class FakeRerankerAdapter implements RerankerAdapter {
  readonly providerKey = "fake";

  async rerank(request: RerankRequest): Promise<RerankResponse> {
    const { candidates, queryText, maxItems = 10, maxTokenBudget = 4000 } = request;

    if (candidates.length === 0) {
      return {
        items: [],
        conflictGroups: [],
        sufficiency: { level: "NO_EVIDENCE", reasons: ["No candidates provided"] },
        scoreExplanation: "No candidates to rerank",
      };
    }

    // ── Step 1: Score each candidate ─────────────────────────────────
    const queryTerms = this.tokenize(queryText);
    const scored: ScoredItem[] = [];
    const scoreBreakdowns = new Map<number, EvidenceScoreBreakdown>();

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i]!;
      const candidateTerms = this.tokenize(candidate.text);
      const exactTermScore = this.computeExactTermScore(queryTerms, candidateTerms);
      const semanticScore = candidate.scoreBreakdown?.fusionScore ?? candidate.score;
      const sourceAuthorityScore = this.computeSourceAuthority(candidate);
      const versionPreferenceScore = this.computeVersionPreference(candidate, candidates);
      const fusionScore = candidate.scoreBreakdown?.fusionScore ?? candidate.score;
      const rerankScore =
        semanticScore * 0.5 +
        exactTermScore * 0.3 +
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
    const preConflictInputs: ConflictDetectorInput[] = candidates.map(
      (c) => ({
        text: c.text,
        documentId: c.documentId,
        documentVersionId: c.documentVersionId,
        sectionTitle: c.sectionTitle,
      }),
    );
    const conflictGroups = detectConflicts(preConflictInputs);
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
    const evidenceItems: EvidenceItem[] = budgetResult.items.map(
      (item, rank) => {
        const candidate = candidates[item.originalIndex]!;
        const breakdown = scoreBreakdowns.get(item.originalIndex)!;
        return {
          rank: rank + 1,
          candidate,
          scoreBreakdown: breakdown,
          citationAnchor: this.buildCitationAnchor(candidate),
          textExcerpt: item.text,
          expanded: false,
          neighborChunkIds: [],
        };
      },
    );

    // ── Step 7: Sufficiency assessment ───────────────────────────────
    const sufficiency = this.assessSufficiency(evidenceItems, conflictGroups);

    // ── Step 8: Score explanation ────────────────────────────────────
    const scoreExplanation = this.buildScoreExplanation(
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

  // ── Scoring helpers ──────────────────────────────────────────────────

  private computeExactTermScore(
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

  private computeSourceAuthority(candidate: RetrievalCandidate): number {
    // Higher authority for public documents (widely accessible)
    const classScores: Record<string, number> = {
      public: 0.8,
      internal: 0.6,
      confidential: 0.5,
      restricted: 0.4,
    };
    return classScores[candidate.classification ?? "internal"] ?? 0.5;
  }

  private computeVersionPreference(
    candidate: RetrievalCandidate,
    allCandidates: RetrievalCandidate[],
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

  // ── Deduplication ────────────────────────────────────────────────────

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s\u0600-\u06FF]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }

  // ── Citation anchor ──────────────────────────────────────────────────

  private buildCitationAnchor(candidate: RetrievalCandidate): CitationAnchor {
    return {
      chunkId: candidate.chunkId,
      documentId: candidate.documentId,
      documentVersionId: candidate.documentVersionId,
      pageNumber: candidate.pageNumber,
      sectionTitle: candidate.sectionTitle,
    };
  }

  // ── Sufficiency ──────────────────────────────────────────────────────

  private assessSufficiency(
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
    const avgScore =
      items.reduce((sum, item) => sum + item.scoreBreakdown.totalScore, 0) /
      items.length;
    if (avgScore >= 0.5) {
      return {
        level: "SUFFICIENT",
        reasons: [
          `Average score ${avgScore.toFixed(3)} indicates strong evidence`,
        ],
      };
    }
    if (avgScore >= 0.25) {
      return {
        level: "WEAK",
        reasons: [
          `Average score ${avgScore.toFixed(3)} indicates weak evidence`,
        ],
      };
    }
    return {
      level: "WEAK",
      reasons: [
        `Average score ${avgScore.toFixed(3)} is below weak threshold`,
      ],
    };
  }

  // ── Score explanation ────────────────────────────────────────────────

  private buildScoreExplanation(
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
      conflictGroups.length > 0
        ? ` [${conflictGroups.length} conflict(s)]`
        : "";
    return `${summary}${truncation}${conflicts}: ${parts.join("; ")}`;
  }
}
