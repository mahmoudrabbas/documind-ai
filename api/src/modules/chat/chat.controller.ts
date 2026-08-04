import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import { UNAUTHORIZED, VALIDATION_ERROR } from "../../common/errors/errorCodes.js";
import { requireAuthenticatedAuditActor } from "../../common/observability/auditActor.js";
import type { OperationAuthorizationContext } from "../permissions/permissions.operation.js";
import type { ChatService } from "./chat.service.js";
import type { SseSink } from "./chat.types.js";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

export function createSseSink(res: Response): {
  sink: SseSink;
  isStarted: () => boolean;
} {
  let started = false;
  let ended = false;
  const sink: SseSink = {
    start() {
      if (started) return;
      started = true;
      res.writeHead(200, SSE_HEADERS);
      res.flushHeaders();
    },
    event(payload: unknown) {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    },
    end() {
      if (ended) return;
      ended = true;
      res.end();
    },
  };
  return { sink, isStarted: () => started };
}

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

  async function streamMessage(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const { sink, isStarted } = createSseSink(res);
    const abortController = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) abortController.abort();
    };
    res.on("close", onClose);
    try {
      if (!req.auth || !req.tenantId) {
        throw new AppError(401, UNAUTHORIZED, "Authentication required");
      }

      const context = operationContext(req);
      await service.streamMessage(
        req.body,
        context,
        sink,
        abortController.signal,
      );
    } catch (error) {
      if (isStarted()) {
        const payload =
          error instanceof AppError
            ? {
                type: "error",
                code: error.code,
                statusCode: error.statusCode,
                message: error.message,
              }
            : {
                type: "error",
                message:
                  error instanceof Error
                    ? error.message
                    : "Unexpected stream error",
              };
        sink.event(payload);
        sink.end();
        return;
      }
      handleChatError(error, res, next);
    } finally {
      res.off("close", onClose);
    }
  }

  return {
    sendMessage,
    listConversations,
    getConversationMessages,
    deleteConversation,
    streamMessage,
  };
}
