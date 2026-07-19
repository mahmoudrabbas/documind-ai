import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { requirePlatformTenant } from "../../common/middlewares/platformTenant.middleware.js";
import { reconciliationController } from "./reconciliation.controller.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";

const router = Router();
router.use(
  authenticate,
  requirePlatformTenant,
  requirePermission(Permission.BILLING_READ),
);
router.post("/reconciliation/subscriptions", reconciliationController);

export default router;
