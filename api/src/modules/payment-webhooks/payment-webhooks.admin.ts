import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { requirePlatformTenant } from "../../common/middlewares/platformTenant.middleware.js";
import { listPaymentEvents, reprocessEvent } from "./payment-webhooks.service.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { requireAuthenticatedAuditActor } from "../../common/observability/auditActor.js";
import type { Request } from "express";

function operationContext(req: Request) {
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

const router = Router();
router.use(authenticate, requirePlatformTenant);

router.get("/admin/payment-events", requirePermission(Permission.BILLING_READ), async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
    const status = req.query.status as string | undefined;
    const eventType = req.query.eventType as string | undefined;

    const result = await listPaymentEvents(
      { page, pageSize, status, eventType },
      operationContext(req),
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.post("/admin/payment-events/:eventId/reprocess", requirePermission(Permission.BILLING_MANAGE), async (req, res, next) => {
  try {
    const eventId = Array.isArray(req.params.eventId)
      ? req.params.eventId[0]
      : req.params.eventId;
    await reprocessEvent(eventId, operationContext(req));
    res.json({ success: true, data: { reprocessed: true } });
  } catch (error) {
    next(error);
  }
});

export default router;
