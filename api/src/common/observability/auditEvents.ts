import type { BaseRole } from "../auth/baseRoles.js";

export type AuditAction =
  // Auth
  | "AUTH_LOGIN_SUCCESS"
  | "AUTH_LOGIN_FAILURE"
  | "AUTH_LOGOUT"
  | "AUTH_LOGOUT_ALL"
  | "AUTH_TOKEN_REFRESH"
  | "AUTH_REFRESH_TOKEN_REUSE"
  | "AUTH_PASSWORD_RESET"
  | "AUTH_EMAIL_VERIFIED"
  // Users
  | "USER_INVITED"
  | "USER_INVITATION_RESENT"
  | "USER_UPDATED"
  | "USER_DELETED"
  | "USER_ROLE_CHANGED"
  | "USER_STATUS_CHANGED"
  | "PASSWORD_SET_FROM_INVITE"
  // Roles
  | "ROLE_CREATED"
  | "ROLE_UPDATED"
  | "ROLE_CLONED"
  | "ROLE_ARCHIVED"
  | "ROLE_REACTIVATED"
  | "ROLE_DELETED"
  | "ROLE_ASSIGNED"
  | "ROLE_ASSIGNMENT_REMOVED"
  | "ROLE_USERS_MIGRATED"
  | "ROLE_ESCALATION_BLOCKED"
  | "ROLE_ACCESS_DENIED"
  // Documents
  | "DOCUMENT_UPLOADED"
  | "DOCUMENT_DOWNLOADED"
  | "DOCUMENT_UPDATED"
  | "DOCUMENT_METADATA_UPDATED"
  | "DOCUMENT_DELETED"
  | "DOCUMENT_SOFT_DELETED"
  | "DOCUMENT_PERMANENTLY_DELETED"
  | "DOCUMENT_REPLACED"
  | "DOCUMENT_ARCHIVED"
  | "DOCUMENT_RESTORED"
  // OCR & Quality
  | "OCR_TRIGGERED"
  | "OCR_COMPLETED"
  | "OCR_FAILED"
  | "QUALITY_ASSESSED"
  | "QUALITY_REVIEWED"
  | "OCR_PAGES_RETRIED"
  // Metadata & Version/Conflict
  | "METADATA_ANALYSIS_TRIGGERED"
  | "METADATA_CANDIDATE_REVIEWED"
  | "VERSION_CONFLICT_ANALYSIS_TRIGGERED"
  | "DOCUMENT_RELATIONSHIP_APPROVED"
  | "DOCUMENT_RELATIONSHIP_REJECTED"
  | "CONFLICT_FINDING_RESOLVED"
  | "CONFLICT_FINDING_DISMISSED"
  // Platform
  | "PACKAGE_CREATED"
  | "PACKAGE_UPDATED"
  | "SUBSCRIPTION_UPDATED"
  | "PLATFORM_SETTING_UPDATED"
  | "TENANT_UPDATED"
  // Payment
  | "CHECKOUT_SESSION_CREATED"
  | "EMAIL_RESENT"
  | "EMAIL_CANCELLED"
  | "PAYMENT_EVENT_RECEIVED"
  | "PAYMENT_EVENT_PROCESSED"
  | "PAYMENT_EVENT_FAILED"
  | "PAYMENT_EVENT_REPROCESSED"
  | "SUBSCRIPTION_RECONCILED"
  | "JOB_REPLAYED"
  // Intent Query
  | "INTENT_QUERY_ANALYZED"
  | "INTENT_QUERY_CLARIFICATION_REQUESTED"
  | "INTENT_QUERY_UNSAFE_BLOCKED"
  | "INTENT_QUERY_FALLBACK_USED"
  | "INTENT_QUERY_CONTEXT_DENIED"
  // Authorization
  | "LAST_ADMIN_PROTECTION_TRIGGERED"
  | "PERMISSION_DENIED"
  // Audit
  | "AUDIT_QUERIED"
  | "AUDIT_EXPORTED"
  // System
  | "SYSTEM_STARTUP"
  | "SYSTEM_HEALTH_CHECK_FAILED";

export type AuditResourceType =
  | "User"
  | "Role"
  | "Document"
  | "DocumentQuality"
  | "OcrPageResult"
  | "MetadataCandidate"
  | "DocumentRelationship"
  | "ConflictFinding"
  | "Package"
  | "Subscription"
  | "EmailMessage"
  | "PaymentEvent"
  | "PlatformSetting"
  | "Tenant"
  | "Session"
  | "System"
  | "Permission"
  | "IntentQuery";

export type AuditOutcome = "SUCCESS" | "FAILURE" | "DENIED";
export type AuditActorKind = "USER" | "SYSTEM" | "UNAUTHENTICATED";

export interface AuditEventInput {
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId: string;
  outcome?: AuditOutcome; // Defaults to SUCCESS if not provided
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  
  // Explicit overrides if not using the current async context
  tenantId?: string;
  actorId?: string;
  actorEmail?: string | null;
  actorRole?: BaseRole | null;
  actorKind?: AuditActorKind;
}

export function normalizeAuditActorRole(
  actorRole: unknown,
): BaseRole | null {
  if (actorRole === undefined || actorRole === null || actorRole === "") {
    return null;
  }

  if (actorRole === "SUPER_ADMIN") {
    return actorRole;
  }

  if (actorRole === "COMPANY_ADMIN") {
    return actorRole;
  }

  if (actorRole === "EMPLOYEE") {
    return actorRole;
  }

  return null;
}

export function resolveAuditActorKind(input: {
  actorId?: string;
  actorKind?: AuditActorKind;
  actorRole?: BaseRole | null;
}): AuditActorKind {
  if (input.actorKind) {
    return input.actorKind;
  }

  if (input.actorId && input.actorId !== "system") {
    return "USER";
  }

  if (normalizeAuditActorRole(input.actorRole)) {
    return "USER";
  }

  return "SYSTEM";
}
