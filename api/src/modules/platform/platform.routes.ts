import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { requirePlatformTenant } from "../../common/middlewares/platformTenant.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  activatePackageController,
  aiConfigurationController,
  archivePackageController,
  auditController,
  createPackageController,
  healthController,
  jobsController,
  overviewController,
  packageController,
  packageImpactController,
  packagesController,
  platformUsersController,
  settingsController,
  subscriptionsController,
  subscriptionDetailController,
  subscriptionImpactController,
  provisionSubscriptionController,
  updateAiConfigurationController,
  updatePackageController,
  updateSettingsController,
  updateSubscriptionController,
  usageController,
} from "./platform.controller.js";
import { createCapabilityGuard } from "../entitlement/middlewares/entitlement.middleware.js";
import { getEntitlementService } from "../entitlement/entitlement.service.js";

const router = Router();
router.use(authenticate, requirePlatformTenant);

// ── Entitlement guards ─────────────────────────────────────────────────────

const modelSelectionGuard = createCapabilityGuard(getEntitlementService(), {
  capability: "allowedModels",
  value: (req) => req.body?.model ?? req.body?.modelName ?? "",
  failMode: "fail-closed",
});

/**
 * @openapi
 * /platform/overview:
 *   get:
 *     summary: Platform overview
 *     description: Returns aggregate platform metrics including company, user,
 *       document, question, failed job, storage and cost totals, together with
 *       the most recent platform audit log entries. Requires super admin access.
 *     tags: [Platform]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Platform overview metrics
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
 *                     metrics:
 *                       type: object
 *                       properties:
 *                         companies:
 *                           type: integer
 *                         activeCompanies:
 *                           type: integer
 *                         users:
 *                           type: integer
 *                         documents:
 *                           type: integer
 *                         questions:
 *                           type: integer
 *                         failedJobs:
 *                           type: integer
 *                         storageBytes:
 *                           type: integer
 *                         estimatedCost:
 *                           type: number
 *                         costType:
 *                           type: string
 *                           enum: [calculated, estimated]
 *                         dataFreshness:
 *                           type: string
 *                           format: date-time
 *                     recentAudit:
 *                       type: array
 *                       items:
 *                         type: object
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get("/overview", requirePermission(Permission.AUDIT_READ), overviewController);

/**
 * @openapi
 * /platform/packages:
 *   get:
 *     summary: List packages
 *     description: Returns all billing packages in the platform, including
 *       inactive and internal ones. Used by super admins to manage the package
 *       catalog. Monetary values are returned as integer minor units.
 *     tags: [Platform]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of packages
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       code:
 *                         type: string
 *                       description:
 *                         type: string
 *                       active:
 *                         type: boolean
 *                       version:
 *                         type: integer
 *                       monthlyPrice:
 *                         type: integer
 *                       annualPrice:
 *                         type: integer
 *                       currency:
 *                         type: string
 *                       trialDays:
 *                         type: integer
 *                       visibility:
 *                         type: string
 *                         enum: [public, internal]
 *                       supportedModels:
 *                         type: array
 *                         items:
 *                           type: string
 *                       analyticsLevel:
 *                         type: string
 *                         enum: [basic, advanced, enterprise]
 *                       retentionDays:
 *                         type: integer
 *                       supportLevel:
 *                         type: string
 *                         enum: [community, standard, priority, dedicated]
 *                       entitlements:
 *                         type: object
 *                         properties:
 *                           employees:
 *                             type: integer
 *                           admins:
 *                             type: integer
 *                           documents:
 *                             type: integer
 *                           storageMb:
 *                             type: integer
 *                           fileSizeMb:
 *                             type: integer
 *                           queriesPerMonth:
 *                             type: integer
 *                           tokensPerMonth:
 *                             type: integer
 *                           ocrPagesPerMonth:
 *                             type: integer
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get("/packages", requirePermission(Permission.BILLING_READ), packagesController);

/**
 * @openapi
 * /platform/packages:
 *   post:
 *     summary: Create package
 *     description: Creates a new billing package with pricing, entitlements and
 *       feature configuration. Billable packages are synchronized to the payment
 *       provider. Legacy `limits` fields are mapped to `entitlements` when
 *       `entitlements` is not provided.
 *     tags: [Platform]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, code, monthlyPrice]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Professional
 *               code:
 *                 type: string
 *                 example: professional
 *               description:
 *                 type: string
 *                 example: Default professional tier
 *               monthlyPrice:
 *                 type: integer
 *                 example: 4900
 *               annualPrice:
 *                 type: integer
 *                 example: 49000
 *               currency:
 *                 type: string
 *                 example: USD
 *               trialDays:
 *                 type: integer
 *                 example: 30
 *               visibility:
 *                 type: string
 *                 enum: [public, internal]
 *               supportedModels:
 *                 type: array
 *                 items:
 *                   type: string
 *               analyticsLevel:
 *                 type: string
 *                 enum: [basic, advanced, enterprise]
 *               retentionDays:
 *                 type: integer
 *                 example: 90
 *               supportLevel:
 *                 type: string
 *                 enum: [community, standard, priority, dedicated]
 *               entitlements:
 *                 type: object
 *                 required: [employees, documents, storageMb, queriesPerMonth]
 *                 properties:
 *                   employees:
 *                     type: integer
 *                   admins:
 *                     type: integer
 *                   documents:
 *                     type: integer
 *                   storageMb:
 *                     type: integer
 *                   fileSizeMb:
 *                     type: integer
 *                   queriesPerMonth:
 *                     type: integer
 *                   tokensPerMonth:
 *                     type: integer
 *                   ocrPagesPerMonth:
 *                     type: integer
 *     responses:
 *       201:
 *         description: Package created successfully
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
 *                     code:
 *                       type: string
 *                     version:
 *                       type: integer
 *                     monthlyPrice:
 *                       type: integer
 *                     currency:
 *                       type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Payment provider sync failure
 */
