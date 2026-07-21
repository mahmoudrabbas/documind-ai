import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import {
  UNAUTHORIZED,
  VALIDATION_ERROR,
  FORBIDDEN,
  NOT_FOUND,
} from "../../common/errors/errorCodes.js";
import { requireAuthenticatedAuditActor } from "../../common/observability/auditActor.js";
import type { OperationAuthorizationContext } from "../permissions/permissions.operation.js";
import { intentQueryService } from "./intentQuery.factory.js";
import IntentQueryTraceModel from "../../db/models/intentQueryTrace.model.js";

function operationContext(req: Request): OperationAuthorizationContext {
  const actor = requireAuthenticatedAuditActor({
    tenantId: req.tenantId,
    actorId: req.auth?.userId,
    actorEmail: req.auth?.email,
    actorRole: req.auth?.role,
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

function handleAgentError(error: unknown, res: Response, next: NextFunction) {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      error: error.code,
      details: error.details ?? null,
    });
    return;
  }
  if (error instanceof z.ZodError) {
    res.status(400).json({
      success: false,
      message: "Validation failed",
      error: VALIDATION_ERROR,
      details: error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message,
      })),
    });
    return;
  }
  next(error);
}

/**
 * Controller to analyze a query and produce a structured query plan.
 */
export async function analyzeQueryController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.auth || !req.tenantId) {
      throw new AppError(401, UNAUTHORIZED, "Authentication required");
    }

    const context = operationContext(req);
    const queryPlan = await intentQueryService.analyzeQuery(req.body, context);

    res.status(200).json({
      success: true,
      data: {
        queryPlan,
        traceId: context.traceId ?? req.traceId,
      },
    });
  } catch (error) {
    handleAgentError(error, res, next);
  }
}

/**
 * Controller to retrieve debug trace of an analyzed query plan.
 * Restricts access to COMPANY_ADMIN and SUPER_ADMIN.
 */
export async function getQueryPlanDebugController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.auth || !req.tenantId) {
      throw new AppError(401, UNAUTHORIZED, "Authentication required");
    }

    // Role check: Only COMPANY_ADMIN and SUPER_ADMIN can view debug traces
    const userRole = req.auth.role;
    if (userRole !== "COMPANY_ADMIN" && userRole !== "SUPER_ADMIN") {
      throw new AppError(403, FORBIDDEN, "Permission denied. Admin role required.");
    }

    const traceIdParam = req.params.traceId;
    const traceId = Array.isArray(traceIdParam) ? traceIdParam[0] : traceIdParam;
    if (!traceId) {
      throw new AppError(400, VALIDATION_ERROR, "Missing traceId parameter");
    }

    const trace = await IntentQueryTraceModel.findOne({ traceId }).lean().exec();
    if (!trace) {
      throw new AppError(404, NOT_FOUND, "Trace not found");
    }

    // Tenant isolation verification: Ensure the trace belongs to the caller's tenant
    if (trace.tenantId && trace.tenantId.toString() !== req.tenantId) {
      throw new AppError(404, NOT_FOUND, "Trace not found");
    }

    res.status(200).json({
      success: true,
      data: trace,
    });
  } catch (error) {
    handleAgentError(error, res, next);
  }
}
