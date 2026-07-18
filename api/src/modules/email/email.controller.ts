import type { Request, Response } from "express";
import { emailService } from "./email.service.js";
import { getEmailsQuerySchema } from "./email.validator.js";
import { AppError } from "../../common/errors/AppError.js";

export const listEmails = async (req: Request, res: Response) => {
  const tenantId = req.tenantId;
  if (!tenantId) throw new AppError(400, "BAD_REQUEST", "Tenant required");

  const query = getEmailsQuerySchema.parse(req.query);

  const result = await emailService.listMessages(tenantId, query, {
    page: query.page,
    limit: query.limit,
  });

  res.json(result);
};

export const getEmailStatus = async (req: Request, res: Response) => {
  const tenantId = req.tenantId;
  if (!tenantId) throw new AppError(400, "BAD_REQUEST", "Tenant required");

  const messageId = req.params.messageId as string;
  const result = await emailService.getMessageStatus(messageId, tenantId);
  res.json({ data: result });
};

export const resendEmail = async (req: Request, res: Response) => {
  const tenantId = req.tenantId;
  const actorId = req.auth?.userId;
  if (!tenantId) throw new AppError(400, "BAD_REQUEST", "Tenant required");

  const messageId = req.params.messageId as string;
  const result = await emailService.resendMessage(messageId, tenantId, actorId);
  res.json({ data: result });
};

export const cancelEmail = async (req: Request, res: Response) => {
  const tenantId = req.tenantId;
  if (!tenantId) throw new AppError(400, "BAD_REQUEST", "Tenant required");

  const messageId = req.params.messageId as string;
  const result = await emailService.cancelMessage(messageId, tenantId);
  res.json({ data: result });
};
