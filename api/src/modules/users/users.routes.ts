import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
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
import {
  validateInviteUserInput,
  validateListUsersInput,
  validateUpdateUserInput,
} from "./users.validator.js";

const router = Router();
const invitationRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many invitation attempts. Please try again later.",
});
const requireUserUpdate = requirePermission(Permission.USERS_UPDATE);
const requireRoleAssignment = requirePermission(Permission.USERS_ASSIGN_ROLE);
const validateInvite: import("express").RequestHandler = (req, _res, next) => {
  try {
    validateInviteUserInput(req.body);
    next();
  } catch (error) {
    next(error);
  }
};
const validateList: import("express").RequestHandler = (req, _res, next) => {
  try {
    validateListUsersInput(req.query);
    next();
  } catch (error) {
    next(error);
  }
};
const validateUpdate: import("express").RequestHandler = (req, _res, next) => {
  try {
    validateUpdateUserInput(req.body);
    next();
  } catch (error) {
    next(error);
  }
};

const requireRoleAssignmentForBaseRoleChange: import("express").RequestHandler =
  (req, res, next) => {
    if (
      req.body &&
      typeof req.body === "object" &&
      Object.prototype.hasOwnProperty.call(req.body, "role")
    ) {
      void requireRoleAssignment(req, res, next);
      return;
    }
    next();
  };
const requireRoleAssignmentForAdminInvite: import("express").RequestHandler =
  (req, res, next) => {
    if (
      req.body &&
      typeof req.body === "object" &&
      "role" in req.body &&
      req.body.role === "COMPANY_ADMIN"
    ) {
      void requireRoleAssignment(req, res, next);
      return;
    }
    next();
  };

router.get(
  "/",
  authenticate,
  tenantScoping,
  requirePermission(Permission.USERS_READ),
  validateList,
  listUsersController,
);

router.patch(
  "/:id",
  authenticate,
  tenantScoping,
  requireUserUpdate,
  requireRoleAssignmentForBaseRoleChange,
  validateUpdate,
  updateUserController,
);

router.post(
  "/",
  authenticate,
  tenantScoping,
  requirePermission(Permission.USERS_CREATE),
  requireRoleAssignmentForAdminInvite,
  validateInvite,
  inviteUserController,
);

router.post(
  "/:id/resend-invitation",
  authenticate,
  tenantScoping,
  requirePermission(Permission.USERS_CREATE),
  invitationRateLimiter,
  resendInvitationController,
);

router.delete(
  "/:id",
  authenticate,
  tenantScoping,
  requirePermission(Permission.USERS_DELETE),
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
