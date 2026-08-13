import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  createCheckoutController,
  checkoutStatusController,
  listCheckoutSessionsController,
  subscriptionStatusController,
  createBillingPortalController,
  synchronizeCheckoutSessionController,
} from "./checkout.controller.js";

const router = Router();

router.use(authenticate, tenantScoping);

/**
 * @openapi
 * /checkout/sessions:
 *   post:
 *     summary: Create a checkout session
 *     description: Creates a payment provider checkout session for the tenant
 *       and selected package. Returns the checkout session id and the hosted
 *       payment URL. Rejects requests when an active subscription or a pending
 *       checkout already exists.
 *     tags: [Checkout]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [packageId, billingInterval]
 *             properties:
 *               packageId:
 *                 type: string
 *                 example: 64b8f1c2e4b0a1a2b3c4d5e6
 *               billingInterval:
 *                 type: string
 *                 enum: [monthly, annual]
 *                 example: monthly
 *     responses:
 *       201:
 *         description: Checkout session created
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
 *                     checkoutId:
 *                       type: string
 *                     sessionUrl:
 *                       type: string
 *                     providerSessionId:
 *                       type: string
 *       400:
 *         description: Validation error or package not available for checkout
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Package not found
 *       409:
 *         description: Active subscription or pending checkout exists
 */
router.post(
  "/sessions",
  requirePermission(Permission.BILLING_MANAGE),
  createCheckoutController,
);

/**
 * @openapi
 * /checkout/sessions/{sessionId}/sync:
 *   post:
 *     summary: Synchronize a checkout session
 *     description: Synchronizes a checkout session with the payment provider
 *       after payment completes. Confirms the subscription and projects
 *       invoices. Returns whether the local state changed and the
 *       synchronized subscription.
 *     tags: [Checkout]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Provider checkout session id (for example cs_xxx)
 *     responses:
 *       200:
 *         description: Checkout session synchronized
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
 *                     synchronized:
 *                       type: boolean
 *                       example: true
 *                     changed:
 *                       type: boolean
 *                     subscription:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         status:
 *                           type: string
 *                         packageId:
 *                           type: string
 *                         billingInterval:
 *                           type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Checkout session not found
 *       409:
 *         description: Checkout is not complete or payment not finalized
 *       503:
 *         description: Payment provider is temporarily unavailable
 */
router.post(
  "/sessions/:sessionId/sync",
  requirePermission(Permission.BILLING_MANAGE),
  synchronizeCheckoutSessionController,
);

/**
 * @openapi
 * /checkout/sessions/{checkoutId}:
 *   get:
 *     summary: Get checkout session status
 *     description: Returns the local status of a checkout session by id,
 *       including provider session id, billing interval, and current status.
 *     tags: [Checkout]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: checkoutId
 *         required: true
 *         schema:
 *           type: string
 *         description: Checkout session id (24 hex characters)
 *     responses:
 *       200:
 *         description: Checkout session status
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
 *                     providerSessionId:
 *                       type: string
 *                     packageId:
 *                       type: string
 *                     packageVersion:
 *                       type: number
 *                     billingInterval:
 *                       type: string
 *                       enum: [monthly, annual]
 *                     status:
 *                       type: string
 *                       enum: [pending, completed, failed, expired]
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     completedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Checkout session not found
 */
router.get(
  "/sessions/:checkoutId",
  requirePermission(Permission.BILLING_READ),
  checkoutStatusController,
);

/**
 * @openapi
 * /checkout/sessions:
 *   get:
 *     summary: List checkout sessions
 *     description: Lists the tenant's checkout sessions, most recent first.
 *       Supports pagination via the page and pageSize query parameters.
 *     tags: [Checkout]
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
 *     responses:
 *       200:
 *         description: Paginated list of checkout sessions
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
 *                     sessions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           providerSessionId:
 *                             type: string
 *                           packageId:
 *                             type: string
 *                           packageVersion:
 *                             type: number
 *                           billingInterval:
 *                             type: string
 *                           status:
 *                             type: string
 *                           expiresAt:
 *                             type: string
 *                             format: date-time
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           completedAt:
 *                             type: string
 *                             format: date-time
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         pageSize:
 *                           type: integer
 *                         totalRecords:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  "/sessions",
  requirePermission(Permission.BILLING_READ),
  listCheckoutSessionsController,
);

/**
 * @openapi
 * /checkout/subscription:
 *   get:
 *     summary: Get subscription status
 *     description: Returns the tenant's current subscription status including
 *       package, billing period, lifecycle eligibility, and available billing
 *       capabilities. Response is not cached.
 *     tags: [Checkout]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription status
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
 *                     tenantId:
 *                       type: string
 *                     status:
 *                       type: string
 *                     paymentState:
 *                       type: string
 *                     packageId:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         code:
 *                           type: string
 *                         version:
 *                           type: number
 *                         monthlyPrice:
 *                           type: number
 *                         annualPrice:
 *                           type: number
 *                         currency:
 *                           type: string
 *                     packageVersion:
 *                       type: number
 *                     billingInterval:
 *                       type: string
 *                       enum: [monthly, annual]
 *                     cancelAtPeriodEnd:
 *                       type: boolean
 *                     providerManaged:
 *                       type: boolean
 *                     providerLinked:
 *                       type: boolean
 *                     pendingOperation:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         type:
 *                           type: string
 *                         status:
 *                           type: string
 *                         requestedAt:
 *                           type: string
 *                           format: date-time
 *                     canOpenPortal:
 *                       type: boolean
 *                     canUpdatePaymentMethod:
 *                       type: boolean
 *                     canChangePlan:
 *                       type: boolean
 *                     canCancel:
 *                       type: boolean
 *                     canReactivate:
 *                       type: boolean
 *                     canRequestRefund:
 *                       type: boolean
 *                     canViewInvoices:
 *                       type: boolean
 *                     lifecycle:
 *                       type: object
 *                       properties:
 *                         eligible:
 *                           type: boolean
 *                         inGracePeriod:
 *                           type: boolean
 *                         accessEndsAt:
 *                           type: string
 *                           format: date-time
 *                         reason:
 *                           type: string
 *                     invoiceSummary:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                         open:
 *                           type: number
 *                         paid:
 *                           type: number
 *                         pastDue:
 *                           type: number
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Subscription not found
 */
router.get(
  "/subscription",
  requirePermission(Permission.BILLING_READ),
  subscriptionStatusController,
);

/**
 * @openapi
 * /checkout/billing-portal:
 *   post:
 *     summary: Create billing portal session
 *     description: Creates a payment provider billing portal session for the
 *       tenant's customer and returns the hosted portal URL.
 *     tags: [Checkout]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Billing portal session created
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
 *                     url:
 *                       type: string
 *       400:
 *         description: No billing customer on file or portal unavailable
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Subscription not found
 *       503:
 *         description: Payment provider is temporarily unavailable
 */
router.post(
  "/billing-portal",
  requirePermission(Permission.BILLING_MANAGE),
  createBillingPortalController,
);

export default router;
