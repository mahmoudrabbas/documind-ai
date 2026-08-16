import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  submitFeedbackController,
  getMyFeedbackForMessageController,
  listFeedbackController,
  getFeedbackStatsController,
} from "./feedback.controller.js";
import { validateSubmitFeedback, validateListFeedbackQuery } from "./feedback.validator.js";

const router = Router();
const selfResourceContext = (request: import("express").Request) => request.auth && request.tenantId
  ? { tenantId: request.tenantId, ownerId: request.auth.userId }
  : undefined;

router.use(authenticate, tenantScoping);

/**
 * @openapi
 * /feedback:
 *   post:
 *     summary: Submit feedback
 *     description: Creates or upserts the authenticated user's feedback for an
 *       assistant message. A thumbs-down rating also creates a knowledge gap
 *       candidate and may trigger an asynchronous LLM-as-a-Judge evaluation of
 *       the message.
 *     tags: [Feedback]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [messageId, conversationId, rating]
 *             properties:
 *               messageId:
 *                 type: string
 *               conversationId:
 *                 type: string
 *               rating:
 *                 type: string
 *                 enum: [thumbs_up, thumbs_down]
 *               category:
 *                 type: string
 *                 enum: [inaccurate, incomplete, irrelevant, harmful, other]
 *               comment:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       '201':
 *         description: Feedback saved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 feedback:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     rating:
 *                       type: string
 *                       enum: [thumbs_up, thumbs_down]
 *                     category:
 *                       type: string
 *                       nullable: true
 *                     comment:
 *                       type: string
 *                       nullable: true
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       '400':
 *         description: Validation error
 *       '401':
 *         description: Authentication required
 *       '403':
 *         description: Insufficient permissions
 */
router.post("/", requirePermission(Permission.FEEDBACK_CREATE, { resourceContext: selfResourceContext }), validateSubmitFeedback, submitFeedbackController);
/**
 * @openapi
 * /feedback/mine/messages/{messageId}:
 *   get:
 *     summary: Get my feedback for a message
 *     description: Returns the authenticated user's feedback record for a single
 *       assistant message, or null if none exists.
 *     tags: [Feedback]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Feedback for the message or null
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 feedback:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     id:
 *                       type: string
 *                     rating:
 *                       type: string
 *                     category:
 *                       type: string
 *                     comment:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       '401':
 *         description: Authentication required
 *       '403':
 *         description: Insufficient permissions
 */
router.get("/mine/messages/:messageId", requirePermission(Permission.FEEDBACK_READ, { resourceContext: selfResourceContext }), getMyFeedbackForMessageController);
/**
 * @openapi
 * /feedback:
 *   get:
 *     summary: List feedback
 *     description: Returns a paginated list of feedback records for the tenant,
 *       optionally filtered by rating, category, message, conversation or user.
 *     tags: [Feedback]
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
 *       - in: query
 *         name: rating
 *         schema:
 *           type: string
 *           enum: [thumbs_up, thumbs_down]
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [inaccurate, incomplete, irrelevant, harmful, other]
 *       - in: query
 *         name: messageId
 *         schema:
 *           type: string
 *       - in: query
 *         name: conversationId
 *         schema:
 *           type: string
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Paginated feedback list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 feedback:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       messageId:
 *                         type: string
 *                       conversationId:
 *                         type: string
 *                       userId:
 *                         type: string
 *                       rating:
 *                         type: string
 *                       category:
 *                         type: string
 *                         nullable: true
 *                       comment:
 *                         type: string
 *                         nullable: true
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                 total:
 *                   type: integer
 *       '400':
 *         description: Validation error
 *       '401':
 *         description: Authentication required
 *       '403':
 *         description: Insufficient permissions
 */

router.get("/", requirePermission(Permission.FEEDBACK_READ), validateListFeedbackQuery, listFeedbackController);
/**
 * @openapi
 * /feedback/stats:
 *   get:
 *     summary: Get feedback stats
 *     description: Returns aggregate feedback statistics for the tenant, including
 *       total feedback, thumbs up and thumbs down counts, satisfaction rate, and
 *       counts broken down by category.
 *     tags: [Feedback]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Feedback statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 stats:
 *                   type: object
 *                   properties:
 *                     totalCount:
 *                       type: integer
 *                     thumbsUpCount:
 *                       type: integer
 *                     thumbsDownCount:
 *                       type: integer
 *                     satisfactionRate:
 *                       type: number
 *                     byCategory:
 *                       type: object
 *       '401':
 *         description: Authentication required
 *       '403':
 *         description: Insufficient permissions
 */
router.get("/stats", requirePermission(Permission.FEEDBACK_READ), getFeedbackStatsController);

export default router;
