import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { authorize } from "../../common/middlewares/authorize.middleware.js";
import { requirePlatformTenant } from "../../common/middlewares/platformTenant.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  listOverridesController,
  removeOverrideController,
  setOverrideController,
  reconcileController,
  listReconciliationReportsController,
} from "./entitlement.admin.controller.js";

const router = Router();
router.use(authenticate, requirePlatformTenant);

/**
 * GET /overrides
 * List quota overrides with optional tenantId filter and pagination.
 * SUPER_ADMIN only.
 */
router.get(
  "/overrides",
  requirePermission(Permission.BILLING_MANAGE),
  authorize("SUPER_ADMIN"),
  listOverridesController,
);

/**
 * PUT /overrides/:tenantId
 * Set or update a quota override for a tenant dimension.
 * SUPER_ADMIN only.
 */
router.put(
  "/overrides/:tenantId",
  requirePermission(Permission.BILLING_MANAGE),
  authorize("SUPER_ADMIN"),
  setOverrideController,
);

/**
 * DELETE /overrides/:tenantId/:dimension
 * Remove a quota override.
 * SUPER_ADMIN only.
 */
router.delete(
  "/overrides/:tenantId/:dimension",
  requirePermission(Permission.BILLING_MANAGE),
  authorize("SUPER_ADMIN"),
  removeOverrideController,
);

/**
 * POST /reconcile
 * Run an entitlement reconciliation sweep for a single tenant or all tenants.
 * SUPER_ADMIN only.
 */
router.post(
  "/reconcile",
  requirePermission(Permission.BILLING_MANAGE),
  authorize("SUPER_ADMIN"),
  reconcileController,
);

/**
 * GET /reconcile/reports
 * List persisted entitlement reconciliation reports.
 * SUPER_ADMIN only.
 */
router.get(
  "/reconcile/reports",
  requirePermission(Permission.BILLING_MANAGE),
  authorize("SUPER_ADMIN"),
  listReconciliationReportsController,
);

export default router;
