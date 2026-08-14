import type { Logger } from "pino";
import type { BaseRole } from "../../common/auth/baseRoles.js";
import { getAuditWriter, getMetricRecorder } from "../../common/observability/index.js";
import type { AuditAction, AuditResourceType } from "../../common/observability/auditEvents.js";
import type { PermissionResourceContext, PermissionScopes } from "./permissions.types.js";

export async function writePermissionDenialAudit(input: {
  tenantId: string;
  actorId: string;
  actorEmail: string;
  actorRole: BaseRole;
  permission: string;
  reason: string | null;
  scope?: PermissionScopes | null;
  resource?: PermissionResourceContext;
  resourceType?: AuditResourceType;
  resourceId?: string;
  action?: AuditAction;
  traceId?: string;
  requestId?: string;
  log?: Logger;
}): Promise<void> {
  const auditWritten = await getAuditWriter().write({
    tenantId: input.tenantId,
    resourceType: input.resourceType ?? "Permission",
    resourceId: input.resourceId ?? input.permission,
    action: input.action ?? "PERMISSION_DENIED",
    outcome: "DENIED",
    actorId: input.actorId,
    actorEmail: input.actorEmail,
    actorRole: input.actorRole,
    actorKind: "USER",
    changes: { required: input.permission, reason: input.reason },
    metadata: {
      traceId: input.traceId,
      requestId: input.requestId,
      ...(input.scope ? { authorizationScope: input.scope } : {}),
      ...(input.resource ? { resourceContext: {
        tenantId: input.resource.tenantId,
        ownerId: input.resource.ownerId,
        departmentId: input.resource.departmentId,
        documentCategory: input.resource.documentCategory,
        documentClassification: input.resource.documentClassification,
      } } : {}),
    },
  });
  if (auditWritten) return;
  getMetricRecorder().increment("permission_denial_audit_failure", {
    permission: input.permission,
    reason: input.reason ?? "unknown",
  });
  input.log?.error({
    event: "permission_denial_audit_failure",
    permission: input.permission,
    reason: input.reason,
    traceId: input.traceId,
    requestId: input.requestId,
  }, "Permission denial audit could not be persisted");
}
