import type { AuditEventInput, AuditAction, AuditResourceType, AuditOutcome } from "../../common/observability/auditEvents.js";

export type { AuditEventInput, AuditAction, AuditResourceType, AuditOutcome };

export interface AuditQueryFilter {
  action?: string;
  actorId?: string;
  actorEmail?: string;
  resourceType?: string;
  resourceId?: string;
  dateFrom?: string;
  dateTo?: string;
  outcome?: AuditOutcome;
}

export interface AuditOperationContext {
  tenantId: string;
  actorId: string;
  actorEmail: string;
  actorRole: import("../../common/auth/baseRoles.js").BaseRole;
  traceId?: string;
  requestId?: string;
}
