import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { requirePlatformTenant } from "../../common/middlewares/platformTenant.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  getTenantController,
  getTenantDetailController,
  listTenantsController,
  updateTenantController,
  suspendTenantController,
  reinstateTenantController,
  previewSuspendController,
  previewReinstateController,
} from "./admin.controller.js";

const router = Router();

/**
 * @openapi
 * /platform/tenants:
 *   get:
 *     summary: List tenants
 *     description: Returns a paginated list of non-system tenants with usage
 *       statistics. Supports filtering by status, plan and a search term
 *       against tenant name or slug.
 *     tags: [Platform]
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
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, trial, pending, pending_verification, suspended]
 *         description: Filter by tenant status
 *       - in: query
 *         name: plan
 *         schema:
 *           type: string
 *           enum: [free, trial, pro]
 *         description: Filter by tenant plan
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by tenant name or slug
 *     responses:
 *       200:
 *         description: Paginated list of tenants
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
 *                     tenants:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           slug:
 *                             type: string
 *                           status:
 *                             type: string
 *                             enum: [active, trial, pending, pending_verification, suspended]
 *                           plan:
 *                             type: string
 *                             enum: [free, trial, pro]
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                           stats:
 *                             type: object
 *                             properties:
 *                               users:
 *                                 type: integer
 *                               documents:
 *                                 type: integer
 *                               questions:
 *                                 type: integer
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         pageSize:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *                         totalRecords:
 *                           type: integer
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Internal error
 */
router.get(
  "/tenants",
  authenticate,
  requirePlatformTenant,
  requirePermission(Permission.COMPANY_SETTINGS_READ),
  listTenantsController,
);

/**
 * @openapi
 * /platform/tenants/{id}:
 *   get:
 *     summary: Get tenant
 *     description: Returns a single tenant with aggregated user, document and
 *       question statistics. Protected system tenants are excluded.
 *     tags: [Platform]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant id (ObjectId)
 *     responses:
 *       200:
 *         description: Tenant details
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
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     slug:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [active, trial, pending, pending_verification, suspended]
 *                     plan:
 *                       type: string
 *                       enum: [free, trial, pro]
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                     stats:
 *                       type: object
 *                       properties:
 *                         users:
 *                           type: integer
 *                         documents:
 *                           type: integer
 *                         questions:
 *                           type: integer
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Tenant not found
 *       500:
 *         description: Internal error
 */
router.get(
  "/tenants/:id",
  authenticate,
  requirePlatformTenant,
  requirePermission(Permission.COMPANY_SETTINGS_READ),
  getTenantController,
);

/**
 * @openapi
 * /platform/tenants/{id}/detail:
 *   get:
 *     summary: Get tenant detail
 *     description: Returns a detailed view of a tenant including user summary,
 *       package and subscription information, usage totals and recent audit
 *       activity. Protected system tenants cannot be viewed.
 *     tags: [Platform]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant id (ObjectId)
 *     responses:
 *       200:
 *         description: Detailed tenant view
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
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     slug:
 *                       type: string
 *                     status:
 *                       type: string
 *                     plan:
 *                       type: string
 *                     isSystemTenant:
 *                       type: boolean
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                     users:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         active:
 *                           type: integer
 *                         companyAdmins:
 *                           type: integer
 *                         employees:
 *                           type: integer
 *                     package:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         packageId:
 *                           type: string
 *                         packageName:
 *                           type: string
 *                         packageCode:
 *                           type: string
 *                         packageVersion:
 *                           type: integer
 *                         entitlements:
 *                           type: object
 *                           nullable: true
 *                     subscription:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         subscriptionId:
 *                           type: string
 *                         status:
 *                           type: string
 *                         provider:
 *                           type: string
 *                         periodStart:
 *                           type: string
 *                           nullable: true
 *                         periodEnd:
 *                           type: string
 *                           nullable: true
 *                         trialEnd:
 *                           type: string
 *                           nullable: true
 *                         cancelAtPeriodEnd:
 *                           type: boolean
 *                     usage:
 *                       type: object
 *                       properties:
 *                         documents:
 *                           type: integer
 *                         storageBytes:
 *                           type: integer
 *                         questions:
 *                           type: integer
 *                     recentAudit:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           action:
 *                             type: string
 *                           actorEmail:
 *                             type: string
 *                           actorRole:
 *                             type: string
 *                           outcome:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions or protected tenant
 *       404:
 *         description: Tenant not found
 *       500:
 *         description: Internal error
 */
router.get(
  "/tenants/:id/detail",
  authenticate,
  requirePlatformTenant,
  requirePermission(Permission.COMPANY_SETTINGS_READ),
  getTenantDetailController,
);

/**
 * @openapi
 * /platform/tenants/{id}/preview/suspend:
 *   get:
 *     summary: Preview tenant suspension
 *     description: Previews suspending a tenant without applying changes,
 *       reporting the users affected, current subscription status and any
 *       blocking reasons for the transition.
 *     tags: [Platform]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant id (ObjectId)
 *     responses:
 *       200:
 *         description: Suspension preview
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
 *                     tenantName:
 *                       type: string
 *                     currentStatus:
 *                       type: string
 *                     targetStatus:
 *                       type: string
 *                       example: suspended
 *                     transitionAllowed:
 *                       type: boolean
 *                     alreadyInTargetState:
 *                       type: boolean
 *                     totalUsersAffected:
 *                       type: integer
 *                     activeUsersAffected:
 *                       type: integer
 *                     activeCompanyAdminsAffected:
 *                       type: integer
 *                     currentSubscriptionStatus:
 *                       type: string
 *                       nullable: true
 *                     documentCount:
 *                       type: integer
 *                     warnings:
 *                       type: array
 *                       items:
 *                         type: string
 *                     blockingReasons:
 *                       type: array
 *                       items:
 *                         type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions or protected tenant
 *       404:
 *         description: Tenant not found
 *       500:
 *         description: Internal error
 */