router.post("/packages", requirePermission(Permission.BILLING_MANAGE), createPackageController);

/**
 * @openapi
 * /platform/packages/{id}:
 *   get:
 *     summary: Get package
 *     description: Returns a single billing package by id, including pricing,
 *       entitlements and feature configuration. Throws a 404 if the package
 *       does not exist.
 *     tags: [Platform]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Package id (ObjectId)
 *     responses:
 *       200:
 *         description: Package details
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
 *                     code:
 *                       type: string
 *                     version:
 *                       type: integer
 *                     active:
 *                       type: boolean
 *                     monthlyPrice:
 *                       type: integer
 *                     annualPrice:
 *                       type: integer
 *                     currency:
 *                       type: string
 *                     entitlements:
 *                       type: object
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Package not found
 */
router.get("/packages/:id", requirePermission(Permission.BILLING_READ), packageController);

/**
 * @openapi
 * /platform/packages/{id}:
 *   patch:
 *     summary: Update package
 *     description: Updates billing package fields and creates a new package
 *       version. `expectedVersion` must match the current version. Pricing
 *       changes are synchronized to the payment provider when applicable.
 *     tags: [Platform]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Package id (ObjectId)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [expectedVersion]
 *             properties:
 *               expectedVersion:
 *                 type: integer
 *                 example: 1
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               monthlyPrice:
 *                 type: integer
 *               annualPrice:
 *                 type: integer
 *               currency:
 *                 type: string
 *               trialDays:
 *                 type: integer
 *               visibility:
 *                 type: string
 *                 enum: [public, internal]
 *               supportedModels:
 *                 type: array
 *                 items:
 *                   type: string
 *               analyticsLevel:
 *                 type: string
 *                 enum: [basic, advanced, enterprise]
 *               retentionDays:
 *                 type: integer
 *               supportLevel:
 *                 type: string
 *                 enum: [community, standard, priority, dedicated]
 *               entitlements:
 *                 type: object
 *     responses:
 *       200:
 *         description: Package updated successfully
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
 *                     version:
 *                       type: integer
 *                     versionBumped:
 *                       type: boolean
 *                     example: true
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Package not found
 *       409:
 *         description: Stale version conflict
 *       500:
 *         description: Payment provider sync failure
 */
router.patch("/packages/:id", requirePermission(Permission.BILLING_MANAGE), updatePackageController);

