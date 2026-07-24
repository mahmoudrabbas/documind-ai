export const DOCUMENT_ACCESS_ACTIONS = [
  "discover", "read", "download", "update", "replace", "archive",
  "restore", "delete", "reprocess", "manage_access", "use_in_ai",
] as const;

export type DocumentAccessAction = (typeof DOCUMENT_ACCESS_ACTIONS)[number];
export type ClassificationLevel = "internal" | "restricted" | "confidential" | "highly_confidential";
export type TaxonomyKind = "categories" | "departments" | "classifications";
export type TaxonomyStatus = "active" | "archived";

export interface TaxonomyView {
  id: string;
  name: string;
  description: string | null;
  status: TaxonomyStatus;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  level?: ClassificationLevel;
}

export interface TaxonomyPagination { page: number; pageSize: number; totalRecords: number; totalPages: number }
export interface TaxonomyListResponse { success: true; data: { pagination: TaxonomyPagination } & Partial<Record<TaxonomyKind, TaxonomyView[]>> }
export interface TaxonomyMutationResponse { success: true; message: string; data: Partial<Record<"category" | "department" | "classification", TaxonomyView>> }
export interface TaxonomyCreateInput { name: string; description: string | null; level?: ClassificationLevel }
export interface TaxonomyUpdateInput extends TaxonomyCreateInput { version: number }
export interface TaxonomyStatusInput { version: number }

export type PolicySubjectType = "user" | "custom_role" | "department" | "owner" | "tenant_member";
export type PolicyEffect = "allow" | "deny";
export interface PolicyRule { ruleId: string; effect: PolicyEffect; subject: { type: PolicySubjectType; id?: string }; actions: DocumentAccessAction[] }
export interface PolicyReference { policyId: string; policyVersion: number }
export interface PolicyDraft { rules: PolicyRule[]; inherits: PolicyReference | null; effectiveFrom: string | null; effectiveUntil: string | null; reason: string | null }
export interface PolicyTaxonomySelection { classificationId: string; categoryId: string | null; departmentId: string | null }
export interface PolicyTaxonomySummary extends PolicyTaxonomySelection {
  classificationName: string; classificationLevel: ClassificationLevel;
  categoryName: string | null; departmentName: string | null;
}
export interface ActivePolicy {
  contractVersion: 1; documentId: string; policyId: string; policyVersion: number;
  status: "draft" | "active" | "inactive" | "retired"; effectiveFrom: string;
  effectiveUntil?: string | null; inherits?: PolicyReference | null; rules: PolicyRule[];
  provenance: { createdBy: string; createdAt: string; reason?: string };
  indexMetadata: { policyId: string; policyVersion: number; classificationId?: string | null; categoryId?: string | null; departmentId?: string | null };
  documentOwnerId?: string | null;
}
export interface ActivePolicyResponse { success: true; data: { policy: ActivePolicy; taxonomy: PolicyTaxonomySummary; mayManage: boolean } }
export interface PolicyHistoryItem { policyId: string; policyVersion: number; status: ActivePolicy["status"]; effectiveFrom: string; effectiveUntil: string | null; reason: string | null; createdBy: string; createdAt: string }
export interface PolicyHistoryResponse { success: true; data: { policies: PolicyHistoryItem[]; nextCursor: number | null; activeVersion: number } }
export interface PolicyAssignment { subjectType: PolicySubjectType; subjectId: string | null; displayLabel: string; effect: PolicyEffect; actions: DocumentAccessAction[]; inherited: boolean; stale: boolean }
export interface PolicyAssignmentsResponse { success: true; data: { assignments: PolicyAssignment[] } }
export interface EffectiveAccessUser { userId: string; displayName: string; actions: Record<DocumentAccessAction, boolean> }
export interface EffectiveAccessResponse { success: true; data: { users: EffectiveAccessUser[] } }
export type PolicyDirection = "broadening" | "tightening" | "mixed" | "no_change";
export type ActionImpact = Record<DocumentAccessAction, { gained: number; lost: number }>;
export interface PolicyImpact { direction: PolicyDirection; byAction: ActionImpact; usersGainingAny: number; usersLosingAny: number; ruleDelta: { added: number; removed: number }; sensitiveBroadening: boolean }
export interface NormalizedPolicySummary { ruleCount: number; allowRuleCount: number; denyRuleCount: number; inherits: PolicyReference | null; effectiveFrom: string; effectiveUntil: string | null; reason: string | null }
export interface PolicyPreview { documentId: string; currentPolicyId: string; currentPolicyVersion: number; proposedPolicyVersion: number; normalizedSummary: NormalizedPolicySummary; impact: PolicyImpact; taxonomyChanged: boolean; taxonomy: PolicyTaxonomySummary; sensitiveConfirmationRequired: boolean; previewToken: string; previewExpiresAt: string; previewFingerprint: string }
export interface PolicyPreviewResponse { success: true; data: PolicyPreview }
export interface PolicyApplyResult { status: "applied" | "no_change" | "idempotent_replay"; policyId: string; policyVersion: number; propagationEventId?: string | null; taxonomy?: PolicyTaxonomySummary }
export interface PolicyApplyResponse { success: true; data: PolicyApplyResult }
export interface BatchExpectedPolicy extends PolicyReference { documentId: string }
export interface BatchPreviewItem { documentId: string; direction: PolicyDirection; usersGainingAny: number; usersLosingAny: number; sensitiveConfirmationRequired: boolean; byAction: ActionImpact }
export interface BatchAggregate { broadeningCount: number; tighteningCount: number; mixedCount: number; noChangeCount: number; usersGainingAccess: number; usersLosingAccess: number; sensitiveConfirmationRequiredCount: number; byAction: ActionImpact }
export interface BatchPreviewResponse { success: true; data: { documentCount: number; aggregate: BatchAggregate; results: BatchPreviewItem[]; previewToken: string; previewExpiresAt: string } }
export interface BatchApplyItem { documentId: string; status: "applied" | "no_change" | "version_conflict" | "idempotent_replay" | "failed"; policyVersion?: number }
export interface BatchApplyResponse { success: true; data: { status: "complete" | "partial" | "idempotent_replay"; results: BatchApplyItem[] } }
export interface PropagationStatus { desiredPolicyVersion: number; appliedPolicyVersion: number | null; status: "pending" | "stale" | "updating_metadata" | "reindexing" | "current" | "failed" | "dead_letter"; reindexRequired: boolean; attempts: number; requestedAt: string | null; completedAt: string | null; failureCode: string | null; retryAvailable: boolean }
export interface PropagationStatusResponse { success: true; data: PropagationStatus }

export type PolicyErrorKind = "denied" | "unavailable" | "version_conflict" | "preview_expired" | "preview_invalid" | "preview_mismatch" | "sensitive_confirmation" | "idempotency_conflict" | "invalid_draft" | "invalid_reference" | "invalid_inheritance" | "batch_limit" | "taxonomy_duplicate" | "taxonomy_archived" | "owner_rule_protected" | "taxonomy_protected" | "network" | "unknown";

export interface PolicyEditorSubject { id: string; name: string }
export interface PolicyEditorClassification { id: string; name: string; level: ClassificationLevel }
export interface PolicyEditorOptions { documentOwnerId: string | null; taxonomyEditable: boolean; users: PolicyEditorSubject[]; roles: PolicyEditorSubject[]; classifications: PolicyEditorClassification[]; categories: PolicyEditorSubject[]; departments: PolicyEditorSubject[] }
export interface PolicyEditorOptionsResponse { success: true; data: PolicyEditorOptions }
