import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { requirePlatformTenant } from "../../common/middlewares/platformTenant.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  getTenantController,
  getTenantDetailController,
  listTenantsController,
  updateTenantController,
  suspendTenantController,
  reinstateTenantController,
  previewSuspendController,
  previewReinstateController,
} from "./admin.controller.js";

const router = Router();

router.get(
  "/tenants",
  authenticate,
  requirePlatformTenant,
  requirePermission(Permission.COMPANY_SETTINGS_READ),
  listTenantsController,
);

router.get(
  "/tenants/:id",
  authenticate,
  requirePlatformTenant,
  requirePermission(Permission.COMPANY_SETTINGS_READ),
  getTenantController,
);

router.get(
  "/tenants/:id/detail",
  authenticate,
  requirePlatformTenant,
  requirePermission(Permission.COMPANY_SETTINGS_READ),
  getTenantDetailController,
);

router.get(
  "/tenants/:id/preview/suspend",
  authenticate,
  requirePlatformTenant,
  requirePermission(Permission.COMPANY_SETTINGS_READ),
  previewSuspendController,
);

router.get(
  "/tenants/:id/preview/reinstate",
  authenticate,
  requirePlatformTenant,
  requirePermission(Permission.COMPANY_SETTINGS_READ),
  previewReinstateController,
);

router.patch(
  "/tenants/:id",
  authenticate,
  requirePlatformTenant,
  requirePermission(Permission.COMPANY_SETTINGS_UPDATE),
  requirePermission(Permission.BILLING_MANAGE),
  updateTenantController,
);

router.post(
  "/tenants/:id/suspend",
  authenticate,
  requirePlatformTenant,
  requirePermission(Permission.COMPANY_SETTINGS_UPDATE),
  suspendTenantController,
);

router.post(
  "/tenants/:id/reinstate",
  authenticate,
  requirePlatformTenant,
  requirePermission(Permission.COMPANY_SETTINGS_UPDATE),
  reinstateTenantController,
);

export default router;
