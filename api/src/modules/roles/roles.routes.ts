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
import {
  validateAssignRoleInput,
  validateMigrateRoleUsersInput,
  validateRemoveRoleAssignmentInput,
} from "./roles.validator.js";

const router = Router();
const validateRoleBody = (
  validator: (input: unknown) => unknown,
): import("express").RequestHandler =>
  (req, _res, next) => {
    try {
      validator(req.body);
      next();
    } catch (error) {
      next(error);
    }
  };

/**
 * @openapi
 * /roles:
 *   get:
 *     summary: List roles
 *     description: Returns all custom roles for the tenant with their grants,
 *       status and assigned user counts.
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of roles
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
 *                     roles:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           baseRole:
 *                             type: string
 *                             enum: [COMPANY_ADMIN, EMPLOYEE]
 *                           status:
 *                             type: string
 *                             enum: [active, archived]
 *                           version:
 *                             type: integer
 *                           userCount:
 *                             type: integer
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  "/",
  authenticate,
  tenantScoping,
  requirePermission(Permission.ROLES_READ),
  listRolesController,
);

/**
 * @openapi
 * /roles:
 *   post:
 *     summary: Create role
 *     description: Creates a custom role from a base role and a set of
 *       permission grants. Grants reference permission identifiers and optional
 *       scopes; unknown or non-delegable permissions are rejected.
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, baseRole, grants]
 *             properties:
 *               name:
 *                 type: string
 *                 description: Unique role name
 *                 example: Support Agent
 *               baseRole:
 *                 type: string
 *                 enum: [COMPANY_ADMIN, EMPLOYEE]
 *                 example: EMPLOYEE
 *               grants:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     permission:
 *                       type: string
 *                       description: Permission identifier from the catalog
 *                     scopes:
 *                       type: object
 *                       properties:
 *                         selfOnly:
 *                           type: boolean
 *                         departmentIds:
 *                           type: array
 *                           items:
 *                             type: string
 *                         documentCategories:
 *                           type: array
 *                           items:
 *                             type: string
 *                         documentClassifications:
 *                           type: array
 *                           items:
 *                             type: string
 *     responses:
 *       201:
 *         description: Role created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Role created successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: object
 *       400:
 *         description: Validation error or unknown permission
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions or privilege escalation
 */
router.post(
  "/",
  authenticate,
  tenantScoping,
  requirePermission(Permission.ROLES_CREATE),
  createRoleController,
);

/**
 * @openapi
 * /roles/{id}/usage:
 *   get:
 *     summary: Get role usage
 *     description: Returns the number of users currently assigned to a role.
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Role id
 *     responses:
 *       200:
 *         description: Role usage
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
 *                     roleId:
 *                       type: string
 *                     assignedUserCount:
 *                       type: integer
 *       400:
 *         description: Malformed role id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Role not found
 */
router.get("/:id/usage", authenticate, tenantScoping, requirePermission(Permission.ROLES_READ), getRoleUsageController);
/**
 * @openapi
 * /roles/{id}:
 *   get:
 *     summary: Get role
 *     description: Returns a single role by id, including its grants, status,
 *       version and assigned user count.
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Role id
 *     responses:
 *       200:
 *         description: Role details
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
 *                     role:
 *                       type: object
 *       400:
 *         description: Malformed role id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Role not found
 */
router.get("/:id", authenticate, tenantScoping, requirePermission(Permission.ROLES_READ), getRoleController);
/**
 * @openapi
 * /roles/{id}/clone:
 *   post:
 *     summary: Clone role
 *     description: Creates a new role as a copy of an existing role under a new
 *       name, using the source role's current version as the base.
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Source role id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, version]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Support Agent Copy
 *               version:
 *                 type: integer
 *                 description: Expected version of the source role
 *     responses:
 *       201:
 *         description: Role cloned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Role cloned successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: object
 *       400:
 *         description: Validation error or malformed role id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Role not found
 */
router.post("/:id/clone", authenticate, tenantScoping, requirePermission(Permission.ROLES_CREATE), cloneRoleController);
/**
 * @openapi
 * /roles/{id}/archive:
 *   post:
 *     summary: Archive role
 *     description: Archives a role, requiring the caller to supply the role's
 *       current version to prevent overwriting concurrent changes. Archived
 *       roles can no longer be assigned to users.
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Role id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [version]
 *             properties:
 *               version:
 *                 type: integer
 *                 description: Expected current version of the role
 *     responses:
 *       200:
 *         description: Role archived successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Role archived successfully
 *                 data:
 *                   type: object
 *       400:
 *         description: Validation error or malformed role id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Role not found
 *       409:
 *         description: Version conflict
 */
router.post("/:id/archive", authenticate, tenantScoping, requirePermission(Permission.ROLES_UPDATE), archiveRoleController);
/**
 * @openapi
 * /roles/{id}/reactivate:
 *   post:
 *     summary: Reactivate role
 *     description: Sets an archived role back to active so it can be assigned to
 *       users again. The caller must supply the role's current version.
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Role id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [version]
 *             properties:
 *               version:
 *                 type: integer
 *                 description: Expected current version of the role
 *     responses:
 *       200:
 *         description: Role reactivated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Role reactivated successfully
 *                 data:
 *                   type: object
 *       400:
 *         description: Validation error or malformed role id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Role not found
 *       409:
 *         description: Version conflict
 */
