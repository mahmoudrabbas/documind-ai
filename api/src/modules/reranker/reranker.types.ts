import type { RetrievalCandidate } from "../retrieval/retrieval.types.js";

// ---------------------------------------------------------------------------
// Sufficiency assessment
// ---------------------------------------------------------------------------

export type SufficiencyLevel =
  | "SUFFICIENT"
  | "WEAK"
  | "CONFLICTING"
  | "NO_EVIDENCE";

export interface SufficiencyAssessment {
  level: SufficiencyLevel;
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Evidence item — a single ranked chunk with scoring explanation
// ---------------------------------------------------------------------------

export interface EvidenceScoreBreakdown {
  fusionScore: number;
  rerankScore: number;
  semanticScore: number;
  exactTermScore: number;
  sourceAuthorityScore: number;
  versionPreferenceScore: number;
  totalScore: number;
}

export interface CitationAnchor {
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  pageNumber?: number;
  sectionTitle?: string;
}

export interface EvidenceItem {
  rank: number;
  candidate: RetrievalCandidate;
  scoreBreakdown: EvidenceScoreBreakdown;
  citationAnchor: CitationAnchor;
  textExcerpt: string;
  /** Whether this item was expanded with neighbor context. */
  expanded?: boolean;
  /** Neighbor items added for context (if any). */
  neighborChunkIds?: string[];
}

// ---------------------------------------------------------------------------
// Conflict group — chunks that contradict each other
// ---------------------------------------------------------------------------

export interface ConflictGroup {
  conflictId: string;
  description: string;
  itemIndices: number[];
}

// ---------------------------------------------------------------------------
// Evidence bundle — the final output of reranking
// ---------------------------------------------------------------------------

export interface EvidenceBundle {
  items: EvidenceItem[];
  totalTokenCount: number;
  maxTokenCount: number;
  inputCandidateCount: number;
  conflictGroups: ConflictGroup[];
  sufficiency: SufficiencyAssessment;
  scoreExplanation: string;
  accessPolicyVersion: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Reranker port — provider-neutral interface
// ---------------------------------------------------------------------------

export interface RerankRequest {
  candidates: RetrievalCandidate[];
  queryText: string;
  maxItems?: number;
  maxTokenBudget?: number;
}

export interface RerankResponse {
  items: EvidenceItem[];
  conflictGroups: ConflictGroup[];
  sufficiency: SufficiencyAssessment;
  scoreExplanation: string;
  /** True when the reranker fell back to a deterministic path due to provider failure. */
  fallbackUsed?: boolean;
}

export interface RerankerAdapter {
  readonly providerKey: string;
  readonly runtimeIdentity?: import("../agents/agents.types.js").RuntimeComponentIdentity;
  rerank(request: RerankRequest): Promise<RerankResponse>;
}

// ---------------------------------------------------------------------------
// Reranker configuration
// ---------------------------------------------------------------------------

export interface RerankerConfig {
  maxItems: number;
  maxTokenBudget: number;
  deduplicationThreshold: number;
  conflictSimilarityThreshold: number;
}

export const DEFAULT_RERANKER_CONFIG: RerankerConfig = {
  // 10 truncated the bundle below the point where the answer survived: a
  // question whose answer sat on one page of a 58-chunk document had that page
  // ranked 11th and dropped, so `evaluate_evidence` rejected it and the answer
  // writer correctly reported insufficient evidence. The budget rises with the
  // count so the extra items are not immediately trimmed again.
  maxItems: 20,
  maxTokenBudget: 8000,
  deduplicationThreshold: 0.85,
  conflictSimilarityThreshold: 0.3,
};

/**
 * Minimum per-item `totalScore` for an evidence item to be considered
 * supportive within a SUFFICIENT bundle.
 *
 * Items below this floor are weak tail matches that must never reach
 * generation context, persistence, or citations. NaN/Infinity/non-numeric
 * scores are never supportive.
 *
 * Range: [0, 1] (reranker totalScore is a weighted combination of fusion,
 * rerank, and semantic scores, each in [0, 1]).
 * Boundary: >= 0.25 is supportive; < 0.25 is weak/rejected.
 */
export const EVIDENCE_ITEM_MIN_TOTAL_SCORE = 0.25;

/**
 * Returns true when the bundle contains enough evidence to support
 * answer generation and citations.
 *
 * Only SUFFICIENT bundles pass. NO_EVIDENCE, WEAK, and CONFLICTING
 * bundles are treated as insufficient — fail closed.
 */
export function isSufficientBundle(bundle: EvidenceBundle): boolean {
  return bundle.sufficiency.level === "SUFFICIENT";
}
