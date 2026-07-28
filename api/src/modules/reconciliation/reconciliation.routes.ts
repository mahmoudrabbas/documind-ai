import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { requirePlatformTenant } from "../../common/middlewares/platformTenant.middleware.js";
import {
  providerReconciliationController,
  reconciliationController,
  invoiceReconciliationController,
} from "./reconciliation.controller.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";

const router = Router();
router.use(
  authenticate,
  requirePlatformTenant,
);
router.post(
  "/reconciliation/subscriptions",
  requirePermission(Permission.BILLING_READ),
  reconciliationController,
);
router.post(
  "/reconciliation/invoices/:tenantId",
  requirePermission(Permission.BILLING_MANAGE, { denialAuditAction: "BILLING_AUTHORIZATION_DENIED", resourceType: "Permission" }),
  invoiceReconciliationController,
);
router.post(
  "/reconciliation/subscriptions/:tenantId/sync-provider",
  requirePermission(Permission.BILLING_MANAGE),
  providerReconciliationController,
);

export default router;
