import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { authorize } from "../../common/middlewares/authorize.middleware.js";
import { requirePlatformTenant } from "../../common/middlewares/platformTenant.middleware.js";
import { listPaymentEvents, reprocessEvent } from "./payment-webhooks.service.js";

const router = Router();
router.use(authenticate, authorize("SUPER_ADMIN"), requirePlatformTenant);

router.get("/admin/payment-events", async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
    const status = req.query.status as string | undefined;
    const eventType = req.query.eventType as string | undefined;

    const result = await listPaymentEvents({ page, pageSize, status, eventType });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.post("/admin/payment-events/:eventId/reprocess", async (req, res, next) => {
  try {
    await reprocessEvent(req.params.eventId);
    res.json({ success: true, data: { reprocessed: true } });
  } catch (error) {
    next(error);
  }
});

export default router;
