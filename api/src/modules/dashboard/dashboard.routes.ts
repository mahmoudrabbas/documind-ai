import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { getSummary } from "./dashboard.controller.js";

const router = Router();

router.use(authenticate, tenantScoping);
router.get(
  "/summary",
  requirePermission(Permission.ANALYTICS_READ),
  getSummary,
);

export default router;
