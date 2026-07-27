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

  router.get(
    "/conversations",
    authenticate,
    tenantScoping,
    requirePermission(Permission.CHAT_READ),
    controller.listConversations,
  );

  router.get(
    "/conversations/:conversationId/messages",
    authenticate,
    tenantScoping,
    requirePermission(Permission.CHAT_READ),
    controller.getConversationMessages,
  );

  router.delete(
    "/conversations/:conversationId",
    authenticate,
    tenantScoping,
    requirePermission(Permission.CHAT_DELETE),
    controller.deleteConversation,
  );

  router.post(
    "/send",
    authenticate,
    tenantScoping,
    requirePermission(Permission.CHAT_CREATE),
    controller.sendMessage,
  );

  return router;
}
