import { ApiError, api } from "@/lib/api-client";
import type {
  ActivePolicyResponse, BatchApplyResponse, BatchExpectedPolicy, BatchPreviewResponse,
  EffectiveAccessResponse, PolicyApplyResponse, PolicyDraft, PolicyErrorKind,
  PolicyHistoryResponse, PolicyAssignmentsResponse, PolicyPreviewResponse,
  PropagationStatusResponse, TaxonomyKind, TaxonomyListResponse,
  TaxonomyMutationResponse, TaxonomyCreateInput, TaxonomyUpdateInput,
} from "@/types/api/document-policy.types";

const POLICY_ERROR_CODES: Record<string, PolicyErrorKind> = {
  DOCUMENT_POLICY_VERSION_CONFLICT: "version_conflict",
  DOCUMENT_POLICY_PREVIEW_EXPIRED: "preview_expired",
  DOCUMENT_POLICY_PREVIEW_INVALID: "preview_invalid",
  DOCUMENT_POLICY_PREVIEW_MISMATCH: "preview_mismatch",
  DOCUMENT_POLICY_SENSITIVE_CONFIRMATION_REQUIRED: "sensitive_confirmation",
  DOCUMENT_POLICY_IDEMPOTENCY_CONFLICT: "idempotency_conflict",
  DOCUMENT_POLICY_DRAFT_INVALID: "invalid_draft",
  DOCUMENT_POLICY_REFERENCE_INVALID: "invalid_reference",
  DOCUMENT_POLICY_INHERITANCE_INVALID: "invalid_inheritance",
  DOCUMENT_POLICY_BATCH_LIMIT_EXCEEDED: "batch_limit",
  DOCUMENT_CATEGORY_DUPLICATE: "taxonomy_duplicate",
  DEPARTMENT_DUPLICATE: "taxonomy_duplicate",
  DOCUMENT_CLASSIFICATION_DUPLICATE: "taxonomy_duplicate",
  TAXONOMY_RECORD_ARCHIVED: "taxonomy_archived",
};

export function classifyPolicyError(error: unknown): PolicyErrorKind {
  if (!(error instanceof ApiError)) return "unknown";
  if (error.status === 403) return "denied";
  if (error.status === 404) return "unavailable";
  if (error.status === 0) return "network";
  return (error.code && POLICY_ERROR_CODES[error.code]) || "unknown";
}

export function listTaxonomy(kind: TaxonomyKind, input: { page?: number; pageSize?: number; status?: "active" | "archived" | "all"; search?: string }, signal?: AbortSignal) {
  const params = new URLSearchParams({ page: String(input.page ?? 1), pageSize: String(input.pageSize ?? 20), status: input.status ?? "all" });
  if (input.search?.trim()) params.set("search", input.search.trim());
  return api.get<TaxonomyListResponse>(`/document-taxonomy/${kind}?${params}`, { signal });
}
export function createTaxonomy(kind: TaxonomyKind, input: TaxonomyCreateInput) { return api.post<TaxonomyMutationResponse>(`/document-taxonomy/${kind}`, { ...input }); }
export function updateTaxonomy(kind: TaxonomyKind, id: string, input: TaxonomyUpdateInput) { return api.patch<TaxonomyMutationResponse>(`/document-taxonomy/${kind}/${id}`, { ...input }); }
export function changeTaxonomyStatus(kind: TaxonomyKind, id: string, version: number, action: "archive" | "restore") {
  return api.post<TaxonomyMutationResponse>(`/document-taxonomy/${kind}/${id}/${action}`, { version });
}

export function getActivePolicy(documentId: string, signal?: AbortSignal) { return api.get<ActivePolicyResponse>(`/documents/${documentId}/access-policy`, { signal }); }
export function getPolicyHistory(documentId: string, cursor?: number, signal?: AbortSignal) { const query = new URLSearchParams({ limit: "20" }); if (cursor) query.set("cursor", String(cursor)); return api.get<PolicyHistoryResponse>(`/documents/${documentId}/access-policy/history?${query}`, { signal }); }
export function getPolicyAssignments(documentId: string, signal?: AbortSignal) { return api.get<PolicyAssignmentsResponse>(`/documents/${documentId}/access-policy/assignments`, { signal }); }
export function getPropagationStatus(documentId: string, signal?: AbortSignal) { return api.get<PropagationStatusResponse>(`/documents/${documentId}/access-policy/propagation-status`, { signal }); }
export function getEffectiveAccess(documentId: string, userIds: string[], signal?: AbortSignal) { return api.post<EffectiveAccessResponse>(`/documents/${documentId}/access-policy/effective-access`, { userIds }, { signal }); }
export function previewPolicy(documentId: string, expectedPolicyId: string, expectedPolicyVersion: number, draft: PolicyDraft, signal?: AbortSignal) { return api.post<PolicyPreviewResponse>(`/documents/${documentId}/access-policy/preview`, { expectedPolicyId, expectedPolicyVersion, draft }, { signal }); }
export function applyPolicy(documentId: string, previewToken: string, draft: PolicyDraft, idempotencyKey: string, confirmSensitiveBroadening = false, signal?: AbortSignal) { return api.post<PolicyApplyResponse>(`/documents/${documentId}/access-policy/apply`, { previewToken, draft, ...(confirmSensitiveBroadening ? { confirmSensitiveBroadening: true } : {}) }, { signal, headers: { "Idempotency-Key": idempotencyKey } }); }
export function previewBatch(documentIds: string[], expectedPolicies: BatchExpectedPolicy[], draft: PolicyDraft, signal?: AbortSignal) { return api.post<BatchPreviewResponse>("/documents/access-policy/batch/preview", { documentIds, expectedPolicies, draft }, { signal }); }
export function applyBatch(previewToken: string, draft: PolicyDraft, idempotencyKey: string, confirmSensitiveBroadening = false, signal?: AbortSignal) { return api.post<BatchApplyResponse>("/documents/access-policy/batch/apply", { previewToken, draft, ...(confirmSensitiveBroadening ? { confirmSensitiveBroadening: true } : {}) }, { signal, headers: { "Idempotency-Key": idempotencyKey } }); }

export function createIdempotencyKey(): string {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `document-policy:${id}`.slice(0, 128);
}
