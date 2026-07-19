import type { NextFunction, Request, Response } from "express";
import { requireAuthenticatedAuditActor } from "../../common/observability/auditActor.js";
import { AppError } from "../../common/errors/AppError.js";
import {
  exportTenantAuditLogs,
  getTenantAuditLog,
  listTenantAuditLogs,
  type AuditOperationContext,
} from "./audit.service.js";

function context(req: Request): AuditOperationContext {
  if (!req.auth || !req.tenantId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }
  const actor = requireAuthenticatedAuditActor({
    tenantId: req.tenantId,
    actorId: req.auth.userId,
    actorEmail: req.auth.email,
    actorRole: req.auth.role,
  });
  return {
    tenantId: actor.tenantId,
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    traceId: req.traceId,
    requestId: req.requestId,
  };
}

export const getLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await listTenantAuditLogs(req.query, context(req)));
  } catch (error) {
    next(error);
  }
};

export const getLogById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await getTenantAuditLog(req.params, context(req)));
  } catch (error) {
    next(error);
  }
};

export const exportLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await exportTenantAuditLogs(req.query, context(req)));
  } catch (error) {
    next(error);
  }
};
