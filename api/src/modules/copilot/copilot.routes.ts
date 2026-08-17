import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { handleCopilotMessage } from "./copilot.controller.js";
import { handleGetGuideFlows, handleResolveGuideFlow, handleCreateActionPlan, handleConfirmAction, handleGetActionStatus } from "./copilot.controller.js";

const router = Router();

router.use(authenticate);
router.use(tenantScoping);

router.post(
  "/message",
  requirePermission(Permission.CHAT_CREATE),
  handleCopilotMessage,
);

router.get(
  "/guide/flows",
  requirePermission(Permission.CHAT_READ),
  handleGetGuideFlows,
);

router.post(
  "/guide/resolve",
  requirePermission(Permission.CHAT_READ),
  handleResolveGuideFlow,
);

router.post(
  "/action",
  requirePermission(Permission.CHAT_CREATE),
  handleCreateActionPlan,
);

router.post(
  "/action/:runId/confirm",
  requirePermission(Permission.CHAT_CREATE),
  handleConfirmAction,
);

router.get(
  "/action/:runId",
  requirePermission(Permission.CHAT_READ),
  handleGetActionStatus,
);

export default router;