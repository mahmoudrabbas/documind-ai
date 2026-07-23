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

/**
 * FakeRerankerAdapter — deterministic lexical reranker for testing.
 *
 * Scoring is based on exact-term overlap between query and candidate text,
 * combined with the existing fusion score. No LLM or cross-encoder is used.
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

    const queryTerms = this.tokenize(queryText);
    const scored: { candidate: (typeof candidates)[number]; scoreBreakdown: EvidenceScoreBreakdown }[] = [];

    for (const candidate of candidates) {
      const candidateTerms = this.tokenize(candidate.text);
      const exactTermScore = this.computeExactTermScore(queryTerms, candidateTerms);
      const semanticScore = candidate.scoreBreakdown?.fusionScore ?? candidate.score;
      const sourceAuthorityScore = 0.5;
      const versionPreferenceScore = 0.5;
      const fusionScore = candidate.scoreBreakdown?.fusionScore ?? candidate.score;
      const rerankScore = semanticScore * 0.5 + exactTermScore * 0.3 + sourceAuthorityScore * 0.1 + versionPreferenceScore * 0.1;
      const totalScore = fusionScore * 0.4 + rerankScore * 0.6;

      scored.push({
        candidate,
        scoreBreakdown: {
          fusionScore,
          rerankScore,
          semanticScore,
          exactTermScore,
          sourceAuthorityScore,
          versionPreferenceScore,
          totalScore,
        },
      });
    }

    scored.sort((a, b) => b.scoreBreakdown.totalScore - a.scoreBreakdown.totalScore);

    const deduplicated = this.deduplicate(scored, 0.85);
    const truncated = deduplicated.slice(0, maxItems);

    let tokenCount = 0;
    const withinBudget: typeof truncated = [];
    for (const item of truncated) {
      const estTokens = this.estimateTokens(item.candidate.text);
      if (tokenCount + estTokens > maxTokenBudget) break;
      tokenCount += estTokens;
      withinBudget.push(item);
    }

    const items: EvidenceItem[] = withinBudget.map((item, index) => ({
      rank: index + 1,
      candidate: item.candidate,
      scoreBreakdown: item.scoreBreakdown,
      citationAnchor: this.buildCitationAnchor(item.candidate),
      textExcerpt: item.candidate.text,
    }));

    const conflictGroups = this.detectConflicts(items);
    const sufficiency = this.assessSufficiency(items, conflictGroups);

    const scoreExplanation = this.buildScoreExplanation(items);

    return {
      items,
      conflictGroups,
      sufficiency,
      scoreExplanation,
    };
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s\u0600-\u06FF]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }

  private computeExactTermScore(queryTerms: string[], candidateTerms: string[]): number {
    if (queryTerms.length === 0) return 0;
    const candidateSet = new Set(candidateTerms);
    let matches = 0;
    for (const term of queryTerms) {
      if (candidateSet.has(term)) matches++;
    }
    return matches / queryTerms.length;
  }

  private deduplicate(
    items: { candidate: RetrievalCandidate; scoreBreakdown: EvidenceScoreBreakdown }[],
    threshold: number,
  ): { candidate: RetrievalCandidate; scoreBreakdown: EvidenceScoreBreakdown }[] {
    const kept: typeof items = [];
    for (const item of items) {
      const isDuplicate = kept.some((existing) => {
        if (existing.candidate.documentId === item.candidate.documentId) {
          const similarity = this.jaccardSimilarity(
            this.tokenize(existing.candidate.text),
            this.tokenize(item.candidate.text),
          );
          return similarity >= threshold;
        }
        return false;
      });
      if (!isDuplicate) kept.push(item);
    }
    return kept;
  }

  private jaccardSimilarity(a: string[], b: string[]): number {
    const setA = new Set(a);
    const setB = new Set(b);
    let intersection = 0;
    for (const word of setA) {
      if (setB.has(word)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  private buildCitationAnchor(candidate: RetrievalCandidate): CitationAnchor {
    return {
      chunkId: candidate.chunkId,
      documentId: candidate.documentId,
      documentVersionId: candidate.documentVersionId,
      pageNumber: candidate.pageNumber,
      sectionTitle: candidate.sectionTitle,
    };
  }

  private detectConflicts(items: EvidenceItem[]): ConflictGroup[] {
    const conflicts: ConflictGroup[] = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (items[i].candidate.documentId !== items[j].candidate.documentId) continue;
        const termsA = new Set(this.tokenize(items[i].textExcerpt));
        const termsB = new Set(this.tokenize(items[j].textExcerpt));
        const negationTerms = ["not", "no", "never", "must", "shall", "should", "cannot", "لا", "يجب", "غير"];
        const hasNegationA = [...termsA].some((t) => negationTerms.includes(t));
        const hasNegationB = [...termsB].some((t) => negationTerms.includes(t));
        if (hasNegationA !== hasNegationB) {
          const overlap = this.jaccardSimilarity([...termsA], [...termsB]);
          if (overlap > 0.3) {
            conflicts.push({
              conflictId: `conflict-${i}-${j}`,
              description: `Chunks ${i + 1} and ${j + 1} from the same document have opposing statements`,
              itemIndices: [i, j],
            });
          }
        }
      }
    }
    return conflicts;
  }

  private assessSufficiency(items: EvidenceItem[], conflictGroups: ConflictGroup[]): SufficiencyAssessment {
    if (items.length === 0) {
      return { level: "NO_EVIDENCE", reasons: ["No evidence items after reranking"] };
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
    const avgScore = items.reduce((sum, item) => sum + item.scoreBreakdown.totalScore, 0) / items.length;
    if (avgScore >= 0.5) {
      return { level: "SUFFICIENT", reasons: [`Average score ${avgScore.toFixed(3)} indicates strong evidence`] };
    }
    if (avgScore >= 0.25) {
      return { level: "WEAK", reasons: [`Average score ${avgScore.toFixed(3)} indicates weak evidence`] };
    }
    return { level: "WEAK", reasons: [`Average score ${avgScore.toFixed(3)} is below weak threshold`] };
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private buildScoreExplanation(items: EvidenceItem[]): string {
    if (items.length === 0) return "No evidence items";
    const parts = items.map(
      (item) =>
        `#${item.rank} score=${item.scoreBreakdown.totalScore.toFixed(3)} fusion=${item.scoreBreakdown.fusionScore.toFixed(3)} exact=${item.scoreBreakdown.exactTermScore.toFixed(3)}`,
    );
    return `Reranked ${items.length} items: ${parts.join("; ")}`;
  }
}
