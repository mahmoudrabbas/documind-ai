import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { requirePlatformTenant } from "../../common/middlewares/platformTenant.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import {
  platformRefundConfirmController,
  platformRefundDetailController,
  platformRefundListController,
  platformRefundRejectController,
  platformRefundRetryController,
} from "./refund-admin.controller.js";

const router = Router();
router.use(authenticate, requirePlatformTenant);

router.get("/refunds", requirePermission(Permission.BILLING_READ), platformRefundListController);
router.get("/refunds/:refundId", requirePermission(Permission.BILLING_READ), platformRefundDetailController);
router.post("/refunds/:refundId/confirm", requirePermission(Permission.BILLING_REFUND_CONFIRM), platformRefundConfirmController);
router.post("/refunds/:refundId/reject", requirePermission(Permission.BILLING_REFUND_CONFIRM), platformRefundRejectController);
router.post("/refunds/:refundId/retry", requirePermission(Permission.BILLING_REFUND_CONFIRM), platformRefundRetryController);

export default router;
