import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { requirePlatformTenant } from "../../common/middlewares/platformTenant.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  enqueueJobController,
  getJobMetricsController,
  getJobStatusController,
  replayJobController,
} from "./jobs.controller.js";
import { createCapabilityGuard } from "../entitlement/middlewares/entitlement.middleware.js";
import { getEntitlementService } from "../entitlement/entitlement.service.js";

const router = Router();

// ── Entitlement guards ─────────────────────────────────────────────────────

const retentionGuard = createCapabilityGuard(getEntitlementService(), {
  capability: "retentionDays",
  value: (req) => req.body?.retentionDays ?? 90,
  failMode: "fail-open",
});

/**
 * Authenticated enqueue. Tenant/actor derived from auth context (never body).
 * Any authenticated role may enqueue against the JobDispatcher port; product
 * modules build their own typed jobs here.
 */
router.post(
  "/enqueue",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_OCR_PROCESS),
  retentionGuard,
  enqueueJobController,
);

/**
 * Super Admin-only queue diagnostics. Inspection, metrics, and replay are
 * explicitly restricted per the security/tenancy requirements.
 */
router.get(
  "/platform/jobs/metrics",
  authenticate,
  requirePlatformTenant,
  requirePermission(Permission.COMPANY_SETTINGS_READ),
  getJobMetricsController,
);

router.get(
  "/platform/jobs/:jobId",
  authenticate,
  requirePlatformTenant,
  requirePermission(Permission.COMPANY_SETTINGS_READ),
  getJobStatusController,
);

router.post(
  "/platform/jobs/:jobId/replay",
  authenticate,
  requirePlatformTenant,
  requirePermission(Permission.COMPANY_SETTINGS_UPDATE),
  replayJobController,
);

export default router;
