import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import {
  inviteUserController,
  listUsersController,
  updateUserController,
  deleteUserController,
  setPasswordFromInviteController,
  getInviteDetailsController,
} from "./users.controller.js";

const router = Router();

router.get(
  "/",
  authenticate,
  tenantScoping,
  requirePermission("users:read"),
  listUsersController,
);

router.patch(
  "/:id",
  authenticate,
  tenantScoping,
  requirePermission("users:update"),
  updateUserController,
);

router.post(
  "/",
  authenticate,
  tenantScoping,
  requirePermission("users:create"),
  inviteUserController,
);

router.delete(
  "/:id",
  authenticate,
  tenantScoping,
  requirePermission("users:delete"),
  deleteUserController,
);

router.post("/set-password-from-invite", setPasswordFromInviteController);
router.post("/validate-invite", getInviteDetailsController);

export default router;
