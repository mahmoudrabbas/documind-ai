import type { NextFunction, Request, Response } from "express";
import { isBaseRole } from "../../common/auth/baseRoles.js";
import { AppError } from "../../common/errors/AppError.js";
import { PERMISSION_REQUIRED, RESOURCE_CONTEXT_REQUIRED, SCOPE_MISMATCH } from "../../common/errors/errorCodes.js";
import { requireAuthenticatedAuditActor } from "../../common/observability/auditActor.js";
import { getAuditWriter, getMetricRecorder } from "../../common/observability/index.js";
import type { PermissionValue } from "./permissions.catalog.js";
import { getPermissionEvaluator } from "./permissions.evaluator.js";
import type { AuditResourceType } from "../../common/observability/auditEvents.js";
import type { PermissionAuthorizationContext, PermissionResourceContext } from "./permissions.types.js";

export interface PermissionMiddlewareOptions {
  allowScoped?: boolean;
  resourceType?: AuditResourceType;
  resourceId?: (request: Request) => string | undefined;
  resourceContext?: (request: Request) => PermissionResourceContext | undefined;
}

export function requirePermission(permission: PermissionValue, options?: PermissionMiddlewareOptions) {
  return async function permissionMiddleware(req: Request, _res: Response, next: NextFunction) {
    try {
      if (!req.auth || !req.tenantId) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
      if (!isBaseRole(req.auth.role)) throw new AppError(403, PERMISSION_REQUIRED, "Invalid base role");
      const auditActor = requireAuthenticatedAuditActor({
        tenantId: req.tenantId,
        actorId: req.auth.userId,
        actorEmail: req.auth.email,
        actorRole: req.auth.role,
      });
      const resourceContext = options?.resourceContext?.(req);

      const decision = await getPermissionEvaluator().evaluate({
        actorId: auditActor.actorId,
        tenantId: auditActor.tenantId,
        baseRole: auditActor.actorRole,
        permission,
        resource: resourceContext,
      });
      if (decision.allowed) {
        req.permissionDecision = decision;
        req.permissionAuthorization = authorizationContext(req, decision, false);
        next();
        return;
      }
      if (options?.allowScoped && decision.denialCode === "RESOURCE_CONTEXT_REQUIRED" && decision.source && decision.scope) {
        req.permissionDecision = decision;
        req.permissionAuthorization = authorizationContext(req, decision, true);
        next();
        return;
      }

      const auditWritten = await getAuditWriter().write({
        tenantId: auditActor.tenantId,
        resourceType: options?.resourceType ?? "Permission",
        resourceId: options?.resourceId?.(req) ?? permission,
        action: "PERMISSION_DENIED",
        outcome: "DENIED",
        actorId: auditActor.actorId,
        actorEmail: auditActor.actorEmail,
        actorRole: auditActor.actorRole,
        actorKind: auditActor.actorKind,
        changes: { required: permission, reason: decision.denialCode },
        metadata: {
          traceId: req.traceId,
          requestId: req.requestId,
          ...(decision.scope ? { authorizationScope: decision.scope } : {}),
          ...(resourceContext ? {
            resourceContext: {
              tenantId: resourceContext.tenantId,
              ownerId: resourceContext.ownerId,
              departmentId: resourceContext.departmentId,
              documentCategory: resourceContext.documentCategory,
              documentClassification: resourceContext.documentClassification,
            },
          } : {}),
        },
      });
      if (!auditWritten) {
        getMetricRecorder().increment("permission_denial_audit_failure", {
          permission,
          reason: decision.denialCode ?? "unknown",
        });
        req.log?.error({
          event: "permission_denial_audit_failure",
          permission,
          reason: decision.denialCode,
          traceId: req.traceId,
          requestId: req.requestId,
        }, "Permission denial audit could not be persisted");
      }
      const externalCode = decision.denialCode === "SCOPE_MISMATCH" || decision.denialCode === "TENANT_MISMATCH"
        ? SCOPE_MISMATCH
        : decision.denialCode === "RESOURCE_CONTEXT_REQUIRED"
          ? RESOURCE_CONTEXT_REQUIRED
          : PERMISSION_REQUIRED;
      throw new AppError(403, externalCode, "Permission denied");
    } catch (error) {
      next(error);
    }
  };
}

function authorizationContext(
  req: Request,
  decision: NonNullable<Request["permissionDecision"]>,
  resourceContextRequired: boolean,
): PermissionAuthorizationContext {
  if (!req.auth || !req.tenantId || !decision.source) {
    throw new AppError(403, PERMISSION_REQUIRED, "Incomplete permission decision");
  }
  return {
    permission: decision.permission,
    actorId: req.auth.userId,
    tenantId: req.tenantId,
    source: decision.source,
    scopes: decision.scope,
    resourceContextRequired,
    roleId: decision.roleId,
    roleVersion: decision.roleVersion,
  };
}
