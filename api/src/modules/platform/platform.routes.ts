import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { authorize } from "../../common/middlewares/authorize.middleware.js";
import { requirePlatformTenant } from "../../common/middlewares/platformTenant.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  aiConfigurationController,
  auditController,
  createPackageController,
  healthController,
  jobsController,
  overviewController,
  packageController,
  packagesController,
  platformUsersController,
  settingsController,
  subscriptionsController,
  updateAiConfigurationController,
  updatePackageController,
  updateSettingsController,
  updateSubscriptionController,
  usageController,
} from "./platform.controller.js";

const router = Router();
router.use(authenticate, authorize("SUPER_ADMIN"), requirePlatformTenant);
router.get("/overview", requirePermission(Permission.AUDIT_READ), overviewController);
router.get("/packages", packagesController);
router.post("/packages", createPackageController);
router.get("/packages/:id", packageController);
router.patch("/packages/:id", updatePackageController);
router.get("/subscriptions", subscriptionsController);
router.patch("/subscriptions/:tenantId", updateSubscriptionController);
router.get("/users", platformUsersController);
router.get("/usage", usageController);
router.get("/jobs", jobsController);
router.get("/system-health", healthController);
router.get("/audit", requirePermission(Permission.AUDIT_READ), auditController);
router.get("/ai-configuration", aiConfigurationController);
router.patch("/ai-configuration", updateAiConfigurationController);
router.get("/settings", settingsController);
router.patch("/settings", updateSettingsController);
export default router;
