import type { Request, Response } from "express";
import { emailService } from "./email.service.js";
import { getEmailsQuerySchema } from "./email.validator.js";
import { AppError } from "../../common/errors/AppError.js";
import { requireAuthenticatedAuditActor } from "../../common/observability/auditActor.js";
import type { OperationAuthorizationContext } from "../permissions/permissions.operation.js";

function operationContext(req: Request): OperationAuthorizationContext {
  const resolved = requireAuthenticatedAuditActor({
    tenantId: req.tenantId,
    actorId: req.auth?.userId,
    actorEmail: req.auth?.email,
    actorRole: req.auth?.role,
  });
  return {
    tenantId: resolved.tenantId,
    actorId: resolved.actorId,
    actorEmail: resolved.actorEmail,
    actorRole: resolved.actorRole,
    traceId: req.traceId,
    requestId: req.requestId,
  };
}

export const listEmails = async (req: Request, res: Response) => {
  const tenantId = req.tenantId;
  if (!tenantId) throw new AppError(400, "BAD_REQUEST", "Tenant required");

  const query = getEmailsQuerySchema.parse(req.query);

  const result = await emailService.listMessages(
    tenantId,
    query,
    { page: query.page, limit: query.limit },
    operationContext(req),
  );

  res.json(result);
};

export const getEmailStatus = async (req: Request, res: Response) => {
  const tenantId = req.tenantId;
  if (!tenantId) throw new AppError(400, "BAD_REQUEST", "Tenant required");

  const messageId = req.params.messageId as string;
  const result = await emailService.getMessageStatus(
    messageId,
    tenantId,
    operationContext(req),
  );
  res.json({ data: result });
};

export const resendEmail = async (req: Request, res: Response) => {
  const tenantId = req.tenantId;
  if (!tenantId) throw new AppError(400, "BAD_REQUEST", "Tenant required");

  const messageId = req.params.messageId as string;
  const result = await emailService.resendMessage(
    messageId,
    tenantId,
    operationContext(req),
  );
  res.json({ data: result });
};

export const cancelEmail = async (req: Request, res: Response) => {
  const tenantId = req.tenantId;
  if (!tenantId) throw new AppError(400, "BAD_REQUEST", "Tenant required");

  const messageId = req.params.messageId as string;
  const result = await emailService.cancelMessage(
    messageId,
    tenantId,
    operationContext(req),
  );
  res.json({ data: result });
};
