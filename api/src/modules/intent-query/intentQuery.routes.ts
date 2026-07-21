import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  analyzeQueryController,
  getQueryPlanDebugController,
} from "./intentQuery.controller.js";

const router = Router();

// Standard middlewares for authentication and tenant isolation
router.use(authenticate);
router.use(tenantScoping);

// POST /intent-query/analyze — requires chat:create permission
router.post(
  "/analyze",
  requirePermission(Permission.CHAT_CREATE),
  analyzeQueryController
);

// GET /intent-query/debug/:traceId — requires chat:read permission (controller also rechecks for admins and tenant)
router.get(
  "/debug/:traceId",
  requirePermission(Permission.CHAT_READ),
  getQueryPlanDebugController
);

export default router;