/**
 * @openapi
 * /platform/packages/{id}/versions:
 *   post:
 *     summary: Create package version
 *     description: Bumps the package version with the provided field updates.
 *       `expectedVersion` must match the current version and at least one
 *       non-version field must be provided. Returns the updated package with a
 *       `versionBumped` flag.
 *     tags: [Platform]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Package id (ObjectId)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [expectedVersion]
 *             properties:
 *               expectedVersion:
 *                 type: integer
 *                 example: 1
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               monthlyPrice:
 *                 type: integer
 *               annualPrice:
 *                 type: integer
 *               currency:
 *                 type: string
 *               trialDays:
 *                 type: integer
 *               visibility:
 *                 type: string
 *                 enum: [public, internal]
 *               supportedModels:
 *                 type: array
 *                 items:
 *                   type: string
 *               analyticsLevel:
 *                 type: string
 *                 enum: [basic, advanced, enterprise]
 *               retentionDays:
 *                 type: integer
 *               supportLevel:
 *                 type: string
 *                 enum: [community, standard, priority, dedicated]
 *               entitlements:
 *                 type: object
 *     responses:
 *       200:
 *         description: Package version created
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
 *                     version:
 *                       type: integer
 *                     versionBumped:
 *                       type: boolean
 *                       example: true
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Package not found
 *       409:
 *         description: Stale version conflict
 */
router.post("/packages/:id/versions", requirePermission(Permission.BILLING_MANAGE), updatePackageController);

/**
 * @openapi
 * /platform/packages/{id}/impact:
 *   get:
 *     summary: Preview package impact
 *     description: Previews the impact of archiving or activating a package,
 *       including the number of affected subscriptions, warnings and any
 *       blocking reasons. No changes are applied.
 *     tags: [Platform]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Package id (ObjectId)
 *       - in: query
 *         name: action
 *         required: true
 *         schema:
 *           type: string
 *           enum: [archive, activate]
 *         description: Lifecycle action to preview
 *     responses:
 *       200:
 *         description: Impact preview
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
 *                     package:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         code:
 *                           type: string
 *                         version:
 *                           type: integer
 *                         active:
 *                           type: boolean
 *                     action:
 *                       type: string
 *                       enum: [archive, activate]
 *                     subscriptionUsageCount:
 *                       type: integer
 *                     affectedSubscriptionStates:
 *                       type: object
 *                     landingVisibilityImpact:
 *                       type: string
 *                     warnings:
 *                       type: array
 *                       items:
 *                         type: string
 *                     blockingReasons:
 *                       type: array
 *                       items:
 *                         type: string
 *                     transitionAllowed:
 *                       type: boolean
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Package not found
 */
router.get("/packages/:id/impact", requirePermission(Permission.BILLING_READ), packageImpactController);

/**
 * @openapi
 * /platform/packages/{id}/archive:
 *   post:
 *     summary: Archive package
 *     description: Archives a package, setting active to false and removing it
 *       from public selection. Requires the current package version and a
 *       reason for the lifecycle change.
 *     tags: [Platform]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Package id (ObjectId)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [expectedVersion, reason]
 *             properties:
 *               expectedVersion:
 *                 type: integer
 *                 example: 1
 *               reason:
 *                 type: string
 *                 example: Discontinued tier
 *     responses:
 *       200:
 *         description: Package archived
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
 *                     active:
 *                       type: boolean
 *                       example: false
 *                     version:
 *                       type: integer
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Package not found
 *       409:
 *         description: Stale version conflict
 */
router.post("/packages/:id/archive", requirePermission(Permission.BILLING_MANAGE), archivePackageController);

/**
 * @openapi
 * /platform/packages/{id}/activate:
 *   post:
 *     summary: Activate package
 *     description: Activates a previously archived package so it can be selected
 *       again. Requires the current package version and a reason for the
 *       lifecycle change.
 *     tags: [Platform]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Package id (ObjectId)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [expectedVersion, reason]
 *             properties:
 *               expectedVersion:
 *                 type: integer
 *                 example: 1
 *               reason:
 *                 type: string
 *                 example: Relaunched tier
 *     responses:
 *       200:
 *         description: Package activated
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
 *                     active:
 *                       type: boolean
 *                       example: true
 *                     version:
 *                       type: integer
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Package not found
 *       409:
 *         description: Stale version conflict
 */
router.post("/packages/:id/activate", requirePermission(Permission.BILLING_MANAGE), activatePackageController);

