export type AuditAction =
  // Auth
  | "AUTH_LOGIN_SUCCESS"
  | "AUTH_LOGIN_FAILURE"
  | "AUTH_LOGOUT"
  | "AUTH_LOGOUT_ALL"
  | "AUTH_TOKEN_REFRESH"
  | "AUTH_PASSWORD_RESET"
  | "AUTH_EMAIL_VERIFIED"
  // Users
  | "USER_INVITED"
  | "USER_UPDATED"
  | "USER_DELETED"
  | "USER_ROLE_CHANGED"
  | "USER_STATUS_CHANGED"
  | "PASSWORD_SET_FROM_INVITE"
  // Roles
  | "ROLE_CREATED"
  | "ROLE_UPDATED"
  | "ROLE_DELETED"
  // Documents
  | "DOCUMENT_UPLOADED"
  | "DOCUMENT_DOWNLOADED"
  | "DOCUMENT_UPDATED"
  | "DOCUMENT_DELETED"
  | "DOCUMENT_ARCHIVED"
  | "DOCUMENT_RESTORED"
  // Platform
  | "PACKAGE_CREATED"
  | "PACKAGE_UPDATED"
  | "SUBSCRIPTION_UPDATED"
  | "PLATFORM_SETTING_UPDATED"
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
  | "Package"
  | "Subscription"
  | "PlatformSetting"
  | "Tenant"
  | "Session"
  | "System";

export type AuditOutcome = "SUCCESS" | "FAILURE" | "DENIED";

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
  actorEmail?: string;
  actorRole?: string;
}
