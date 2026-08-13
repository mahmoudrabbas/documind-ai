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
   * Additional keyword-search texts besides `queryText` (e.g. translated
   * terms). Each text runs an `$text` search; per-chunk the best score wins.
   * Capped internally at 3.
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
  /** Retrieval always resolves and enforces this server-side; callers cannot downgrade it. */
  requiredAction?: "use_in_ai";
}

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
  fusedCandidateCount?: number;
  hydratedCandidateCount?: number;
  evidenceItemCount?: number;
  evidenceSufficiency?: string;
  zeroCandidateReason?: string;
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