/**
 * @openapi
 * /platform/subscriptions:
 *   get:
 *     summary: List subscriptions
 *     description: Returns all tenant subscriptions with tenant and package
 *       references populated. Status values are returned in lowercase and
 *       provider ownership flags are included for each subscription.
 *     tags: [Platform]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of subscriptions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       tenantId:
 *                         type: object
 *                       packageId:
 *                         type: object
 *                       status:
 *                         type: string
 *                       version:
 *                         type: integer
 *                       providerManaged:
 *                         type: boolean
 *                       providerState:
 *                         type: object
 *                         properties:
 *                           hasCustomer:
 *                             type: boolean
 *                           hasSubscription:
 *                             type: boolean
 *                           hasPrice:
 *                             type: boolean
 *                       currentPeriodStart:
 *                         type: string
 *                         nullable: true
 *                       currentPeriodEnd:
 *                         type: string
 *                         nullable: true
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get("/subscriptions", requirePermission(Permission.BILLING_READ), subscriptionsController);

/**
 * @openapi
 * /platform/subscriptions/{tenantId}/impact:
 *   get:
 *     summary: Preview subscription impact
 *     description: Previews the effect of provisioning or updating a tenant
 *       subscription, including entitlement changes and legal transitions.
 *       No changes are applied.
 *     tags: [Platform]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant id (ObjectId)
 *       - in: query
 *         name: action
 *         required: true
 *         schema:
 *           type: string
 *           enum: [provision, update]
 *         description: Operation to preview
 *       - in: query
 *         name: packageId
 *         schema:
 *           type: string
 *         description: Target package id (ObjectId)
 *       - in: query
 *         name: targetStatus
 *         schema:
 *           type: string
 *         description: Target subscription status
 *       - in: query
 *         name: expectedVersion
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Expected subscription revision
 *     responses:
 *       200:
 *         description: Subscription impact preview
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
 *                     tenant:
 *                       type: object
 *                     subscription:
 *                       type: object
 *                       nullable: true
 *                     targetPackage:
 *                       type: object
 *                       nullable: true
 *                     currentPackage:
 *                       type: object
 *                       nullable: true
 *                     entitlementChanges:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           entitlement:
 *                             type: string
 *                           from:
 *                             type: integer
 *                           to:
 *                             type: integer
 *                           direction:
 *                             type: string
 *                             enum: [unchanged, increase, decrease]
 *                     legalTransitions:
 *                       type: array
 *                       items:
 *                         type: string
 *                     transitionAllowed:
 *                       type: boolean
 *                     blockingReasons:
 *                       type: array
 *                       items:
 *                         type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Tenant not found
 */
router.get("/subscriptions/:tenantId/impact", requirePermission(Permission.BILLING_READ), subscriptionImpactController);

/**
 * @openapi
 * /platform/subscriptions/{tenantId}:
 *   get:
 *     summary: Get subscription detail
 *     description: Returns the subscription for a tenant, including the tenant
 *       record, a sanitized subscription view and the legal status transitions
 *       available from the current status.
 *     tags: [Platform]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant id (ObjectId)
 *     responses:
 *       200:
 *         description: Subscription detail
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
 *                     tenant:
 *                       type: object
 *                     subscription:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         _id:
 *                           type: string
 *                         status:
 *                           type: string
 *                         packageVersion:
 *                           type: integer
 *                         version:
 *                           type: integer
 *                         providerManaged:
 *                           type: boolean
 *                         periodStart:
 *                           type: string
 *                           nullable: true
 *                         periodEnd:
 *                           type: string
 *                           nullable: true
 *                         trialEnd:
 *                           type: string
 *                           nullable: true
 *                     legalTransitions:
 *                       type: array
 *                       items:
 *                         type: string
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Tenant not found
 */
router.get("/subscriptions/:tenantId", requirePermission(Permission.BILLING_READ), subscriptionDetailController);

