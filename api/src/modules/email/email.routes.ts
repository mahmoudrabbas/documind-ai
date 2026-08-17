import { Router } from "express";
import {
  listEmails,
  getEmailStatus,
  resendEmail,
  cancelEmail
} from "./email.controller.js";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";

const router = Router();

// Requires valid user/tenant and specifically the permission to manage emails
router.use(authenticate, tenantScoping);

/**
 * @openapi
 * /emails:
 *   get:
 *     summary: List emails
 *     description: Returns a paginated list of transactional email messages
 *       sent for the tenant, newest first. Supports filtering by delivery
 *       state, recipient email, and template id.
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of results per page (max 100)
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         description: Filter by message state
 *       - in: query
 *         name: recipientEmail
 *         schema:
 *           type: string
 *         description: Filter by recipient email
 *       - in: query
 *         name: templateId
 *         schema:
 *           type: string
 *         description: Filter by template id
 *     responses:
 *       200:
 *         description: Paginated list of email messages
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       recipientEmail:
 *                         type: string
 *                       templateId:
 *                         type: string
 *                       language:
 *                         type: string
 *                       subject:
 *                         type: string
 *                       state:
 *                         type: string
 *                       priority:
 *                         type: integer
 *                       scheduledFor:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get("/", requirePermission(Permission.COMPANY_SETTINGS_READ), listEmails);

/**
 * @openapi
 * /emails/{messageId}:
 *   get:
 *     summary: Get email status
 *     description: Returns a single email message with its full delivery
 *       history, including each delivery attempt. The message must belong to
 *       the caller's tenant.
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *         description: Email message id
 *     responses:
 *       200:
 *         description: Email message and delivery attempts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         recipientEmail:
 *                           type: string
 *                         templateId:
 *                           type: string
 *                         subject:
 *                           type: string
 *                         state:
 *                           type: string
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                     attempts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           attemptNumber:
 *                             type: integer
 *                           state:
 *                             type: string
 *                           startedAt:
 *                             type: string
 *                             format: date-time
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Email message not found
 */
router.get("/:messageId", requirePermission(Permission.COMPANY_SETTINGS_READ), getEmailStatus);

/**
 * @openapi
 * /emails/{messageId}/resend:
 *   post:
 *     summary: Resend email
 *     description: Resends a failed or cancelled email message. The message is
 *       reset to pending, assigned a fresh idempotency key, and re-dispatched
 *       to the queue for delivery.
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *         description: Email message id
 *     responses:
 *       200:
 *         description: Email queued for resend
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     state:
 *                       type: string
 *                       example: QUEUED
 *       400:
 *         description: Only failed or cancelled messages can be resent
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Email message not found
 */
router.post("/:messageId/resend", requirePermission(Permission.COMPANY_SETTINGS_UPDATE), resendEmail);

/**
 * @openapi
 * /emails/{messageId}/cancel:
 *   post:
 *     summary: Cancel email
 *     description: Cancels a pending or queued email message before it is
 *       delivered. The worker short-circuits the queued job once the message
 *       is marked as cancelled.
 *     tags: [Email]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *         description: Email message id
 *     responses:
 *       200:
 *         description: Email cancelled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *       400:
 *         description: Only pending or queued messages can be cancelled
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Email message not found
 */
router.post("/:messageId/cancel", requirePermission(Permission.COMPANY_SETTINGS_UPDATE), cancelEmail);

export default router;
