import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { createChatController } from "./chat.controller.js";
import type { ChatService } from "./chat.service.js";

export function createChatRoutes(service: ChatService): Router {
  const router = Router();
  const controller = createChatController(service);

  router.post(
    "/send",
    authenticate,
    tenantScoping,
    requirePermission(Permission.CHAT_CREATE),
    controller.sendMessage,
  );

  return router;
}
