import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { authorize } from "../../common/middlewares/authorize.middleware.js";
import { requirePlatformTenant } from "../../common/middlewares/platformTenant.middleware.js";
import {
  enqueueJobController,
  getJobMetricsController,
  getJobStatusController,
  replayJobController,
} from "./jobs.controller.js";

const router = Router();

/**
 * Authenticated enqueue. Tenant/actor derived from auth context (never body).
 * Any authenticated role may enqueue against the JobDispatcher port; product
 * modules build their own typed jobs here.
 */
router.post("/enqueue", authenticate, enqueueJobController);

/**
 * Super Admin-only queue diagnostics. Inspection, metrics, and replay are
 * explicitly restricted per the security/tenancy requirements.
 */
router.get(
  "/platform/jobs/metrics",
  authenticate,
  authorize("SUPER_ADMIN"),
  requirePlatformTenant,
  getJobMetricsController,
);

router.get(
  "/platform/jobs/:jobId",
  authenticate,
  authorize("SUPER_ADMIN"),
  requirePlatformTenant,
  getJobStatusController,
);

router.post(
  "/platform/jobs/:jobId/replay",
  authenticate,
  authorize("SUPER_ADMIN"),
  requirePlatformTenant,
  replayJobController,
);

export default router;
