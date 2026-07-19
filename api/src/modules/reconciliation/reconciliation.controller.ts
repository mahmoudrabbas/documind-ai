import type { NextFunction, Request, Response } from "express";
import { reconcileSubscriptions } from "./reconciliation.service.js";
import { AppError } from "../../common/errors/AppError.js";
import { requireAuthenticatedAuditActor } from "../../common/observability/auditActor.js";

export async function reconciliationController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.auth || !req.tenantId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }
    const actor = requireAuthenticatedAuditActor({
      tenantId: req.tenantId,
      actorId: req.auth.userId,
      actorEmail: req.auth.email,
      actorRole: req.auth.role,
    });
    const result = await reconcileSubscriptions({
      tenantId: actor.tenantId,
      actorId: actor.actorId,
      actorEmail: actor.actorEmail,
      actorRole: actor.actorRole,
      traceId: req.traceId,
      requestId: req.requestId,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
