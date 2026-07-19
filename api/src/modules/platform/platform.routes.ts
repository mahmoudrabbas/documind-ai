import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
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
router.use(authenticate, requirePlatformTenant);
router.get("/overview", requirePermission(Permission.AUDIT_READ), overviewController);
router.get("/packages", requirePermission(Permission.BILLING_READ), packagesController);
router.post("/packages", requirePermission(Permission.BILLING_MANAGE), createPackageController);
router.get("/packages/:id", requirePermission(Permission.BILLING_READ), packageController);
router.patch("/packages/:id", requirePermission(Permission.BILLING_MANAGE), updatePackageController);
router.get("/subscriptions", requirePermission(Permission.BILLING_READ), subscriptionsController);
router.patch("/subscriptions/:tenantId", requirePermission(Permission.BILLING_MANAGE), updateSubscriptionController);
router.get("/users", requirePermission(Permission.USERS_READ), platformUsersController);
router.get("/usage", requirePermission(Permission.ANALYTICS_READ), usageController);
router.get("/jobs", requirePermission(Permission.DOCUMENTS_READ), jobsController);
router.get("/system-health", requirePermission(Permission.COMPANY_SETTINGS_READ), healthController);
router.get("/audit", requirePermission(Permission.AUDIT_READ), auditController);
router.get("/ai-configuration", requirePermission(Permission.COMPANY_SETTINGS_READ), aiConfigurationController);
router.patch("/ai-configuration", requirePermission(Permission.COMPANY_SETTINGS_UPDATE), updateAiConfigurationController);
router.get("/settings", requirePermission(Permission.COMPANY_SETTINGS_READ), settingsController);
router.patch("/settings", requirePermission(Permission.COMPANY_SETTINGS_UPDATE), updateSettingsController);
export default router;
