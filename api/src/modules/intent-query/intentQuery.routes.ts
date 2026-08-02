import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  analyzeQueryController,
  getQueryPlanDebugController,
} from "./intentQuery.controller.js";
import { createEntitlementGuard } from "../entitlement/middlewares/entitlement.middleware.js";
import { getEntitlementService } from "../entitlement/entitlement.service.js";

const router = Router();

// Standard middlewares for authentication and tenant isolation
router.use(authenticate);
router.use(tenantScoping);

// ── Entitlement guards ─────────────────────────────────────────────────────

const svc = getEntitlementService();

const queryGuard = createEntitlementGuard(svc, {
  dimension: "queriesPerMonth",
  amount: 1,
  failMode: "fail-closed",
});

// POST /intent-query/analyze — requires chat:create permission
router.post(
  "/analyze",
  requirePermission(Permission.CHAT_CREATE),
  queryGuard,
  analyzeQueryController
);

// GET /intent-query/debug/:traceId — requires chat:read permission (controller also rechecks for admins and tenant)
router.get(
  "/debug/:traceId",
  requirePermission(Permission.CHAT_READ),
  getQueryPlanDebugController
);

export default router;
