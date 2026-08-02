import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import {
  getSettingsController,
  updateSettingsController,
} from "./settings.controller.js";

const router = Router();

router.use(authenticate, tenantScoping);
router.get(
  "/",
  requirePermission(Permission.COMPANY_SETTINGS_READ),
  getSettingsController,
);
router.put(
  "/",
  requirePermission(Permission.COMPANY_SETTINGS_UPDATE),
  updateSettingsController,
);

export default router;
