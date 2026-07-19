import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { requirePlatformTenant } from "../../common/middlewares/platformTenant.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  getTenantController,
  listTenantsController,
  updateTenantController,
} from "./admin.controller.js";

const router = Router();

/**
 * GET /platform/tenants
 * List all tenants with optional filters (status, plan) and pagination
 * Requires SUPER_ADMIN role
 */
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

/**
 * PATCH /platform/tenants/:id
 * Suspend, reinstate, or change plan for a specific tenant
 * Requires SUPER_ADMIN role
 */
router.patch(
  "/tenants/:id",
  authenticate,
  requirePlatformTenant,
  requirePermission(Permission.COMPANY_SETTINGS_UPDATE),
  requirePermission(Permission.BILLING_MANAGE),
  updateTenantController,
);

export default router;