/**
 * @openapi
 * /platform/subscriptions/{tenantId}:
 *   post:
 *     summary: Provision subscription
 *     description: Creates a subscription for a tenant with the given package
 *       and status. The request must carry a valid `Idempotency-Key` header so
 *       repeated submissions do not create duplicates.
 *     tags: [Platform]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant id (ObjectId)
 *       - in: header
 *         name: Idempotency-Key
 *         required: true
 *         schema:
 *           type: string
 *         description: Idempotency key, 8-200 characters
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [packageId, status, expectedVersion, reason]
 *             properties:
 *               packageId:
 *                 type: string
 *                 example: 5f9c1b9b9d9e9a0e8c9b9b9b
 *               status:
 *                 type: string
 *                 enum: [trialing, active]
 *               expectedVersion:
 *                 type: integer
 *                 example: 0
 *               reason:
 *                 type: string
 *                 example: Provisioned by support
 *     responses:
 *       201:
 *         description: Subscription provisioned
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
 *                     _id:
 *                       type: string
 *                     tenantId:
 *                       type: string
 *                     packageId:
 *                       type: string
 *                     status:
 *                       type: string
 *                     version:
 *                       type: integer
 *                     idempotentReplay:
 *                       type: boolean
 *                     example: false
 *       400:
 *         description: Validation error or invalid idempotency key
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Tenant or package not found
 *       409:
 *         description: Subscription already exists or stale version
 *       500:
 *         description: Payment provider failure
 */
router.post("/subscriptions/:tenantId", requirePermission(Permission.BILLING_MANAGE), provisionSubscriptionController);

/**
 * @openapi
 * /platform/subscriptions/{tenantId}:
 *   patch:
 *     summary: Update subscription
 *     description: Transitions an existing tenant subscription to a new package
 *       or status. The request must carry a valid `Idempotency-Key` header and
 *       an `expectedVersion` matching the current subscription revision.
 *     tags: [Platform]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant id (ObjectId)
 *       - in: header
 *         name: Idempotency-Key
 *         required: true
 *         schema:
 *           type: string
 *         description: Idempotency key, 8-200 characters
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [expectedVersion, reason]
 *             properties:
 *               packageId:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [trialing, incomplete, active, past_due, paused, cancel_at_period_end, canceled, expired, unpaid]
 *               expectedVersion:
 *                 type: integer
 *                 example: 1
 *               reason:
 *                 type: string
 *                 example: Downgrade requested by customer
 *               renewsAt:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Subscription updated
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
 *                     _id:
 *                       type: string
 *                     status:
 *                       type: string
 *                     packageVersion:
 *                       type: integer
 *                     version:
 *                       type: integer
 *                     idempotentReplay:
 *                       type: boolean
 *                     example: false
 *       400:
 *         description: Validation error or invalid idempotency key
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Subscription not found
 *       409:
 *         description: Stale version conflict or invalid transition
 *       500:
 *         description: Payment provider failure
 */
router.patch("/subscriptions/:tenantId", requirePermission(Permission.BILLING_MANAGE), updateSubscriptionController);

