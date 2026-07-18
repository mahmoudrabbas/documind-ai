import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { authorize } from "../../common/middlewares/authorize.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { createRateLimiter } from "../../common/middlewares/rateLimit.middleware.js";
import {
  inviteUserController,
  listUsersController,
  updateUserController,
  deleteUserController,
  setPasswordFromInviteController,
  getInviteDetailsController,
  resendInvitationController,
} from "./users.controller.js";

const router = Router();
const invitationRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many invitation attempts. Please try again later.",
});

router.get(
  "/",
  authenticate,
  tenantScoping,
  requirePermission(Permission.USERS_READ),
  listUsersController,
);

router.patch(
  "/:id",
  authenticate,
  tenantScoping,
  authorize("COMPANY_ADMIN"),
  updateUserController,
);

router.post(
  "/",
  authenticate,
  tenantScoping,
  authorize("COMPANY_ADMIN"),
  inviteUserController,
);

router.post(
  "/:id/resend-invitation",
  authenticate,
  tenantScoping,
  authorize("COMPANY_ADMIN"),
  invitationRateLimiter,
  resendInvitationController,
);

router.delete(
  "/:id",
  authenticate,
  tenantScoping,
  authorize("COMPANY_ADMIN"),
  deleteUserController,
);

router.post(
  "/set-password-from-invite",
  invitationRateLimiter,
  setPasswordFromInviteController,
);
router.post(
  "/validate-invite",
  invitationRateLimiter,
  getInviteDetailsController,
);

export default router;
