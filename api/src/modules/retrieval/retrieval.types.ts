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
  topK: number;
  filter?: RetrievalFilter;
}

export interface AccessContext {
  tenantId: string;
  actorId: string;
  baseRole: BaseRole;
  permissionScopes?: PermissionScopes;
  customRoleId?: string | null;
}

export interface ScoreBreakdown {
  vectorScore?: number;
  keywordScore?: number;
  fusionScore: number;
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
  traceId: string;
}

export interface RetrievalResult {
  candidates: RetrievalCandidate[];
  totalCandidates: number;
  filterSummary: FilterSummary;
  diagnostics: RetrievalDiagnostics;
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
