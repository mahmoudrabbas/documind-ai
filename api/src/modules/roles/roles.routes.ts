import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import {
  createRoleController,
  listRolesController,
  getRoleController,
  updateRoleController,
  deleteRoleController,
  cloneRoleController,
  archiveRoleController,
} from "./roles.controller.js";

const router = Router();

router.get(
  "/",
  authenticate,
  tenantScoping,
  requirePermission("roles:read"),
  listRolesController,
);

router.post(
  "/",
  authenticate,
  tenantScoping,
  requirePermission("roles:create"),
  createRoleController,
);

router.get(
  "/:id",
  authenticate,
  tenantScoping,
  requirePermission("roles:read"),
  getRoleController,
);

router.patch(
  "/:id",
  authenticate,
  tenantScoping,
  requirePermission("roles:update"),
  updateRoleController,
);

router.delete(
  "/:id",
  authenticate,
  tenantScoping,
  requirePermission("roles:delete"),
  deleteRoleController,
);

router.post(
  "/:id/clone",
  authenticate,
  tenantScoping,
  requirePermission("roles:create"),
  cloneRoleController,
);

router.post(
  "/:id/archive",
  authenticate,
  tenantScoping,
  requirePermission("roles:delete"),
  archiveRoleController,
);

export default router;
