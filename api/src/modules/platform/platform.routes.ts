import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { authorize } from "../../common/middlewares/authorize.middleware.js";
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
router.use(authenticate, authorize("SUPER_ADMIN"));
router.get("/overview", overviewController);
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
router.get("/audit", auditController);
router.get("/ai-configuration", aiConfigurationController);
router.patch("/ai-configuration", updateAiConfigurationController);
router.get("/settings", settingsController);
router.patch("/settings", updateSettingsController);
export default router;