router.post("/:id/reactivate", authenticate, tenantScoping, requirePermission(Permission.ROLES_UPDATE), reactivateRoleController);
/**
 * @openapi
 * /roles/{id}/assignments:
 *   post:
 *     summary: Assign role
 *     description: Assigns a user to a role. Requires both the user-update and
 *       role-assignment permissions. The role version guards against assigning
 *       a stale role definition.
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Role id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, roleVersion]
 *             properties:
 *               userId:
 *                 type: string
 *                 description: User to assign the role to
 *               roleVersion:
 *                 type: integer
 *                 description: Expected version of the role being assigned
 *     responses:
 *       200:
 *         description: Role assigned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Role assigned successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: string
 *                     roleId:
 *                       type: string
 *                     changed:
 *                       type: boolean
 *       400:
 *         description: Validation error or malformed id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Role or user not found
 *       409:
 *         description: Role version conflict
 */
router.post("/:id/assignments", authenticate, tenantScoping, requirePermission(Permission.USERS_UPDATE), requirePermission(Permission.USERS_ASSIGN_ROLE), validateRoleBody(validateAssignRoleInput), assignRoleController);
/**
 * @openapi
 * /roles/{id}/assignments:
 *   delete:
 *     summary: Remove role assignment
 *     description: Removes a role assignment from a user, returning the user to
 *       their base role. Requires the user-update and role-assignment
 *       permissions.
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Role id to remove
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, roleVersion]
 *             properties:
 *               userId:
 *                 type: string
 *                 description: User to remove the role from
 *               roleVersion:
 *                 type: integer
 *                 description: Expected version of the role being removed
 *     responses:
 *       200:
 *         description: Role assignment removed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Role assignment removed successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: string
 *                     roleId:
 *                       type: string
 *                     changed:
 *                       type: boolean
 *       400:
 *         description: Validation error or malformed id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Role or user not found
 *       409:
 *         description: Role version conflict
 */
router.delete("/:id/assignments", authenticate, tenantScoping, requirePermission(Permission.USERS_UPDATE), requirePermission(Permission.USERS_ASSIGN_ROLE), validateRoleBody(validateRemoveRoleAssignmentInput), removeRoleAssignmentController);
/**
 * @openapi
 * /roles/{id}/user-migrations:
 *   post:
 *     summary: Migrate role users
 *     description: Migrates users assigned to the source role over to a
 *       destination role, using version checks on both roles to detect stale
 *       state. Users with conflicting assignments are reported as conflicted.
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Source role id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [destinationRoleId, sourceVersion, destinationVersion]
 *             properties:
 *               destinationRoleId:
 *                 type: string
 *                 description: Role to migrate users into
 *               sourceVersion:
 *                 type: integer
 *                 description: Expected version of the source role
 *               destinationVersion:
 *                 type: integer
 *                 description: Expected version of the destination role
 *     responses:
 *       200:
 *         description: Role users migrated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Role users migrated successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     sourceRoleId:
 *                       type: string
 *                     destinationRoleId:
 *                       type: string
 *                     affected:
 *                       type: integer
 *                     skipped:
 *                       type: integer
 *                     conflicted:
 *                       type: integer
 *       400:
 *         description: Validation error or malformed id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Role not found
 *       409:
 *         description: Version conflict
 */
router.post("/:id/user-migrations", authenticate, tenantScoping, requirePermission(Permission.USERS_UPDATE), requirePermission(Permission.USERS_ASSIGN_ROLE), validateRoleBody(validateMigrateRoleUsersInput), migrateRoleUsersController);

/**
 * @openapi
 * /roles/{id}:
 *   patch:
 *     summary: Update role
 *     description: Updates a role's name, base role, grants or status. The
 *       current version is mandatory to prevent overwriting concurrent changes.
 *       Unknown or non-delegable permissions in the grants are rejected.
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Role id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [version]
 *             properties:
 *               name:
 *                 type: string
 *               baseRole:
 *                 type: string
 *                 enum: [COMPANY_ADMIN, EMPLOYEE]
 *               grants:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     permission:
 *                       type: string
 *                     scopes:
 *                       type: object
 *               status:
 *                 type: string
 *                 enum: [active, archived]
 *               version:
 *                 type: integer
 *                 description: Expected current version of the role
 *     responses:
 *       200:
 *         description: Role updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Role updated successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: object
 *       400:
 *         description: Validation error or unknown permission
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions or privilege escalation
 *       404:
 *         description: Role not found
 *       409:
 *         description: Version conflict
 */
router.patch(
  "/:id",
  authenticate,
  tenantScoping,
  requirePermission(Permission.ROLES_UPDATE),
  updateRoleController,
);

/**
 * @openapi
 * /roles/{id}:
 *   delete:
 *     summary: Delete role
 *     description: Permanently deletes a role after verifying the supplied
 *       version matches the current role version. Users assigned to the role
 *       fall back to their base role.
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Role id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [version]
 *             properties:
 *               version:
 *                 type: integer
 *                 description: Expected current version of the role
 *     responses:
 *       200:
 *         description: Role deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Role deleted successfully
 *       400:
 *         description: Validation error or malformed role id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Role not found
 *       409:
 *         description: Version conflict
 */
router.delete(
  "/:id",
  authenticate,
  tenantScoping,
  requirePermission(Permission.ROLES_DELETE),
  deleteRoleController,
);

export default router;
