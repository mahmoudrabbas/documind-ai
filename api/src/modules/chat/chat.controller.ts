import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import { UNAUTHORIZED, VALIDATION_ERROR } from "../../common/errors/errorCodes.js";
import { requireAuthenticatedAuditActor } from "../../common/observability/auditActor.js";
import type { OperationAuthorizationContext } from "../permissions/permissions.operation.js";
import type { ChatService } from "./chat.service.js";
import { ChatAttachmentIdParamSchema } from "./chat.validator.js";
import type { ChatStageId } from "./chatWorkflowService.js";

const STREAM_HEARTBEAT_MS = 5_000;

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

  async function sendMessageStream(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.auth || !req.tenantId) {
        throw new AppError(401, UNAUTHORIZED, "Authentication required");
      }

      const context = operationContext(req);

      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      let closed = false;
      let lastStage: ChatStageId = "intent";
      const writeEvent = (event: string, data: unknown): void => {
        if (closed || res.writableEnded) return;
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      const heartbeat = setInterval(() => {
        if (closed || res.writableEnded) {
          clearInterval(heartbeat);
          return;
        }
        res.write(": ping\n\n");
      }, STREAM_HEARTBEAT_MS);
      req.on("close", () => {
        clearInterval(heartbeat);
      });
      res.on("close", () => {
        if (!res.writableEnded) {
          // Client disconnect stops writes but not the run: the user message
          // is already persisted and a retry would re-consume entitlement quota.
          closed = true;
        }
        clearInterval(heartbeat);
      });

      writeEvent("stage", { stage: "intent" });

      try {
        const result = await service.sendMessageStream(req.body, {
          ...context,
          onStage: (stage: ChatStageId) => {
            if (stage === lastStage) return;
            lastStage = stage;
            writeEvent("stage", { stage });
          },
        });
        clearInterval(heartbeat);
        writeEvent("done", { success: true, data: result });
        res.end();
      } catch (error) {
        clearInterval(heartbeat);
        const statusCode = error instanceof AppError ? error.statusCode : 502;
        const code = error instanceof AppError ? error.code : "CHAT_STREAM_FAILED";
        const message =
          error instanceof AppError ? error.message : "Controlled chat stream failed";
        writeEvent("error", {
          success: false,
          error: code,
          message,
          statusCode,
        });
        res.end();
      }
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
    sendMessageStream,
    sendVisionMessage,
    transcribeAudio,
    getAttachment,
    listConversations,
    getConversationMessages,
    deleteConversation,
  };
}