router.get(
  "/tenants/:id/preview/suspend",
  authenticate,
  requirePlatformTenant,
  requirePermission(Permission.COMPANY_SETTINGS_READ),
  previewSuspendController,
);

/**
 * @openapi
 * /platform/tenants/{id}/preview/reinstate:
 *   get:
 *     summary: Preview tenant reinstatement
 *     description: Previews reinstating a suspended tenant without applying
 *       changes, reporting the users affected and any blocking reasons for the
 *       transition.
 *     tags: [Platform]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant id (ObjectId)
 *     responses:
 *       200:
 *         description: Reinstatement preview
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
 *                     tenantName:
 *                       type: string
 *                     currentStatus:
 *                       type: string
 *                     targetStatus:
 *                       type: string
 *                       example: active
 *                     transitionAllowed:
 *                       type: boolean
 *                     alreadyInTargetState:
 *                       type: boolean
 *                     totalUsersAffected:
 *                       type: integer
 *                     activeUsersAffected:
 *                       type: integer
 *                     activeCompanyAdminsAffected:
 *                       type: integer
 *                     currentSubscriptionStatus:
 *                       type: string
 *                       nullable: true
 *                     documentCount:
 *                       type: integer
 *                     warnings:
 *                       type: array
 *                       items:
 *                         type: string
 *                     blockingReasons:
 *                       type: array
 *                       items:
 *                         type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions or protected tenant
 *       404:
 *         description: Tenant not found
 *       500:
 *         description: Internal error
 */
router.get(
  "/tenants/:id/preview/reinstate",
  authenticate,
  requirePlatformTenant,
  requirePermission(Permission.COMPANY_SETTINGS_READ),
  previewReinstateController,
);

/**
 * @openapi
 * /platform/tenants/{id}:
 *   patch:
 *     summary: Update tenant
 *     description: Updates the status or plan of a tenant. At least one of
 *       `status` or `plan` must be provided. The change is recorded in the
 *       audit log.
 *     tags: [Platform]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant id (ObjectId)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, trial, suspended]
 *               plan:
 *                 type: string
 *                 enum: [free, trial, pro]
 *     responses:
 *       200:
 *         description: Tenant updated
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
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     slug:
 *                       type: string
 *                     status:
 *                       type: string
 *                     plan:
 *                       type: string
 *                     stats:
 *                       type: object
 *                       properties:
 *                         users:
 *                           type: integer
 *                         documents:
 *                           type: integer
 *                         questions:
 *                           type: integer
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Tenant not found
 *       500:
 *         description: Internal error
 */
router.patch(
  "/tenants/:id",
  authenticate,
  requirePlatformTenant,
  requirePermission(Permission.COMPANY_SETTINGS_UPDATE),
  requirePermission(Permission.BILLING_MANAGE),
  updateTenantController,
);

/**
 * @openapi
 * /platform/tenants/{id}/suspend:
 *   post:
 *     summary: Suspend tenant
 *     description: Suspends a tenant, blocking user access and registrations.
 *       A reason between 3 and 500 characters is required and the transition is
 *       recorded in the audit log.
 *     tags: [Platform]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant id (ObjectId)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *                 example: Policy violation
 *     responses:
 *       200:
 *         description: Tenant suspended
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
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     slug:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: suspended
 *                     plan:
 *                       type: string
 *                     alreadyInTargetState:
 *                       type: boolean
 *       400:
 *         description: Validation error or missing reason
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions or protected tenant
 *       404:
 *         description: Tenant not found
 *       409:
 *         description: Invalid status transition
 *       500:
 *         description: Internal error
 */
router.post(
  "/tenants/:id/suspend",
  authenticate,
  requirePlatformTenant,
  requirePermission(Permission.COMPANY_SETTINGS_UPDATE),
  suspendTenantController,
);

/**
 * @openapi
 * /platform/tenants/{id}/reinstate:
 *   post:
 *     summary: Reinstate tenant
 *     description: Reinstate a suspended tenant, restoring user access. A
 *       reason between 3 and 500 characters is required and the transition is
 *       recorded in the audit log.
 *     tags: [Platform]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant id (ObjectId)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *                 example: Issue resolved
 *     responses:
 *       200:
 *         description: Tenant reinstated
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
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     slug:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: active
 *                     plan:
 *                       type: string
 *                     alreadyInTargetState:
 *                       type: boolean
 *       400:
 *         description: Validation error or missing reason
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions or protected tenant
 *       404:
 *         description: Tenant not found
 *       409:
 *         description: Invalid status transition
 *       500:
 *         description: Internal error
 */
router.post(
  "/tenants/:id/reinstate",
  authenticate,
  requirePlatformTenant,
  requirePermission(Permission.COMPANY_SETTINGS_UPDATE),
  reinstateTenantController,
);

export default router;
