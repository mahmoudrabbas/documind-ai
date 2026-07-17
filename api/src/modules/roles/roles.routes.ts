import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  createRoleController,
  deleteRoleController,
  listRolesController,
  updateRoleController,
} from "./roles.controller.js";

const router = Router();

router.get(
  "/",
  authenticate,
  tenantScoping,
  requirePermission(Permission.ROLES_READ),
  listRolesController,
);

router.post(
  "/",
  authenticate,
  tenantScoping,
  requirePermission(Permission.ROLES_CREATE),
  createRoleController,
);

router.patch(
  "/:id",
  authenticate,
  tenantScoping,
  requirePermission(Permission.ROLES_UPDATE),
  updateRoleController,
);

router.delete(
  "/:id",
  authenticate,
  tenantScoping,
  requirePermission(Permission.ROLES_DELETE),
  deleteRoleController,
);

export default router;
