import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission, type PermissionValue } from "../permissions/permissions.catalog.js";
import { createChatController } from "./chat.controller.js";
import type { ChatService } from "./chat.service.js";
import { createEntitlementGuard } from "../entitlement/middlewares/entitlement.middleware.js";
import { getEntitlementService } from "../entitlement/entitlement.service.js";
import {
  createRateLimiter,
  buildHashedIpRateLimitKey,
} from "../../common/middlewares/rateLimit.middleware.js";
import {
  getVisionMaxFileSizeBytes,
  isAllowedVisionMimeType,
} from "./chat.vision.js";

const requireSelfPermission = (permission: PermissionValue) => requirePermission(permission, {
  resourceContext: (request) => request.auth && request.tenantId
    ? { tenantId: request.tenantId, ownerId: request.auth.userId }
    : undefined,
});

// ── Entitlement guards ─────────────────────────────────────────────────────

const svc = getEntitlementService();

const queryGuard = createEntitlementGuard(svc, {
  dimension: "queriesPerMonth",
  amount: 1,
  failMode: "fail-closed",
});

const visionUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: getVisionMaxFileSizeBytes() },
  fileFilter: (_req, file, callback) => {
    if (isAllowedVisionMimeType(file.mimetype)) {
      callback(null, true);
    } else {
      callback(
        Object.assign(
          new Error(`File type ${file.mimetype} is not supported`),
          { code: "UNSUPPORTED_FILE_TYPE" },
        ) as Error & { code: string },
      );
    }
  },
});

const ALLOWED_AUDIO_MIME_TYPES = [
  "audio/webm",
  "audio/wav",
  "audio/mp4",
  "audio/ogg",
  "audio/mpeg",
  "audio/x-m4a",
  "audio/m4a",
  "audio/aac",
];

const sttUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const mime = file.mimetype.toLowerCase();
    const isAllowed =
      mime.startsWith("audio/") ||
      ALLOWED_AUDIO_MIME_TYPES.some((type) =>
        mime.includes(type.split("/")[1]),
      );
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(
        Object.assign(
          new Error(`Audio type ${file.mimetype} is not supported`),
          { code: "UNSUPPORTED_FILE_TYPE" },
        ) as Error & { code: string },
      );
    }
  },
});

const sttRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: "Too many audio transcription requests. Please wait a minute before trying again.",
  keyGenerator: (req) =>
    req.auth?.userId ? `stt:${req.auth.userId}` : `stt:ip:${buildHashedIpRateLimitKey(req.ip)}`,
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
    requireSelfPermission(Permission.CHAT_READ),
    controller.listConversations,
  );

  router.get(
    "/conversations/:conversationId/messages",
    authenticate,
    tenantScoping,
    requireSelfPermission(Permission.CHAT_READ),
    controller.getConversationMessages,
  );

  router.delete(
    "/conversations/:conversationId",
    authenticate,
    tenantScoping,
    requireSelfPermission(Permission.CHAT_DELETE),
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
    requireSelfPermission(Permission.CHAT_CREATE),
    queryGuard,
    controller.sendMessage,
  );

  /**
   * @openapi
   * /chat/send/stream:
   *   post:
   *     summary: Send a chat question and stream stage progress (SSE)
   *     description: |
   *       Same request/response contract as /chat/send, but the
   *       reply is a Server-Sent Events stream. Events - `stage` with
   *       {"stage":"intent|search|evidence|answer|verify|finalize"}, `done`
   *       with {"success":true,"data":<same payload as /chat/send>}, and
   *       `error` with {"success":false,"error","message","statusCode"}.
   *       Heartbeat comments (": ping") keep proxies alive.
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
   *               conversationId:
   *                 type: string
   *     responses:
   *       200:
   *         description: Server-Sent Events stream of stage progress
   *         content:
   *           text/event-stream:
   *             schema:
   *               type: string
   *       400:
   *         description: Validation failed (plain JSON)
   *       401:
   *         description: Authentication required (plain JSON)
   *       403:
   *         description: Insufficient permissions or entitlement limit reached (plain JSON)
   */
  router.post(
    "/send/stream",
    authenticate,
    tenantScoping,
    requireSelfPermission(Permission.CHAT_CREATE),
    queryGuard,
    controller.sendMessageStream,
  );

  /**
   * @openapi
   * /chat/vision:
   *   post:
   *     summary: Analyze an image with a question
   *     description: Uploads an image (JPG, PNG or WebP, max 10MB) along with
   *       a question and returns the AI's text analysis of the image. The
   *       image and the exchange are persisted to conversation history.
   *       Supports retries via an optional clientMessageId idempotency key.
   *     tags: [Chat]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required: [image, question]
   *             properties:
   *               image:
   *                 type: string
   *                 format: binary
   *                 description: Image file (image/jpeg, image/png or image/webp)
   *               question:
   *                 type: string
   *                 minLength: 1
   *                 maxLength: 2000
   *                 description: The question about the image
   *               conversationId:
   *                 type: string
   *                 description: Existing conversation to continue, or omitted to start a new one
   *               clientMessageId:
   *                 type: string
   *                 description: Client-generated idempotency key for safe retries
   *     responses:
   *       200:
   *         description: AI text analysis of the image
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
   *                     attachment:
   *                       type: object
   *                       properties:
   *                         id:
   *                           type: string
   *                         fileName:
   *                           type: string
   *                         mimeType:
   *                           type: string
   *                         sizeBytes:
   *                           type: integer
   *       400:
   *         description: Validation failed or unsupported file type/size
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Insufficient permissions or entitlement limit reached
   *       502:
   *         description: Vision provider unavailable
   */
  router.post(
    "/vision",
    authenticate,
    tenantScoping,
    requireSelfPermission(Permission.CHAT_CREATE),
    queryGuard,
    visionUpload.single("image"),
    controller.sendVisionMessage,
  );

  /**
   * @openapi
   * /chat/attachments/{attachmentId}:
   *   get:
   *     summary: Fetch a chat image attachment
   *     description: Returns the stored image bytes for an attachment in a
   *       conversation owned by the authenticated user. The response is an
   *       inline image stream with no-store caching.
   *     tags: [Chat]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: attachmentId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Image stream
   *         content:
   *           image/*:
   *             schema:
   *               type: string
   *               format: binary
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Insufficient permissions
   *       404:
   *         description: Attachment not found
   */
  router.get(
    "/attachments/:attachmentId",
    authenticate,
    tenantScoping,
    requireSelfPermission(Permission.CHAT_READ),
    controller.getAttachment,
  );

  /**
   * @openapi
   * /chat/stt:
   *   post:
   *     summary: Transcribe audio to text
   *     description: Uploads an audio file (WebM, WAV, MP4, OGG, max 10MB) and returns transcribed text.
   *     tags: [Chat]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required: [audio]
   *             properties:
   *               audio:
   *                 type: string
   *                 format: binary
   *     responses:
   *       200:
   *         description: Transcribed text
   *       400:
   *         description: Validation failed or unsupported audio format
   *       429:
   *         description: Rate limit exceeded (max 10 requests/min)
   *       503:
   *         description: STT Gateway unavailable
   */
  router.post(
    "/stt",
    authenticate,
    tenantScoping,
    requireSelfPermission(Permission.CHAT_CREATE),
    sttRateLimiter,
    sttUpload.single("audio"),
    controller.transcribeAudio,
  );

  return router;
}
