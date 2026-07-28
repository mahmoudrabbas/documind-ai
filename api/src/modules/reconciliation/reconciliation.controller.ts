import type { NextFunction, Request, Response } from "express";
import {
  reconcileSubscriptions,
  syncTenantSubscriptionFromProvider,
} from "./reconciliation.service.js";
import { AppError } from "../../common/errors/AppError.js";
import { requireAuthenticatedAuditActor } from "../../common/observability/auditActor.js";
import { getPaymentProvider } from "../checkout/payment-provider-loader.js";
import { reconcileTenantInvoices } from "../billing/invoice-synchronization.service.js";
import { authorizePlatformOperation } from "../permissions/permissions.operation.js";
import { Permission } from "../permissions/permissions.catalog.js";

export async function reconciliationController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.auth || !req.tenantId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }
    const actor = requireAuthenticatedAuditActor({
      tenantId: req.tenantId,
      actorId: req.auth.userId,
      actorEmail: req.auth.email,
      actorRole: req.auth.role,
    });
    const result = await reconcileSubscriptions({
      tenantId: actor.tenantId,
      actorId: actor.actorId,
      actorEmail: actor.actorEmail,
      actorRole: actor.actorRole,
      traceId: req.traceId,
      requestId: req.requestId,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function providerReconciliationController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.auth || !req.tenantId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }
    const actor = requireAuthenticatedAuditActor({
      tenantId: req.tenantId,
      actorId: req.auth.userId,
      actorEmail: req.auth.email,
      actorRole: req.auth.role,
    });
    const tenantId = Array.isArray(req.params.tenantId)
      ? req.params.tenantId[0]
      : req.params.tenantId;
    const result = await syncTenantSubscriptionFromProvider(tenantId, {
      tenantId: actor.tenantId,
      actorId: actor.actorId,
      actorEmail: actor.actorEmail,
      actorRole: actor.actorRole,
      traceId: req.traceId,
      requestId: req.requestId,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function invoiceReconciliationController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.auth || !req.tenantId) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    const actor = requireAuthenticatedAuditActor({ tenantId: req.tenantId, actorId: req.auth.userId, actorEmail: req.auth.email, actorRole: req.auth.role });
    await authorizePlatformOperation(actor, Permission.BILLING_MANAGE);
    const tenantId = Array.isArray(req.params.tenantId) ? req.params.tenantId[0] : req.params.tenantId;
    const result = await reconcileTenantInvoices({ tenantId, provider: await getPaymentProvider(), maxRecords: 200, context: { ...actor, traceId: req.traceId, requestId: req.requestId } });
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
}
