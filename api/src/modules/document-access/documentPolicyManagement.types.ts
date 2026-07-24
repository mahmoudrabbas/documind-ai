import type { DocumentAccessAction } from "./documentAccess.actions.js";
import type { DocumentAccessPolicyRule } from "./documentAccess.types.js";

export const POLICY_DRAFT_MAX_RULES = 200;
export const POLICY_PREVIEW_MAX_USERS = 100;
export const POLICY_BATCH_MAX_DOCUMENTS = 50;
export const POLICY_IMPACT_ACTIONS = ["discover", "read", "download", "update", "replace", "archive", "restore", "delete", "reprocess", "manage_access", "use_in_ai"] as const;

export interface NormalizedPolicyDraft {
  rules: readonly DocumentAccessPolicyRule[];
  inherits: { policyId: string; policyVersion: number } | null;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  reason: string | null;
}
export interface PolicyPointerInput { expectedPolicyId: string; expectedPolicyVersion: number }
export interface PolicyTaxonomySelection { classificationId: string; categoryId: string | null; departmentId: string | null }
export interface ActionImpact { gained: number; lost: number }
export type PolicyImpactDirection = "broadening" | "tightening" | "mixed" | "no_change";
export interface PolicyImpact {
  direction: PolicyImpactDirection;
  byAction: Record<DocumentAccessAction, ActionImpact>;
  usersGainingAny: number;
  usersLosingAny: number;
  ruleDelta: { added: number; removed: number };
  sensitiveBroadening: boolean;
}
export interface PreviewArtifactEntry {
  documentId: string; policyId: string; policyVersion: number; draftFingerprint: string; semanticFingerprint: string; sensitive: boolean; materializedEffectiveFrom: string;
}
export interface PreviewArtifactPayload {
  purpose: "document_policy_preview" | "document_policy_batch_preview";
  tenantId: string; actorId: string; entries: readonly PreviewArtifactEntry[]; exp: number;
}
