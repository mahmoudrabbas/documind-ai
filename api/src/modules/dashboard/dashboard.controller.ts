import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import { requireAuthenticatedAuditActor } from "../../common/observability/auditActor.js";
import { getDashboardSummary } from "./dashboard.service.js";

export const getSummary = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.auth || !req.tenantId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }
    requireAuthenticatedAuditActor({
      tenantId: req.tenantId,
      actorId: req.auth.userId,
      actorEmail: req.auth.email,
      actorRole: req.auth.role,
    });
    res.status(200).json({
      success: true,
      data: await getDashboardSummary(req.tenantId),
    });
  } catch (error) {
    next(error);
  }
};
