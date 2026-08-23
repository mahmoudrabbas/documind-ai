import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { createRateLimiter } from "../../common/middlewares/rateLimit.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { handleCopilotMessage } from "./copilot.controller.js";
import { handleGetGuideFlows, handleResolveGuideFlow, handleCreateActionPlan, handleConfirmAction, handleGetActionStatus, handleAnswerActionDraft, handleCancelActionDraft } from "./copilot.controller.js";

const router = Router();

router.use(authenticate);
router.use(tenantScoping);

// Copilot-specific rate limit: 30 requests per minute for mutating endpoints
// to bound LLM inference cost per user.
const copilotRateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 30,
  message: "Too many copilot requests. Please wait a moment and try again.",
});

router.post(
  "/message",
  copilotRateLimiter,
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
  copilotRateLimiter,
  requirePermission(Permission.CHAT_CREATE),
  handleCreateActionPlan,
);

router.post(
  "/action/:runId/confirm",
  copilotRateLimiter,
  requirePermission(Permission.CHAT_CREATE),
  handleConfirmAction,
);

router.get(
  "/action/:runId",
  requirePermission(Permission.CHAT_READ),
  handleGetActionStatus,
);

router.post(
  "/action/draft/:draftId",
  copilotRateLimiter,
  requirePermission(Permission.CHAT_CREATE),
  handleAnswerActionDraft,
);

router.delete(
  "/action/draft/:draftId",
  requirePermission(Permission.CHAT_READ),
  handleCancelActionDraft,
);

export default router;