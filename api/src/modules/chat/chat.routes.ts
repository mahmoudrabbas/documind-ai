import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { createChatController } from "./chat.controller.js";
import type { ChatService } from "./chat.service.js";
import { createEntitlementGuard } from "../entitlement/middlewares/entitlement.middleware.js";
import { getEntitlementService } from "../entitlement/entitlement.service.js";

// ── Entitlement guards ─────────────────────────────────────────────────────

const svc = getEntitlementService();

const queryGuard = createEntitlementGuard(svc, {
  dimension: "queriesPerMonth",
  amount: 1,
  failMode: "fail-closed",
});

export function createChatRoutes(service: ChatService): Router {
  const router = Router();
  const controller = createChatController(service);

  /**
   * @openapi
   * /chat/conversations:
   *   get:
   *     summary: List conversations
   *     description: Returns a paginated list of the authenticated user's
   *       chat conversations ordered by most recently updated.
   *     tags: [Chat]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *       - in: query
   *         name: pageSize
   *         schema:
   *           type: integer
   *           default: 20
   *           maximum: 50
   *     responses:
   *       200:
   *         description: List of conversations
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: object
   *                   properties:
   *                     conversations:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           id:
   *                             type: string
   *                           title:
   *                             type: string
   *                           lastMessage:
   *                             type: string
   *                           updatedAt:
   *                             type: string
   *                             format: date-time
   *                           messageCount:
   *                             type: integer
   *                     total:
   *                       type: integer
   *                     page:
   *                       type: integer
   *                     pageSize:
   *                       type: integer
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Insufficient permissions
   */
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

  /**
   * @openapi
   * /chat/send:
   *   post:
   *     summary: Send a message
   *     description: Sends a user message to the AI assistant. The message is
   *       answered using RAG over the tenant's documents with citations.
   *       Creates a new conversation when conversationId is omitted.
   *     tags: [Chat]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [message]
   *             properties:
   *               message:
   *                 type: string
   *                 minLength: 1
   *                 maxLength: 2000
   *                 description: The user's question or instruction
   *                 example: What is the remote work policy?
   *               conversationId:
   *                 type: string
   *                 description: Existing conversation to continue, or omitted to start a new one
   *     responses:
   *       200:
   *         description: Assistant reply with citations
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 data:
   *                   type: object
   *                   properties:
   *                     messageId:
   *                       type: string
   *                     answer:
   *                       type: string
   *                     conversationId:
   *                       type: string
   *                     sources:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           chunkId:
   *                             type: string
   *                           documentId:
   *                             type: string
   *                           documentTitle:
   *                             type: string
   *                           sectionTitle:
   *                             type: string
   *                           pageNumber:
   *                             type: integer
   *                           score:
   *                             type: number
   *       400:
   *         description: Validation failed
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Insufficient permissions or entitlement limit reached
   */
  router.post(
    "/send",
    authenticate,
    tenantScoping,
    requirePermission(Permission.CHAT_CREATE),
    queryGuard,
    controller.sendMessage,
  );

  router.post(
    "/stream",
    authenticate,
    tenantScoping,
    requirePermission(Permission.CHAT_CREATE),
    queryGuard,
    controller.streamMessage,
  );

  return router;
}