/**
 * @openapi
 * /platform/users:
 *   get:
 *     summary: List platform users
 *     description: Returns a paginated list of non-super-admin users across all
 *       tenants, optionally filtered by search term or status. Tenant
 *       references are populated.
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
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or email
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by user status
 *     responses:
 *       200:
 *         description: Paginated list of users
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
 *                     users:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           email:
 *                             type: string
 *                           role:
 *                             type: string
 *                           status:
 *                             type: string
 *                           emailVerified:
 *                             type: boolean
 *                           tenantId:
 *                             type: object
 *                           createdAt:
 *                             type: string
 *                             format: date-time
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
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get("/users", requirePermission(Permission.USERS_READ), platformUsersController);

/**
 * @openapi
 * /platform/usage:
 *   get:
 *     summary: Platform usage
 *     description: Returns aggregate question usage by tenant, a daily question
 *       time series, and platform-wide storage totals.
 *     tags: [Platform]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Platform usage metrics
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
 *                     byTenant:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           tenantId:
 *                             type: string
 *                           tenantName:
 *                             type: string
 *                           questions:
 *                             type: integer
 *                           estimatedCost:
 *                             type: number
 *                     byDay:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           questions:
 *                             type: integer
 *                     storage:
 *                       type: object
 *                       properties:
 *                         storageBytes:
 *                           type: integer
 *                         documents:
 *                           type: integer
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get("/usage", requirePermission(Permission.ANALYTICS_READ), usageController);

/**
 * @openapi
 * /platform/jobs:
 *   get:
 *     summary: List processing jobs
 *     description: Returns a paginated list of document processing jobs across
 *       all tenants, optionally filtered by status. Tenant references are
 *       populated and jobs are sorted by most recently updated.
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
 *         description: Filter by processing status
 *     responses:
 *       200:
 *         description: Paginated list of jobs
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
 *                     jobs:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           tenantId:
 *                             type: object
 *                           fileName:
 *                             type: string
 *                           status:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
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
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get("/jobs", requirePermission(Permission.DOCUMENTS_READ), jobsController);

/**
 * @openapi
 * /platform/system-health:
 *   get:
 *     summary: System health
 *     description: Returns the current health of core platform services,
 *       including the API, MongoDB, Redis and background workers.
 *     tags: [Platform]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System health status
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
 *                     status:
 *                       type: string
 *                       enum: [healthy, degraded]
 *                     services:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           status:
 *                             type: string
 *                     checkedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get("/system-health", requirePermission(Permission.COMPANY_SETTINGS_READ), healthController);

/**
 * @openapi
 * /platform/audit:
 *   get:
 *     summary: Platform audit log
 *     description: Returns a paginated list of platform audit log entries,
 *       optionally filtered by search term or action. Entries include the
 *       acting user, action, resource type and outcome.
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
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by actor email, action or resource type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by audit action
 *     responses:
 *       200:
 *         description: Paginated audit log
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
 *                     logs:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           action:
 *                             type: string
 *                           actorEmail:
 *                             type: string
 *                           resourceType:
 *                             type: string
 *                           outcome:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
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
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get("/audit", requirePermission(Permission.AUDIT_READ), auditController);

/**
 * @openapi
 * /platform/ai-configuration:
 *   get:
 *     summary: Get AI configuration
 *     description: Returns the platform AI configuration setting, including
 *       model selection and related parameters. Secret-like values are
 *       redacted before being returned.
 *     tags: [Platform]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: AI configuration setting
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
 *                   additionalProperties: true
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get("/ai-configuration", requirePermission(Permission.COMPANY_SETTINGS_READ), aiConfigurationController);

/**
 * @openapi
 * /platform/ai-configuration:
 *   patch:
 *     summary: Update AI configuration
 *     description: Updates the platform AI configuration setting. The selected
 *       model (model or modelName) is validated against the tenant entitlements
 *       before the change is applied.
 *     tags: [Platform]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [model]
 *             properties:
 *               model:
 *                 type: string
 *                 example: gemini-2.5-pro
 *               modelName:
 *                 type: string
 *               temperature:
 *                 type: number
 *             additionalProperties:
 *               oneOf:
 *                 - type: string
 *                 - type: number
 *                 - type: boolean
 *                 - type: "null"
 *     responses:
 *       200:
 *         description: AI configuration updated
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
 *                   additionalProperties: true
 *       400:
 *         description: Validation error or unsupported model
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions or entitlement limit reached
 *       500:
 *         description: Internal error
 */
router.patch("/ai-configuration", requirePermission(Permission.COMPANY_SETTINGS_UPDATE), modelSelectionGuard, updateAiConfigurationController);

/**
 * @openapi
 * /platform/settings:
 *   get:
 *     summary: Get global settings
 *     description: Returns the platform global settings, including support
 *       email, maintenance mode, registration policy, trial duration and data
 *       retention policy.
 *     tags: [Platform]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Global settings
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
 *                     supportEmail:
 *                       type: string
 *                     maintenanceMode:
 *                       type: boolean
 *                     allowRegistrations:
 *                       type: boolean
 *                     defaultTrialDays:
 *                       type: integer
 *                     dataRetentionDays:
 *                       type: integer
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get("/settings", requirePermission(Permission.COMPANY_SETTINGS_READ), settingsController);

/**
 * @openapi
 * /platform/settings:
 *   patch:
 *     summary: Update global settings
 *     description: Updates one or more platform global settings. At least one
 *       setting must be provided and unknown fields are rejected.
 *     tags: [Platform]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               supportEmail:
 *                 type: string
 *                 example: support@documind.ai
 *               maintenanceMode:
 *                 type: boolean
 *               allowRegistrations:
 *                 type: boolean
 *               defaultTrialDays:
 *                 type: integer
 *               dataRetentionDays:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Global settings updated
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
 *                   additionalProperties: true
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.patch("/settings", requirePermission(Permission.COMPANY_SETTINGS_UPDATE), updateSettingsController);

export default router;
