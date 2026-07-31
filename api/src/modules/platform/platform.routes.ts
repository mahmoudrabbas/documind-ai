import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { requirePlatformTenant } from "../../common/middlewares/platformTenant.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  activatePackageController,
  aiConfigurationController,
  archivePackageController,
  auditController,
  createPackageController,
  healthController,
  jobsController,
  overviewController,
  packageController,
  packageImpactController,
  packagesController,
  platformUsersController,
  settingsController,
  subscriptionsController,
  subscriptionDetailController,
  subscriptionImpactController,
  provisionSubscriptionController,
  updateAiConfigurationController,
  updatePackageController,
  updateSettingsController,
  updateSubscriptionController,
  usageController,
} from "./platform.controller.js";
import { createCapabilityGuard } from "../entitlement/middlewares/entitlement.middleware.js";
import { getEntitlementService } from "../entitlement/entitlement.service.js";

const router = Router();
router.use(authenticate, requirePlatformTenant);

// ── Entitlement guards ─────────────────────────────────────────────────────

const modelSelectionGuard = createCapabilityGuard(getEntitlementService(), {
  capability: "allowedModels",
  value: (req) => req.body?.model ?? req.body?.modelName ?? "",
  failMode: "fail-closed",
});

router.get("/overview", requirePermission(Permission.AUDIT_READ), overviewController);
router.get("/packages", requirePermission(Permission.BILLING_READ), packagesController);
router.post("/packages", requirePermission(Permission.BILLING_MANAGE), createPackageController);
router.get("/packages/:id", requirePermission(Permission.BILLING_READ), packageController);
router.patch("/packages/:id", requirePermission(Permission.BILLING_MANAGE), updatePackageController);
router.post("/packages/:id/versions", requirePermission(Permission.BILLING_MANAGE), updatePackageController);
router.get("/packages/:id/impact", requirePermission(Permission.BILLING_READ), packageImpactController);
router.post("/packages/:id/archive", requirePermission(Permission.BILLING_MANAGE), archivePackageController);
router.post("/packages/:id/activate", requirePermission(Permission.BILLING_MANAGE), activatePackageController);
router.get("/subscriptions", requirePermission(Permission.BILLING_READ), subscriptionsController);
router.get("/subscriptions/:tenantId/impact", requirePermission(Permission.BILLING_READ), subscriptionImpactController);
router.get("/subscriptions/:tenantId", requirePermission(Permission.BILLING_READ), subscriptionDetailController);
router.post("/subscriptions/:tenantId", requirePermission(Permission.BILLING_MANAGE), provisionSubscriptionController);
router.patch("/subscriptions/:tenantId", requirePermission(Permission.BILLING_MANAGE), updateSubscriptionController);
router.get("/users", requirePermission(Permission.USERS_READ), platformUsersController);
router.get("/usage", requirePermission(Permission.ANALYTICS_READ), usageController);
router.get("/jobs", requirePermission(Permission.DOCUMENTS_READ), jobsController);
router.get("/system-health", requirePermission(Permission.COMPANY_SETTINGS_READ), healthController);
router.get("/audit", requirePermission(Permission.AUDIT_READ), auditController);
router.get("/ai-configuration", requirePermission(Permission.COMPANY_SETTINGS_READ), aiConfigurationController);
router.patch("/ai-configuration", requirePermission(Permission.COMPANY_SETTINGS_UPDATE), modelSelectionGuard, updateAiConfigurationController);
router.get("/settings", requirePermission(Permission.COMPANY_SETTINGS_READ), settingsController);
router.patch("/settings", requirePermission(Permission.COMPANY_SETTINGS_UPDATE), updateSettingsController);
export default router;
