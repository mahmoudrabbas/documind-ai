import { Router } from "express";
import {
  archiveNotification,
  bulkReadNotifications,
  clearAllNotifications,
  deleteNotification,
  getNotification,
  listNotifications,
  markAllRead,
  markAllSeen,
  markNotificationRead,
  markNotificationSeen,
  sendTestNotification,
  unreadCount,
} from "./notifications.controller.js";
import { createTestNotificationRateLimiter } from "./rateLimit.js";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";

const router = Router();

// Requires a valid user/tenant on every notification endpoint.
router.use(authenticate, tenantScoping);

// Static routes MUST be declared before the "/:id" parameterized route so
// Express does not treat "unread-count" / "bulk-read" / "test" as an id.
/**
 * @openapi
 * /notifications:
 *   get:
 *     summary: List notifications
 *     description: Returns a paginated list of the current user's
 *       notifications within the tenant, newest first. Supports filtering by
 *       category and optionally including archived notifications. Expired and
 *       deleted notifications are never returned.
 *     tags: [Notifications]
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
 *           default: 20
 *         description: Number of results per page (max 100)
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [system, billing, security, documents, knowledge, workflow, admin]
 *         description: Filter by notification category
 *       - in: query
 *         name: includeArchived
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include archived notifications
 *     responses:
 *       200:
 *         description: Paginated list of notifications
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
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           type:
 *                             type: string
 *                           category:
 *                             type: string
 *                           priority:
 *                             type: string
 *                           title:
 *                             type: object
 *                           body:
 *                             type: object
 *                           isRead:
 *                             type: boolean
 *                           isSeen:
 *                             type: boolean
 *                           isArchived:
 *                             type: boolean
 *                           lifecycleState:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                     total:
 *                       type: integer
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get("/", requirePermission(Permission.NOTIFICATIONS_READ), listNotifications);

/**
 * @openapi
 * /notifications/unread-count:
 *   get:
 *     summary: Unread notification count
 *     description: Returns the current user's total unread notification count
 *       broken down by priority level. Only live, non-deleted notifications
 *       that have not expired are counted.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread count by priority
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
 *                     count:
 *                       type: integer
 *                     byPriority:
 *                       type: object
 *                       properties:
 *                         critical:
 *                           type: integer
 *                         high:
 *                           type: integer
 *                         normal:
 *                           type: integer
 *                         low:
 *                           type: integer
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get("/unread-count", requirePermission(Permission.NOTIFICATIONS_READ), unreadCount);

/**
 * @openapi
 * /notifications/bulk-read:
 *   post:
 *     summary: Bulk mark notifications as read
 *     description: Marks up to 50 notifications as read for the current user.
 *       Only unread notifications owned by the caller are updated, and the
 *       unread counter is adjusted accordingly.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids]
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Notification ids (1 to 50)
 *     responses:
 *       200:
 *         description: Number of notifications marked as read
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
 *                     matchedCount:
 *                       type: integer
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.post("/bulk-read", requirePermission(Permission.NOTIFICATIONS_UPDATE), bulkReadNotifications);

/**
 * @openapi
 * /notifications/read-all:
 *   post:
 *     summary: Mark all notifications as read
 *     description: Marks every unread notification for the current user as
 *       read within a single transaction and adjusts the unread counter
 *       accordingly.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Number of notifications marked as read
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
 *                     matchedCount:
 *                       type: integer
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.post("/read-all", requirePermission(Permission.NOTIFICATIONS_UPDATE), markAllRead);

/**
 * @openapi
 * /notifications/seen-all:
 *   post:
 *     summary: Mark all notifications as seen
 *     description: Marks every unseen notification for the current user as
 *       seen. Seen indicates the user has viewed the notification without
 *       necessarily reading it.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Number of notifications marked as seen
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
 *                     matchedCount:
 *                       type: integer
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.post("/seen-all", requirePermission(Permission.NOTIFICATIONS_UPDATE), markAllSeen);

/**
 * @openapi
 * /notifications:
 *   delete:
 *     summary: Clear all notifications
 *     description: Soft-deletes every live notification for the current user and
 *       resets their unread count to zero.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notifications cleared
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
 *                     matchedCount:
 *                       type: integer
 *                       example: 3
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.delete("/", requirePermission(Permission.NOTIFICATIONS_UPDATE), clearAllNotifications);

/**
 * @openapi
 * /notifications/test:
 *   post:
 *     summary: Send test notification
 *     description: Creates a single test welcome notification addressed to the
 *       current user for debugging notification delivery. Rate limited to ten
 *       requests per tenant per minute and only available when test
 *       notifications are enabled.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Test notification created
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
 *                     notificationId:
 *                       type: string
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Test notifications are disabled
 *       429:
 *         description: Too many test notification requests
 */
router.post(
  "/test",
  createTestNotificationRateLimiter(),
  requirePermission(Permission.NOTIFICATIONS_TEST),
  sendTestNotification,
);

// Parameterized routes.
/**
 * @openapi
 * /notifications/{id}:
 *   get:
 *     summary: Get notification
 *     description: Returns a single notification by id for the current user
 *       within the tenant. Expired or deleted notifications are not returned.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification id
 *     responses:
 *       200:
 *         description: Notification details
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
 *                     id:
 *                       type: string
 *                     type:
 *                       type: string
 *                     category:
 *                       type: string
 *                     priority:
 *                       type: string
 *                     title:
 *                       type: object
 *                     body:
 *                       type: object
 *                     isRead:
 *                       type: boolean
 *                     isSeen:
 *                       type: boolean
 *                     isArchived:
 *                       type: boolean
 *                     lifecycleState:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Notification not found
 */
router.get("/:id", requirePermission(Permission.NOTIFICATIONS_READ), getNotification);

/**
 * @openapi
 * /notifications/{id}/read:
 *   post:
 *     summary: Mark notification as read
 *     description: Marks a single notification as read for the current user
 *       and decrements the unread counter when the notification was unread.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification id
 *     responses:
 *       200:
 *         description: Notification marked as read
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
 *                     notificationId:
 *                       type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.post("/:id/read", requirePermission(Permission.NOTIFICATIONS_UPDATE), markNotificationRead);

/**
 * @openapi
 * /notifications/{id}/seen:
 *   post:
 *     summary: Mark notification as seen
 *     description: Marks a single notification as seen for the current user
 *       without changing its read state.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification id
 *     responses:
 *       200:
 *         description: Notification marked as seen
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
 *                     notificationId:
 *                       type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.post("/:id/seen", requirePermission(Permission.NOTIFICATIONS_UPDATE), markNotificationSeen);

/**
 * @openapi
 * /notifications/{id}/archive:
 *   post:
 *     summary: Archive notification
 *     description: Archives a single notification for the current user so it
 *       no longer appears in the default feed. Archiving an unread
 *       notification also decrements the unread counter.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification id
 *     responses:
 *       200:
 *         description: Notification archived
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
 *                     notificationId:
 *                       type: string
 *                     archived:
 *                       type: boolean
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.post("/:id/archive", requirePermission(Permission.NOTIFICATIONS_UPDATE), archiveNotification);

/**
 * @openapi
 * /notifications/{id}:
 *   delete:
 *     summary: Delete notification
 *     description: Soft deletes a single notification for the current user so
 *       it is excluded from the feed and status queries. Deleting an unread
 *       notification also decrements the unread counter.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification id
 *     responses:
 *       200:
 *         description: Notification deleted
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
 *                     notificationId:
 *                       type: string
 *                     deleted:
 *                       type: boolean
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.delete("/:id", requirePermission(Permission.NOTIFICATIONS_UPDATE), deleteNotification);

export default router;
