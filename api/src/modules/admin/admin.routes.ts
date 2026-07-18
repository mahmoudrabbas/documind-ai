import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { authorize } from "../../common/middlewares/authorize.middleware.js";
import { requirePlatformTenant } from "../../common/middlewares/platformTenant.middleware.js";
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
  authorize("SUPER_ADMIN"),
  requirePlatformTenant,
  listTenantsController,
);

router.get(
  "/tenants/:id",
  authenticate,
  authorize("SUPER_ADMIN"),
  requirePlatformTenant,
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
  authorize("SUPER_ADMIN"),
  requirePlatformTenant,
  updateTenantController,
);

export default router;
