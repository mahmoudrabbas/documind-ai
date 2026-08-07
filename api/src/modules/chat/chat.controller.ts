import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import { UNAUTHORIZED, VALIDATION_ERROR } from "../../common/errors/errorCodes.js";
import { requireAuthenticatedAuditActor } from "../../common/observability/auditActor.js";
import type { OperationAuthorizationContext } from "../permissions/permissions.operation.js";
import type { ChatService } from "./chat.service.js";
import { ChatAttachmentIdParamSchema } from "./chat.validator.js";

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
    next(error);
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

  async function listConversations(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.auth || !req.tenantId) {
        throw new AppError(401, UNAUTHORIZED, "Authentication required");
      }

      const context = operationContext(req);
      const result = await service.listConversations(req.query, context);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      handleChatError(error, res, next);
    }
  }

  async function getConversationMessages(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.auth || !req.tenantId) {
        throw new AppError(401, UNAUTHORIZED, "Authentication required");
      }

      const context = operationContext(req);
      const conversationId = String(req.params.conversationId);
      const result = await service.getConversationMessages(
        conversationId,
        context,
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      handleChatError(error, res, next);
    }
  }

  async function sendVisionMessage(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.auth || !req.tenantId) {
        throw new AppError(401, UNAUTHORIZED, "Authentication required");
      }

      const context = operationContext(req);
      const file = req.file as Express.Multer.File | undefined;
      const fileInput = file
        ? {
            buffer: file.buffer,
            originalname: file.originalname,
            mimetype: file.mimetype,
          }
        : undefined;

      const result = await service.sendVisionMessage(req.body, fileInput, context);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      handleChatError(error, res, next);
    }
  }

  async function getAttachment(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.auth || !req.tenantId) {
        throw new AppError(401, UNAUTHORIZED, "Authentication required");
      }

      const context = operationContext(req);
      const { attachmentId } = ChatAttachmentIdParamSchema.parse(req.params);

      const result = await service.getAttachment(attachmentId, context);

      res.setHeader("Content-Type", result.contentType);
      res.setHeader("Content-Length", result.sizeBytes);
      res.setHeader("Content-Disposition", "inline");
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.setHeader("X-Content-Type-Options", "nosniff");

      result.stream.pipe(res);
    } catch (error) {
      handleChatError(error, res, next);
    }
  }

  async function deleteConversation(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.auth || !req.tenantId) {
        throw new AppError(401, UNAUTHORIZED, "Authentication required");
      }

      const context = operationContext(req);
      const conversationId = String(req.params.conversationId);
      await service.deleteConversation(conversationId, context);

      res.status(200).json({
        success: true,
        data: { deleted: true },
      });
    } catch (error) {
      handleChatError(error, res, next);
    }
  }

  async function transcribeAudio(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.auth || !req.tenantId) {
        throw new AppError(401, UNAUTHORIZED, "Authentication required");
      }

      const context = operationContext(req);
      const file = req.file as Express.Multer.File | undefined;
      const fileInput = file
        ? {
            buffer: file.buffer,
            mimetype: file.mimetype,
            size: file.size,
          }
        : undefined;

      const result = await service.transcribeAudio(fileInput, context);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      handleChatError(error, res, next);
    }
  }

  return {
    sendMessage,
    sendVisionMessage,
    transcribeAudio,
    getAttachment,
    listConversations,
    getConversationMessages,
    deleteConversation,
  };
}
