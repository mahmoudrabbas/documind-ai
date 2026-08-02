import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import { UNAUTHORIZED } from "../../common/errors/errorCodes.js";
import { requireAuthenticatedAuditActor } from "../../common/observability/auditActor.js";
import { getPaymentProvider } from "../checkout/payment-provider-loader.js";
import type { OperationAuthorizationContext } from "../permissions/permissions.operation.js";
import { confirmRefundRequest, getPlatformRefund, listPlatformRefunds, rejectRefundRequest, retryRefundRequest } from "./refund.service.js";
import { parseBilling, platformRefundListSchema, refundIdSchema, refundRejectSchema } from "./tenant-billing.validator.js";

type Handler = (req: Request, res: Response) => Promise<unknown>;
const endpoint = (handler: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await handler(req, res);
    if (!res.headersSent) res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

function context(req: Request): OperationAuthorizationContext {
  if (!req.auth || !req.tenantId) throw new AppError(401, UNAUTHORIZED, "Authentication required");
  const actor = requireAuthenticatedAuditActor({
    tenantId: req.tenantId,
    actorId: req.auth.userId,
    actorEmail: req.auth.email,
    actorRole: req.auth.role,
  });
  return { ...actor, traceId: req.traceId, requestId: req.requestId };
}

export const platformRefundListController = endpoint(async (req) => {
  const query = parseBilling(platformRefundListSchema, req.query);
  return listPlatformRefunds({ ...query, context: context(req) });
});

export const platformRefundDetailController = endpoint(async (req) => {
  const params = parseBilling(refundIdSchema, req.params);
  return getPlatformRefund({ refundId: params.refundId, context: context(req) });
});

export const platformRefundConfirmController = endpoint(async (req) => {
  const params = parseBilling(refundIdSchema, req.params);
  return confirmRefundRequest({ refundId: params.refundId, provider: await getPaymentProvider(), context: context(req) });
});

export const platformRefundRejectController = endpoint(async (req) => {
  const params = parseBilling(refundIdSchema, req.params);
  const body = parseBilling(refundRejectSchema, req.body);
  return rejectRefundRequest({ refundId: params.refundId, reason: body.reason, context: context(req) });
});

export const platformRefundRetryController = endpoint(async (req) => {
  const params = parseBilling(refundIdSchema, req.params);
  return retryRefundRequest({ refundId: params.refundId, provider: await getPaymentProvider(), context: context(req) });
});
