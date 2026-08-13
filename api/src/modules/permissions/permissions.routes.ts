import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import {
  getPermissionCatalogController,
  getMyPermissionsController,
} from "./permissions.controller.js";

const router = Router();

/**
 * @openapi
 * /permissions:
 *   get:
 *     summary: Get permission catalog
 *     description: Returns the full permission catalog grouped by category,
 *       including each permission's label, description, compatible scopes and
 *       which base roles include it by default.
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Permission catalog
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
 *                     contractVersion:
 *                       type: integer
 *                     groups:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           group:
 *                             type: string
 *                           label:
 *                             type: string
 *                           permissions:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: string
 *                                 label:
 *                                   type: string
 *                                 description:
 *                                   type: string
 *                                 compatibleScopes:
 *                                   type: array
 *                                   items:
 *                                     type: string
 *                                 active:
 *                                   type: boolean
 *                                 deprecated:
 *                                   type: boolean
 *                     baseRoleDefaults:
 *                       type: object
 *                       additionalProperties:
 *                         type: array
 *                         items:
 *                           type: string
 *       401:
 *         description: Authentication required
 */
router.get(
  "/",
  authenticate,
  tenantScoping,
  getPermissionCatalogController,
);

/**
 * @openapi
 * /permissions/me:
 *   get:
 *     summary: Get my permissions
 *     description: Returns the permissions currently granted to the
 *       authenticated user, resolved from their base role and any assigned
 *       custom role, together with the grant scopes and role version.
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Resolved permissions for the current user
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
 *                     permissions:
 *                       type: array
 *                       items:
 *                         type: string
 *                     grants:
 *                       type: object
 *                       additionalProperties:
 *                         type: object
 *                         properties:
 *                           source:
 *                             type: string
 *                           scope:
 *                             type: object
 *                     baseRole:
 *                       type: string
 *                     customRoleId:
 *                       type: string
 *                     customRoleState:
 *                       type: string
 *                       enum: [none, active, missing, archived, invalid]
 *                     roleVersion:
 *                       type: integer
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Invalid base role or insufficient permissions
 */
router.get(
  "/me",
  authenticate,
  tenantScoping,
  getMyPermissionsController,
);

export default router;
