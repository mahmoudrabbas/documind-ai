import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import { UNAUTHORIZED } from "../../common/errors/errorCodes.js";
import { requireAuthenticatedAuditActor } from "../../common/observability/auditActor.js";
import { config } from "../../config/index.js";
import type { OperationAuthorizationContext } from "../permissions/permissions.operation.js";
import { getPaymentProvider } from "../checkout/payment-provider-loader.js";
import { createSubscriptionChangePreview, getCompanyBillingOperation, requestCancellation, requestReactivation, requestSubscriptionChange } from "./tenant-billing-mutations.service.js";
import { createRefundRequest, getTenantRefundRequest, listTenantRefundRequests } from "./refund.service.js";
import { createRefundEligibilityPreview } from "./refund-eligibility.service.js";
import { getCompanyBillingSummary, createCompanyPortalSession, getCompanyInvoice, getCompanyInvoiceLinks, listCompanyInvoices } from "./tenant-billing.service.js";
import { cancellationSchema, invoiceIdSchema, invoiceListSchema, operationIdSchema, parseBilling, portalSessionSchema, reactivationSchema, refundEligibilityPreviewSchema, refundIdSchema, refundListSchema, refundRequestSchema, subscriptionChangePreviewSchema, subscriptionChangeSchema } from "./tenant-billing.validator.js";

type Handler = (request: Request, response: Response) => Promise<unknown>;
const endpoint = (handler: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try { const data = await handler(req, res); if (!res.headersSent) res.json({ success: true, data }); } catch (error) { next(error); }
};
function context(req: Request): OperationAuthorizationContext {
  if (!req.auth || !req.tenantId) throw new AppError(401, UNAUTHORIZED, "Authentication required");
  const actor = requireAuthenticatedAuditActor({ tenantId: req.tenantId, actorId: req.auth.userId, actorEmail: req.auth.email, actorRole: req.auth.role });
  return { ...actor, traceId: req.traceId, requestId: req.requestId };
}
function tenant(req: Request): string { if (!req.tenantId) throw new AppError(401, UNAUTHORIZED, "Tenant context required"); return req.tenantId; }

export const billingSummaryController = endpoint(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return getCompanyBillingSummary(tenant(req), context(req));
});
export const portalSessionController = endpoint(async (req) => {
  const body = parseBilling(portalSessionSchema, req.body);
  return createCompanyPortalSession({ tenantId: tenant(req), flow: body.flow, returnUrl: config.STRIPE_BILLING_PORTAL_RETURN_URL || `${config.APP_FRONTEND_URL}/dashboard/settings/billing`, provider: await getPaymentProvider(), context: context(req) });
});
export const invoiceListController = endpoint(async (req) => {
  const query = parseBilling(invoiceListSchema, req.query);
  return listCompanyInvoices({ tenantId: tenant(req), ...query, context: context(req) });
});
export const invoiceDetailController = endpoint(async (req) => {
  const params = parseBilling(invoiceIdSchema, req.params);
  return getCompanyInvoice(params.invoiceId, tenant(req), context(req));
});
export const invoiceLinksController = endpoint(async (req) => {
  const params = parseBilling(invoiceIdSchema, req.params);
  return getCompanyInvoiceLinks({ invoiceId: params.invoiceId, tenantId: tenant(req), provider: await getPaymentProvider(), context: context(req) });
});
export const subscriptionChangePreviewController = endpoint(async (req) => {
  const body = parseBilling(subscriptionChangePreviewSchema, req.body);
  return createSubscriptionChangePreview({ tenantId: tenant(req), targetPackageId: body.targetPackageId, billingInterval: body.billingInterval, provider: await getPaymentProvider(), context: context(req) });
});
export const subscriptionChangeController = endpoint(async (req) => {
  const body = parseBilling(subscriptionChangeSchema, req.body);
  return requestSubscriptionChange({ tenantId: tenant(req), previewId: body.previewId, idempotencyKey: body.idempotencyKey, provider: await getPaymentProvider(), context: context(req) });
});
export const cancellationController = endpoint(async (req) => {
  const body = parseBilling(cancellationSchema, req.body);
  return requestCancellation({ tenantId: tenant(req), cancellationType: body.cancellationType, idempotencyKey: body.idempotencyKey, provider: await getPaymentProvider(), context: context(req) });
});
export const reactivationController = endpoint(async (req) => {
  const body = parseBilling(reactivationSchema, req.body);
  return requestReactivation({ tenantId: tenant(req), idempotencyKey: body.idempotencyKey, provider: await getPaymentProvider(), context: context(req) });
});
export const billingOperationController = endpoint(async (req) => {
  const params = parseBilling(operationIdSchema, req.params);
  return getCompanyBillingOperation({ operationId: params.operationId, tenantId: tenant(req), context: context(req) });
});
export const refundRequestController = endpoint(async (req) => {
  const body = parseBilling(refundRequestSchema, req.body);
  return createRefundRequest({ tenantId: tenant(req), previewId: body.previewId, idempotencyKey: body.idempotencyKey, provider: await getPaymentProvider(), context: context(req) });
});
export const refundEligibilityPreviewController = endpoint(async (req) => {
  const body = parseBilling(refundEligibilityPreviewSchema, req.body);
  return createRefundEligibilityPreview({ tenantId: tenant(req), invoiceId: body.invoiceId, context: context(req) });
});
export const refundListController = endpoint(async (req) => {
  const query = parseBilling(refundListSchema, req.query);
  return listTenantRefundRequests({ tenantId: tenant(req), ...query, context: context(req) });
});
export const refundDetailController = endpoint(async (req) => {
  const params = parseBilling(refundIdSchema, req.params);
  return getTenantRefundRequest({ tenantId: tenant(req), refundId: params.refundId, context: context(req) });
});
