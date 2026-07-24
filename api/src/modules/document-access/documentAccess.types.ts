import type { BaseRole } from "../../common/auth/baseRoles.js";
import type { DocumentAccessAction } from "./documentAccess.actions.js";

export type DocumentLifecycleStatus =
  | "uploading"
  | "uploaded"
  | "processing"
  | "processed"
  | "failed"
  | "archived"
  | "deleted";

export interface DocumentAccessActorContext {
  /** Must be derived from authenticated server context, never trusted client input. */
  tenantId: string;
  actorId: string;
  baseRole: BaseRole;
  customRoleId?: string | null;
  departmentIds?: readonly string[];
}

export interface DocumentAccessResourceContext {
  /** Must be loaded from a tenant-scoped authoritative resource. */
  tenantId: string;
  documentId: string;
  ownerId?: string | null;
  categoryId?: string | null;
  departmentId?: string | null;
  classificationId?: string | null;
  classification?: string | null;
  lifecycleStatus?: DocumentLifecycleStatus;
  activePolicyId?: string | null;
  activePolicyVersion?: number | null;
  /** Transitional display-only value without tenant-owned referential integrity. */
  legacyCategory?: string | null;
  /** Transitional display-only value without tenant-owned referential integrity. */
  legacyDepartment?: string | null;
}

export type DocumentAccessPolicyStatus = "draft" | "active" | "inactive" | "retired";
export type DocumentAccessRuleEffect = "allow" | "deny";
export type DocumentAccessSubjectType =
  | "user"
  | "custom_role"
  | "department"
  | "owner"
  | "tenant_member";

export interface DocumentAccessRuleSubject {
  type: DocumentAccessSubjectType;
  /** Required for user, custom_role, and department; forbidden for owner/tenant_member. */
  id?: string;
}

export interface DocumentAccessPolicyRule {
  ruleId: string;
  effect: DocumentAccessRuleEffect;
  subject: DocumentAccessRuleSubject;
  actions: readonly DocumentAccessAction[];
}

export interface DocumentAccessPolicyReference {
  policyId: string;
  policyVersion: number;
}

export interface DocumentAccessPolicyProvenance {
  createdBy: string;
  createdAt: string;
  reason?: string;
}

export interface DocumentAccessIndexMetadata {
  policyId: string;
  policyVersion: number;
  classificationId?: string | null;
  categoryId?: string | null;
  departmentId?: string | null;
}

export interface DocumentAccessPolicy {
  contractVersion: 1;
  tenantId: string;
  documentId: string;
  policyId: string;
  policyVersion: number;
  status: DocumentAccessPolicyStatus;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  inherits?: DocumentAccessPolicyReference | null;
  rules: readonly DocumentAccessPolicyRule[];
  provenance: DocumentAccessPolicyProvenance;
  indexMetadata: DocumentAccessIndexMetadata;
}

export type DocumentAccessReasonCode =
  | "ACCESS_ALLOWED"
  | "INVALID_CONTEXT"
  | "TENANT_MISMATCH"
  | "CAPABILITY_REQUIRED"
  | "POLICY_MISSING"
  | "POLICY_INACTIVE"
  | "POLICY_NOT_EFFECTIVE"
  | "POLICY_EXPIRED"
  | "EXPLICIT_DENY"
  | "NO_MATCHING_GRANT"
  | "INVALID_POLICY"
  | "STALE_POLICY_CONTEXT"
  | "ACTION_NOT_SUPPORTED";

export interface DocumentAccessDecision {
  allowed: boolean;
  reasonCode: DocumentAccessReasonCode;
  action: DocumentAccessAction | string;
  tenantId: string;
  documentId: string | null;
  policyId: string | null;
  policyVersion: number | null;
  matchedRuleIds: readonly string[];
  evaluationContractVersion: 1;
}

export interface DocumentAccessEvaluationInput {
  actor: DocumentAccessActorContext;
  resource: DocumentAccessResourceContext;
  action: DocumentAccessAction;
  policy?: DocumentAccessPolicy | null;
  /** The exact referenced parent snapshot, supplied by a future persistence adapter. */
  inheritedPolicy?: DocumentAccessPolicy | null;
  /** Injected clock value; callers must supply an ISO-8601 instant. */
  evaluatedAt: string;
}
