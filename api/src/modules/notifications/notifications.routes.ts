import { Router } from "express";
import {
  archiveNotification,
  bulkReadNotifications,
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
router.get("/", requirePermission(Permission.NOTIFICATIONS_READ), listNotifications);
router.get("/unread-count", requirePermission(Permission.NOTIFICATIONS_READ), unreadCount);
router.post("/bulk-read", requirePermission(Permission.NOTIFICATIONS_UPDATE), bulkReadNotifications);
router.post("/read-all", requirePermission(Permission.NOTIFICATIONS_UPDATE), markAllRead);
router.post("/seen-all", requirePermission(Permission.NOTIFICATIONS_UPDATE), markAllSeen);
router.post(
  "/test",
  createTestNotificationRateLimiter(),
  requirePermission(Permission.NOTIFICATIONS_TEST),
  sendTestNotification,
);

// Parameterized routes.
router.get("/:id", requirePermission(Permission.NOTIFICATIONS_READ), getNotification);
router.post("/:id/read", requirePermission(Permission.NOTIFICATIONS_UPDATE), markNotificationRead);
router.post("/:id/seen", requirePermission(Permission.NOTIFICATIONS_UPDATE), markNotificationSeen);
router.post("/:id/archive", requirePermission(Permission.NOTIFICATIONS_UPDATE), archiveNotification);
router.delete("/:id", requirePermission(Permission.NOTIFICATIONS_UPDATE), deleteNotification);

export default router;
