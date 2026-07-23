/**
 * Retrieval DTOs — request/response type definitions.
 *
 * Currently re-exports domain types directly. DTOs exist as an explicit
 * boundary so API-specific transformations can be added later without
 * leaking internal domain shapes into route handlers.
 */

// ── Request DTOs ──────────────────────────────────────────────────────

export interface HybridSearchRequestDTO {
  queryText: string;
  topK?: number;
  filter?: {
    documentIds?: string[];
    categories?: string[];
    departments?: string[];
    classifications?: string[];
    dateFrom?: string;
    dateTo?: string;
    versionIds?: string[];
  };
}

export interface DebugSearchRequestDTO extends HybridSearchRequestDTO {
  debug: true;
}

// ── Response DTOs — re-export domain types ─────────────────────────────

export type {
  RetrievalResult,
  RetrievalCandidate,
  RetrievalDiagnostics,
  FilterSummary,
  ScoreBreakdown,
} from "./retrieval.types.js";

export type {
  EvidenceBundle,
  EvidenceItem,
  EvidenceScoreBreakdown,
  CitationAnchor,
  ConflictGroup,
  SufficiencyAssessment,
  SufficiencyLevel,
} from "../reranker/reranker.types.js";
