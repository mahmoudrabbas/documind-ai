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
}

export interface RerankerAdapter {
  readonly providerKey: string;
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
  maxItems: 10,
  maxTokenBudget: 4000,
  deduplicationThreshold: 0.85,
  conflictSimilarityThreshold: 0.3,
};
