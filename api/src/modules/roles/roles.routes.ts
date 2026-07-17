import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  createRoleController,
  archiveRoleController,
  assignRoleController,
  cloneRoleController,
  deleteRoleController,
  getRoleController,
  getRoleUsageController,
  listRolesController,
  migrateRoleUsersController,
  reactivateRoleController,
  removeRoleAssignmentController,
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

router.get("/:id/usage", authenticate, tenantScoping, requirePermission(Permission.ROLES_READ), getRoleUsageController);
router.get("/:id", authenticate, tenantScoping, requirePermission(Permission.ROLES_READ), getRoleController);
router.post("/:id/clone", authenticate, tenantScoping, requirePermission(Permission.ROLES_CREATE), cloneRoleController);
router.post("/:id/archive", authenticate, tenantScoping, requirePermission(Permission.ROLES_UPDATE), archiveRoleController);
router.post("/:id/reactivate", authenticate, tenantScoping, requirePermission(Permission.ROLES_UPDATE), reactivateRoleController);
router.post("/:id/assignments", authenticate, tenantScoping, requirePermission(Permission.USERS_ASSIGN_ROLE), assignRoleController);
router.delete("/:id/assignments", authenticate, tenantScoping, requirePermission(Permission.USERS_ASSIGN_ROLE), removeRoleAssignmentController);
router.post("/:id/user-migrations", authenticate, tenantScoping, requirePermission(Permission.USERS_ASSIGN_ROLE), migrateRoleUsersController);

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
