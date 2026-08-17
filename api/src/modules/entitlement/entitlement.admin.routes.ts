import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { authorize } from "../../common/middlewares/authorize.middleware.js";
import { requirePlatformTenant } from "../../common/middlewares/platformTenant.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  listOverridesController,
  removeOverrideController,
  setOverrideController,
  reconcileController,
  listReconciliationReportsController,
} from "./entitlement.admin.controller.js";

const router = Router();
router.use(authenticate, requirePlatformTenant);

/**
 * @openapi
 * /super-admin/entitlement/overrides:
 *   get:
 *     summary: List quota overrides
 *     description: Returns a paginated list of quota overrides, optionally
 *       filtered by tenant id. Super admins only.
 *     tags: [Entitlement]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Paginated list of quota overrides
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
 *                     overrides:
 *                       type: array
 *                       items:
 *                         type: object
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         pageSize:
 *                           type: integer
 *                         total:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *       '400':
 *         description: Validation error
 *       '401':
 *         description: Authentication required
 *       '403':
 *         description: Super admin or billing permission required
 */
router.get(
  "/overrides",
  requirePermission(Permission.BILLING_MANAGE),
  authorize("SUPER_ADMIN"),
  listOverridesController,
);

/**
 * @openapi
 * /super-admin/entitlement/overrides/{tenantId}:
 *   put:
 *     summary: Set or update a quota override
 *     description: Creates or updates a quota override for a tenant and counter
 *       dimension, replacing the plan-configured limit. An audit record is
 *       written for the change. Super admins only.
 *     tags: [Entitlement]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [dimension, limit]
 *             properties:
 *               dimension:
 *                 type: string
 *                 enum: [employees, admins, documents, storageMb, fileSizeMb, queriesPerMonth, tokensPerMonth, ocrPagesPerMonth]
 *               limit:
 *                 type: integer
 *                 minimum: 0
 *               reason:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       '200':
 *         description: Quota override set or updated
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
 *                     tenantId:
 *                       type: string
 *                     dimension:
 *                       type: string
 *                     limit:
 *                       type: integer
 *                     reason:
 *                       type: string
 *                     enabled:
 *                       type: boolean
 *       '400':
 *         description: Validation error
 *       '401':
 *         description: Authentication required
 *       '403':
 *         description: Super admin or billing permission required
 */
router.put(
  "/overrides/:tenantId",
  requirePermission(Permission.BILLING_MANAGE),
  authorize("SUPER_ADMIN"),
  setOverrideController,
);

/**
 * @openapi
 * /super-admin/entitlement/overrides/{tenantId}/{dimension}:
 *   delete:
 *     summary: Remove a quota override
 *     description: Removes a quota override for a tenant and counter dimension,
 *       restoring the plan-configured limit. An audit record is written for the
 *       change. Super admins only.
 *     tags: [Entitlement]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: dimension
 *         required: true
 *         schema:
 *           type: string
 *           enum: [employees, admins, documents, storageMb, fileSizeMb, queriesPerMonth, tokensPerMonth, ocrPagesPerMonth]
 *     responses:
 *       '200':
 *         description: Quota override removed
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
 *                     removed:
 *                       type: boolean
 *                       example: true
 *                     tenantId:
 *                       type: string
 *                     dimension:
 *                       type: string
 *       '400':
 *         description: Validation error
 *       '401':
 *         description: Authentication required
 *       '403':
 *         description: Super admin or billing permission required
 *       '404':
 *         description: Quota override not found
 */
router.delete(
  "/overrides/:tenantId/:dimension",
  requirePermission(Permission.BILLING_MANAGE),
  authorize("SUPER_ADMIN"),
  removeOverrideController,
);

/**
 * @openapi
 * /super-admin/entitlement/reconcile:
 *   post:
 *     summary: Run an entitlement reconciliation sweep
 *     description: Runs a reconciliation sweep for a single tenant or all
 *       tenants. In dry-run mode it only reports discrepancies, while execute
 *       mode also applies fixes. A reconciliation report is persisted and an
 *       audit record is written. Super admins only.
 *     tags: [Entitlement]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [dry-run, execute]
 *                 default: dry-run
 *               tenantId:
 *                 type: string
 *                 description: Target tenant. Omit to reconcile all tenants.
 *     responses:
 *       '200':
 *         description: Reconciliation report
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
 *                     totalDiscrepancies:
 *                       type: integer
 *                     totalFixed:
 *                       type: integer
 *       '400':
 *         description: Validation error
 *       '401':
 *         description: Authentication required
 *       '403':
 *         description: Super admin or billing permission required
 */
router.post(
  "/reconcile",
  requirePermission(Permission.BILLING_MANAGE),
  authorize("SUPER_ADMIN"),
  reconcileController,
);

/**
 * @openapi
 * /super-admin/entitlement/reconcile/reports:
 *   get:
 *     summary: List reconciliation reports
 *     description: Returns a paginated list of persisted entitlement
 *       reconciliation reports, optionally filtered by tenant id. Super admins
 *       only.
 *     tags: [Entitlement]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Paginated list of reconciliation reports
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
 *                     reports:
 *                       type: array
 *                       items:
 *                         type: object
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         pageSize:
 *                           type: integer
 *                         total:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *       '400':
 *         description: Validation error
 *       '401':
 *         description: Authentication required
 *       '403':
 *         description: Super admin or billing permission required
 */
router.get(
  "/reconcile/reports",
  requirePermission(Permission.BILLING_MANAGE),
  authorize("SUPER_ADMIN"),
  listReconciliationReportsController,
);

export default router;
