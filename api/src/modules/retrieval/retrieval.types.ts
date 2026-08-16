import type { BaseRole } from "../../common/auth/baseRoles.js";
import type { PermissionScopes } from "../permissions/permissions.types.js";

export type RetrievalMethod = "vector" | "keyword" | "hybrid";

export interface RetrievalFilter {
  documentIds?: string[];
  categories?: string[];
  departments?: string[];
  classifications?: string[];
  dateFrom?: string;
  dateTo?: string;
  versionIds?: string[];
}

export interface RetrievalQuery {
  queryText: string;
  queryVector?: number[];
  /**
   * Additional semantic query texts to embed and vector-search (e.g.
   * cross-lingual translations of the primary query). Each variant runs a
   * vector search; per-chunk the best score wins. Capped internally at 3.
   */
  queryVariants?: string[];
  /**
   * Exact lexical anchors from the query plan. Retrieval deliberately gives
   * this class a bounded keyword-search slot when keyword plans also exist.
   */
  exactTerms?: string[];
  /**
   * Generated keyword-search texts besides `queryText`. Retrieval balances
   * this class with exact terms; per-chunk the best score wins.
   */
  keywordTexts?: string[];
  topK: number;
  filter?: RetrievalFilter;
}

export interface AccessContext {
  tenantId: string;
  actorId: string;
  actorEmail?: string | null;
  baseRole: BaseRole;
  permissionScopes?: PermissionScopes;
  customRoleId?: string | null;
  departmentIds?: string[];
  /**
   * Department names resolved server-side from the DOCUMENTS_USE_IN_AI grant
   * scope's `departmentIds` (ObjectIds) to `DepartmentModel.name` text values,
   * so they can be compared against the `department` field stored on
   * document/chunk records.
   *
   * Populated by `resolveAccessContext` in `app.ts`.
   * `undefined` = no department restriction.
   * `[]` = fail-closed (restrictive scope failed resolution; match nothing).
   * `['HR', 'IT']` = restrict to those departments.
   */
  resolvedDepartmentFilter?: string[] | null;
  /**
   * Category names resolved server-side from the DOCUMENTS_USE_IN_AI grant
   * scope's `documentCategories` (canonical taxonomy names) to the display
   * names AND normalized names of the tenant-scoped active DocumentCategory
   * records they resolve to, so they can be compared against the `category`
   * field stored on document/chunk records.
   *
   * Populated by `resolveAccessContext` in `app.ts`.
   * `undefined` = no category restriction.
   * `[]` = fail-closed (restrictive scope failed resolution; match nothing).
   * `['Finance', 'finance']` = restrict to that canonical category.
   */
  resolvedCategoryFilter?: string[] | null;
  /**
   * Sensitivity levels resolved from canonical classification scope names for
   * datastore prefiltering. Exact identity is reauthorized against the parent
   * document before content is returned.
   */
  resolvedClassificationFilter?: string[] | null;
  /**
   * Trusted request trace ID supplied by the caller (chat turn, debug route).
   * Production retrieval must propagate this value through diagnostics, audit,
   * and evidence events; it never generates a replacement UUID when present.
   */
  traceId?: string;
  /** Retrieval always resolves and enforces this server-side; callers cannot downgrade it. */
  requiredAction?: "use_in_ai";
}

/**
 * Typed, machine-readable retrieval outcome. Distinguishes the four
 * zero/decline situations that previously collapsed into one user-visible
 * refusal: authorization restriction, no similar content, and lifecycle
 * ineligibility.
 */
export type RetrievalOutcome =
  | "AUTHORIZED_RESULTS"
  | "NO_AUTHORIZED_DOCUMENTS"
  | "NO_SEARCH_MATCHES"
  | "NO_RETRIEVABLE_CONTENT";

export interface ScoreBreakdown {
  vectorScore?: number;
  keywordScore?: number;
  fusionScore: number;
  /**
   * Provider relevance on a stable [0, 1] scale. RRF fusionScore is a rank
   * value (~0.01) and must not be interpreted as semantic confidence.
   */
  relevanceScore?: number;
}

export interface RetrievalCandidate {
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  tenantId: string;
  text: string;
  score: number;
  pageNumber?: number;
  sectionTitle?: string;
  classification?: string;
  retrievalMethod: RetrievalMethod;
  scoreBreakdown?: ScoreBreakdown;
}

export interface FilterSummary {
  tenantFilter: boolean;
  roleFilter: string;
  permissionScopes: string[];
  explicitFilters: string[];
  versionFilter: boolean;
}

export interface RetrievalDiagnostics {
  vectorLatencyMs?: number;
  keywordLatencyMs?: number;
  fusionLatencyMs?: number;
  totalLatencyMs: number;
  vectorCandidateCount: number;
  keywordCandidateCount: number;
  rawVectorCandidateCount?: number;
  rawKeywordCandidateCount?: number;
  postAuthorizationVectorCandidateCount?: number;
  postAuthorizationKeywordCandidateCount?: number;
  /** True only when actor authorization removed otherwise tenant-matching candidates. */
  authorizationFiltered?: boolean;
  fusedCandidateCount?: number;
  hydratedCandidateCount?: number;
  evidenceItemCount?: number;
  evidenceSufficiency?: string;
  /** First sufficiency reason from the evidence bundle; never contains chunk text. */
  evidenceSufficiencyReason?: string;
  /** Evidence items meeting the reranker approval threshold. */
  approvedEvidenceCount?: number;
  /** Evidence items below the reranker approval threshold. */
  rejectedEvidenceCount?: number;
  zeroCandidateReason?: string;
  /** Typed outcome distinguishing authorization restriction from no content. */
  retrievalOutcome?: RetrievalOutcome;
  /** True when actor authorization removed otherwise tenant-matching candidates. */
  authorizationRestricted?: boolean;
  traceId: string;
}

export interface RetrievalResult {
  candidates: RetrievalCandidate[];
  totalCandidates: number;
  filterSummary: FilterSummary;
  diagnostics: RetrievalDiagnostics;
  evidenceBundle?: import("../reranker/reranker.types.js").EvidenceBundle;
}

export interface ScoreStrategy {
  method: RetrievalMethod;
  weight: number;
}

export interface FusionConfig {
  strategies: ScoreStrategy[];
  rrfK: number;
  minScore?: number;
  maxCandidates: number;
}
