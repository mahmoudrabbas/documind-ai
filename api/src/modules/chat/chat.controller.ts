import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import { UNAUTHORIZED, VALIDATION_ERROR } from "../../common/errors/errorCodes.js";
import { requireAuthenticatedAuditActor } from "../../common/observability/auditActor.js";
import type { OperationAuthorizationContext } from "../permissions/permissions.operation.js";
import type { ChatService } from "./chat.service.js";

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

function handleChatError(error: unknown, res: Response, next: NextFunction) {
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

export function createChatController(service: ChatService) {
  async function sendMessage(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.auth || !req.tenantId) {
        throw new AppError(401, UNAUTHORIZED, "Authentication required");
      }

      const context = operationContext(req);
      const result = await service.sendMessage(req.body, context);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      handleChatError(error, res, next);
    }
  }

  return { sendMessage };
}
