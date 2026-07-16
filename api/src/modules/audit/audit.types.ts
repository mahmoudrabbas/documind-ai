import type { AuditEventInput, AuditAction, AuditResourceType, AuditOutcome } from "../../common/observability/auditEvents.js";

export type { AuditEventInput, AuditAction, AuditResourceType, AuditOutcome };

export interface AuditQueryFilter {
  tenantId?: string;
  action?: string;
  actorId?: string;
  actorEmail?: string;
  resourceType?: string;
  resourceId?: string;
  dateFrom?: string;
  dateTo?: string;
  outcome?: string;
}
