import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { createRateLimiter } from "../../common/middlewares/rateLimit.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import type { CopilotService } from "./copilot.service.js";
import { createCopilotController } from "./copilot.controller.js";

const copilotMutationRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: "Too many copilot requests, please slow down.",
});

export function createCopilotRoutes(service: CopilotService): Router {
  const router = Router();
  const controller = createCopilotController(service);

  router.post("/plan", authenticate, tenantScoping, requirePermission(Permission.COPILOT_USE), copilotMutationRateLimiter, controller.generatePlan);
  router.post("/execute", authenticate, tenantScoping, requirePermission(Permission.COPILOT_USE), copilotMutationRateLimiter, controller.executeStep);
  router.post("/confirm", authenticate, tenantScoping, requirePermission(Permission.COPILOT_USE), copilotMutationRateLimiter, controller.confirmStep);
  router.get("/plans/:planId", authenticate, tenantScoping, requirePermission(Permission.COPILOT_USE), controller.getPlan);
  router.get("/plans/:planId/guide", authenticate, tenantScoping, requirePermission(Permission.COPILOT_USE), controller.getGuidePlan);
  router.get("/plans/:planId/events", authenticate, tenantScoping, requirePermission(Permission.COPILOT_USE), controller.streamPlanEvents);
  router.delete("/plans/:planId", authenticate, tenantScoping, requirePermission(Permission.COPILOT_USE), controller.cancelPlan);
  router.get("/suggestions", authenticate, tenantScoping, requirePermission(Permission.COPILOT_USE), controller.getSuggestions);

  return router;
}
