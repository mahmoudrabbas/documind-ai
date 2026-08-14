import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { billingOperationController, billingSummaryController, cancellationController, invoiceDetailController, invoiceLinksController, invoiceListController, portalSessionController, reactivationController, refundDetailController, refundEligibilityPreviewController, refundListController, refundRequestController, subscriptionChangeController, subscriptionChangePreviewController } from "./tenant-billing.controller.js";

const router = Router();
router.use(authenticate, tenantScoping);
const billingDenialAudit = { denialAuditAction: "BILLING_AUTHORIZATION_DENIED" as const, resourceType: "Permission" as const };
/**
 * @openapi
 * /billing/summary:
 *   get:
 *     summary: Get billing summary
 *     description: Returns the tenant's current billing summary including
 *       subscription status, active package, billing period, lifecycle
 *       eligibility, available capabilities, and invoice counts. Used to power
 *       the billing settings dashboard and reflects pending billing operations.
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Billing summary
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
 *                         failureCode:
 *                           type: string
 *                         effectiveAt:
 *                           type: string
 *                           format: date-time
 *                         cancellationType:
 *                           type: string
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
 *                     transitionState:
 *                       type: string
 *                       enum: [ACTIVE, TRANSITION_PENDING, TRANSITION_RETRYABLE, REPAIR_REQUIRED]
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Subscription not found
 */
router.get("/summary", requirePermission(Permission.BILLING_READ, billingDenialAudit), billingSummaryController);
/**
 * @openapi
 * /billing/portal-sessions:
 *   post:
 *     summary: Create billing portal session
 *     description: Creates a payment provider billing portal session for the
 *       tenant's existing customer. The flow controls whether the general
 *       billing portal or a payment method update flow is launched. Returns
 *       the hosted portal URL and its expiry time.
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [flow]
 *             properties:
 *               flow:
 *                 type: string
 *                 enum: [general, payment_method_update]
 *                 example: general
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
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error or billing portal unavailable
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       503:
 *         description: Billing provider is temporarily unavailable
 */
router.post("/portal-sessions", requirePermission(Permission.BILLING_MANAGE, billingDenialAudit), portalSessionController);
/**
 * @openapi
 * /billing/subscription-change-previews:
 *   post:
 *     summary: Preview a subscription plan change
 *     description: Previews a plan change for the tenant without applying it.
 *       Validates that the target package is available and currency-compatible,
 *       and returns the amount due, credit, effective date, and entitlement
 *       impact. The resulting preview must be used to request the change
 *       before it expires.
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetPackageId, billingInterval]
 *             properties:
 *               targetPackageId:
 *                 type: string
 *                 example: 64b8f1c2e4b0a1a2b3c4d5e6
 *               billingInterval:
 *                 type: string
 *                 enum: [monthly, annual]
 *                 example: monthly
 *     responses:
 *       200:
 *         description: Subscription change preview created
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
 *                     currentPackage:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         code:
 *                           type: string
 *                         version:
 *                           type: number
 *                     targetPackage:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         code:
 *                           type: string
 *                         version:
 *                           type: number
 *                     billingInterval:
 *                       type: string
 *                     currency:
 *                       type: string
 *                     amountDueMinor:
 *                       type: number
 *                     amountCreditMinor:
 *                       type: number
 *                     effectiveAt:
 *                       type: string
 *                       format: date-time
 *                     nextBillingDate:
 *                       type: string
 *                       format: date-time
 *                     entitlementImpact:
 *                       type: array
 *                       items:
 *                         type: object
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                     subscriptionRevision:
 *                       type: number
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Subscription or package not found
 *       409:
 *         description: Plan change not allowed or already pending
 */
router.post("/subscription-change-previews", requirePermission(Permission.BILLING_MANAGE, billingDenialAudit), subscriptionChangePreviewController);
/**
 * @openapi
 * /billing/subscription-changes:
 *   post:
 *     summary: Request a subscription plan change
 *     description: Requests a subscription plan change using a previously
 *       created preview. The idempotency key ensures replaying the same
 *       request does not create duplicate operations. Returns the resulting
 *       billing operation and whether the request was replayed.
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [previewId, idempotencyKey]
 *             properties:
 *               previewId:
 *                 type: string
 *                 example: 64b8f1c2e4b0a1a2b3c4d5e6
 *               idempotencyKey:
 *                 type: string
 *                 example: plan-change-8f2a9c1d
 *     responses:
 *       200:
 *         description: Subscription change requested
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
 *                     operation:
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
 *                         confirmedAt:
 *                           type: string
 *                           format: date-time
 *                         failedAt:
 *                           type: string
 *                           format: date-time
 *                         retryCount:
 *                           type: number
 *                         failureCode:
 *                           type: string
 *                         effectiveAt:
 *                           type: string
 *                           format: date-time
 *                         cancellationType:
 *                           type: string
 *                     replayed:
 *                       type: boolean
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Preview or subscription not found
 *       409:
 *         description: Preview expired or a billing change is already pending
 */
router.post("/subscription-changes", requirePermission(Permission.BILLING_MANAGE, billingDenialAudit), subscriptionChangeController);
/**
 * @openapi
 * /billing/cancellations:
 *   post:
 *     summary: Request subscription cancellation
 *     description: Requests cancellation of the tenant's subscription.
 *       PERIOD_END cancels at the end of the current billing period while
 *       IMMEDIATE cancels right away. The idempotency key prevents duplicate
 *       cancellation operations.
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cancellationType, idempotencyKey]
 *             properties:
 *               cancellationType:
 *                 type: string
 *                 enum: [PERIOD_END, IMMEDIATE]
 *                 example: PERIOD_END
 *               idempotencyKey:
 *                 type: string
 *                 example: cancel-3f7b9d2a
 *     responses:
 *       200:
 *         description: Cancellation requested
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
 *                     operation:
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
 *                         confirmedAt:
 *                           type: string
 *                           format: date-time
 *                         failedAt:
 *                           type: string
 *                           format: date-time
 *                         retryCount:
 *                           type: number
 *                         failureCode:
 *                           type: string
 *                         effectiveAt:
 *                           type: string
 *                           format: date-time
 *                         cancellationType:
 *                           type: string
 *                     replayed:
 *                       type: boolean
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       409:
 *         description: Cancellation not allowed for this subscription state
 */
router.post("/cancellations", requirePermission(Permission.BILLING_MANAGE, billingDenialAudit), cancellationController);
/**
 * @openapi
 * /billing/reactivations:
 *   post:
 *     summary: Reactivate a scheduled cancellation
 *     description: Reactivates a subscription that has a scheduled
 *       cancellation. The idempotency key ensures the request is safe to
 *       retry. Returns the resulting billing operation.
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [idempotencyKey]
 *             properties:
 *               idempotencyKey:
 *                 type: string
 *                 example: reactivate-1e6c8a0b
 *     responses:
 *       200:
 *         description: Reactivation requested
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
 *                     operation:
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
 *                         confirmedAt:
 *                           type: string
 *                           format: date-time
 *                         failedAt:
 *                           type: string
 *                           format: date-time
 *                         retryCount:
 *                           type: number
 *                         failureCode:
 *                           type: string
 *                         effectiveAt:
 *                           type: string
 *                           format: date-time
 *                         cancellationType:
 *                           type: string
 *                     replayed:
 *                       type: boolean
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       409:
 *         description: No scheduled cancellation can be reactivated
 */
router.post("/reactivations", requirePermission(Permission.BILLING_MANAGE, billingDenialAudit), reactivationController);
/**
 * @openapi
 * /billing/operations/{operationId}:
 *   get:
 *     summary: Get a billing operation
 *     description: Returns a single billing operation by id. Operations track
 *       asynchronous billing changes such as plan changes, cancellations, and
 *       reactivations, including their current status and failure details.
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: operationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Billing operation id (24 hex characters)
 *     responses:
 *       200:
 *         description: Billing operation details
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
 *                     type:
 *                       type: string
 *                     status:
 *                       type: string
 *                     requestedAt:
 *                       type: string
 *                       format: date-time
 *                     confirmedAt:
 *                       type: string
 *                       format: date-time
 *                     failedAt:
 *                       type: string
 *                       format: date-time
 *                     retryCount:
 *                       type: number
 *                     failureCode:
 *                       type: string
 *                     effectiveAt:
 *                       type: string
 *                       format: date-time
 *                     cancellationType:
 *                       type: string
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Billing operation not found
 */
router.get("/operations/:operationId", requirePermission(Permission.BILLING_READ, billingDenialAudit), billingOperationController);
/**
 * @openapi
 * /billing/refund-eligibility-previews:
 *   post:
 *     summary: Preview refund eligibility
 *     description: Computes a refund eligibility preview for a paid invoice.
 *       Evaluates usage, elapsed billing period, and policy rules to determine
 *       the maximum eligible refund amount and any subscription impact. The
 *       preview expires and must be consumed by a refund request.
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [invoiceId]
 *             properties:
 *               invoiceId:
 *                 type: string
 *                 example: 64b8f1c2e4b0a1a2b3c4d5e6
 *     responses:
 *       200:
 *         description: Refund eligibility preview created
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
 *                     invoiceId:
 *                       type: string
 *                     invoiceAmountMinor:
 *                       type: number
 *                     currency:
 *                       type: string
 *                     periodElapsedPercent:
 *                       type: number
 *                     usage:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           dimension:
 *                             type: string
 *                           percent:
 *                             type: number
 *                     maximumEligibleRefundMinor:
 *                       type: number
 *                     consumedValueMinor:
 *                       type: number
 *                     periodStart:
 *                       type: string
 *                       format: date-time
 *                     periodEnd:
 *                       type: string
 *                       format: date-time
 *                     targetPlan:
 *                       type: object
 *                       properties:
 *                         code:
 *                           type: string
 *                         name:
 *                           type: string
 *                     reason:
 *                       type: string
 *                     subscriptionImpact:
 *                       type: string
 *                       enum: [NONE, CANCEL_IMMEDIATELY_AFTER_REFUND, CANCEL_AND_MOVE_TO_FREE]
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                     reviewRequired:
 *                       type: boolean
 *                     decisionReason:
 *                       type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Invoice not found
 *       409:
 *         description: Invoice is not eligible for refund
 */
router.post("/refund-eligibility-previews", requirePermission(Permission.BILLING_MANAGE, billingDenialAudit), refundEligibilityPreviewController);
/**
 * @openapi
 * /billing/refund-requests:
 *   post:
 *     summary: Create a refund request
 *     description: Creates a refund request for the tenant using a previously
 *       created eligibility preview. The idempotency key prevents duplicate
 *       requests. Returns the created refund and whether the request was
 *       replayed.
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [previewId, idempotencyKey]
 *             properties:
 *               previewId:
 *                 type: string
 *                 example: 64b8f1c2e4b0a1a2b3c4d5e6
 *               idempotencyKey:
 *                 type: string
 *                 example: refund-5d9c7f2a
 *     responses:
 *       200:
 *         description: Refund request created
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
 *                     refund:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         tenantId:
 *                           type: string
 *                         invoiceId:
 *                           type: string
 *                         invoiceNumber:
 *                           type: string
 *                         subscriptionId:
 *                           type: string
 *                         amountMinor:
 *                           type: number
 *                         currency:
 *                           type: string
 *                         reason:
 *                           type: string
 *                         reasonCode:
 *                           type: string
 *                         status:
 *                           type: string
 *                         providerPending:
 *                           type: boolean
 *                         failureCode:
 *                           type: string
 *                         operationId:
 *                           type: string
 *                         requestedBy:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: string
 *                             name:
 *                               type: string
 *                             email:
 *                               type: string
 *                         confirmedBy:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: string
 *                             name:
 *                               type: string
 *                             email:
 *                               type: string
 *                         requestedAt:
 *                           type: string
 *                           format: date-time
 *                         confirmedAt:
 *                           type: string
 *                           format: date-time
 *                         rejectedAt:
 *                           type: string
 *                           format: date-time
 *                         rejectionReason:
 *                           type: string
 *                         maximumEligibleRefundMinor:
 *                           type: number
 *                         subscriptionImpact:
 *                           type: string
 *                         subscriptionImpactStatus:
 *                           type: string
 *                         localTransitionStatus:
 *                           type: string
 *                         settlementCompleted:
 *                           type: boolean
 *                     replayed:
 *                       type: boolean
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Refund eligibility preview or invoice not found
 *       409:
 *         description: Preview expired, amount invalid, or refund already pending
 */
router.post("/refund-requests", requirePermission(Permission.BILLING_MANAGE, billingDenialAudit), refundRequestController);
/**
 * @openapi
 * /billing/refund-requests:
 *   get:
 *     summary: List refund requests
 *     description: Lists the tenant's refund requests, most recent first.
 *       Supports pagination via the page and pageSize query parameters.
 *     tags: [Billing]
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
 *         description: Paginated list of refund requests
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
 *                     refunds:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           tenantId:
 *                             type: string
 *                           invoiceId:
 *                             type: string
 *                           invoiceNumber:
 *                             type: string
 *                           subscriptionId:
 *                             type: string
 *                           amountMinor:
 *                             type: number
 *                           currency:
 *                             type: string
 *                           reason:
 *                             type: string
 *                           reasonCode:
 *                             type: string
 *                           status:
 *                             type: string
 *                           providerPending:
 *                             type: boolean
 *                           failureCode:
 *                             type: string
 *                           operationId:
 *                             type: string
 *                           requestedAt:
 *                             type: string
 *                             format: date-time
 *                           confirmedAt:
 *                             type: string
 *                             format: date-time
 *                           rejectedAt:
 *                             type: string
 *                             format: date-time
 *                           rejectionReason:
 *                             type: string
 *                           maximumEligibleRefundMinor:
 *                             type: number
 *                           subscriptionImpact:
 *                             type: string
 *                           subscriptionImpactStatus:
 *                             type: string
 *                           localTransitionStatus:
 *                             type: string
 *                           settlementCompleted:
 *                             type: boolean
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
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get("/refund-requests", requirePermission(Permission.BILLING_READ, billingDenialAudit), refundListController);
/**
 * @openapi
 * /billing/refund-requests/{refundId}:
 *   get:
 *     summary: Get a refund request
 *     description: Returns a single refund request belonging to the tenant,
 *       including its status, amounts, actors, and subscription impact.
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: refundId
 *         required: true
 *         schema:
 *           type: string
 *         description: Refund request id (24 hex characters)
 *     responses:
 *       200:
 *         description: Refund request details
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
 *                     invoiceId:
 *                       type: string
 *                     invoiceNumber:
 *                       type: string
 *                     subscriptionId:
 *                       type: string
 *                     amountMinor:
 *                       type: number
 *                     currency:
 *                       type: string
 *                     reason:
 *                       type: string
 *                     reasonCode:
 *                       type: string
 *                     status:
 *                       type: string
 *                     providerPending:
 *                       type: boolean
 *                     failureCode:
 *                       type: string
 *                     operationId:
 *                       type: string
 *                     requestedBy:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         email:
 *                           type: string
 *                     confirmedBy:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         email:
 *                           type: string
 *                     requestedAt:
 *                       type: string
 *                       format: date-time
 *                     confirmedAt:
 *                       type: string
 *                       format: date-time
 *                     rejectedAt:
 *                       type: string
 *                       format: date-time
 *                     rejectionReason:
 *                       type: string
 *                     maximumEligibleRefundMinor:
 *                       type: number
 *                     subscriptionImpact:
 *                       type: string
 *                     subscriptionImpactStatus:
 *                       type: string
 *                     localTransitionStatus:
 *                       type: string
 *                     settlementCompleted:
 *                       type: boolean
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Refund request not found
 */
router.get("/refund-requests/:refundId", requirePermission(Permission.BILLING_READ, billingDenialAudit), refundDetailController);
/**
 * @openapi
 * /billing/invoices:
 *   get:
 *     summary: List invoices
 *     description: Lists the tenant's invoices, most recent first. Supports
 *       filtering by status and subscription id, an optional date range, and
 *       pagination.
 *     tags: [Billing]
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
 *           enum: [draft, open, paid, void, uncollectible]
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *         description: Inclusive lower bound on provider creation date
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *         description: Inclusive upper bound on provider creation date
 *       - in: query
 *         name: subscriptionId
 *         schema:
 *           type: string
 *         description: Filter invoices by subscription id (24 hex characters)
 *     responses:
 *       200:
 *         description: Paginated list of invoices
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
 *                     invoices:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           invoiceNumber:
 *                             type: string
 *                           status:
 *                             type: string
 *                           currency:
 *                             type: string
 *                           amountDueMinor:
 *                             type: number
 *                           amountPaidMinor:
 *                             type: number
 *                           amountRemainingMinor:
 *                             type: number
 *                           subtotalMinor:
 *                             type: number
 *                           taxMinor:
 *                             type: number
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           dueAt:
 *                             type: string
 *                             format: date-time
 *                           paidAt:
 *                             type: string
 *                             format: date-time
 *                           periodStart:
 *                             type: string
 *                             format: date-time
 *                           periodEnd:
 *                             type: string
 *                             format: date-time
 *                           refundedAmountMinor:
 *                             type: number
 *                           canRequestRefund:
 *                             type: boolean
 *                           hostedInvoiceAvailable:
 *                             type: boolean
 *                           invoicePdfAvailable:
 *                             type: boolean
 *                           receiptAvailable:
 *                             type: boolean
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
router.get("/invoices", requirePermission(Permission.BILLING_READ, billingDenialAudit), invoiceListController);
/**
 * @openapi
 * /billing/invoices/{invoiceId}:
 *   get:
 *     summary: Get an invoice
 *     description: Returns a single invoice for the tenant, including amounts,
 *       payment status, refund summary, and hosted document availability.
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Invoice id (24 hex characters)
 *     responses:
 *       200:
 *         description: Invoice details
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
 *                     invoiceNumber:
 *                       type: string
 *                     status:
 *                       type: string
 *                     currency:
 *                       type: string
 *                     amountDueMinor:
 *                       type: number
 *                     amountPaidMinor:
 *                       type: number
 *                     amountRemainingMinor:
 *                       type: number
 *                     subtotalMinor:
 *                       type: number
 *                     taxMinor:
 *                       type: number
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     dueAt:
 *                       type: string
 *                       format: date-time
 *                     paidAt:
 *                       type: string
 *                       format: date-time
 *                     periodStart:
 *                       type: string
 *                       format: date-time
 *                     periodEnd:
 *                       type: string
 *                       format: date-time
 *                     refundedAmountMinor:
 *                       type: number
 *                     canRequestRefund:
 *                       type: boolean
 *                     hostedInvoiceAvailable:
 *                       type: boolean
 *                     invoicePdfAvailable:
 *                       type: boolean
 *                     receiptAvailable:
 *                       type: boolean
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Invoice not found
 */
router.get("/invoices/:invoiceId", requirePermission(Permission.BILLING_READ, billingDenialAudit), invoiceDetailController);
/**
 * @openapi
 * /billing/invoices/{invoiceId}/links:
 *   get:
 *     summary: Get invoice links
 *     description: Returns secure hosted links for a single invoice, including
 *       the hosted invoice page, PDF, and receipt when available. Links are
 *       fetched from the payment provider on demand.
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Invoice id (24 hex characters)
 *     responses:
 *       200:
 *         description: Secure invoice links
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
 *                     hostedInvoiceUrl:
 *                       type: string
 *                     invoicePdfUrl:
 *                       type: string
 *                     receiptUrl:
 *                       type: string
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Invoice not found or links unavailable
 *       503:
 *         description: Billing provider is temporarily unavailable
 */
router.get("/invoices/:invoiceId/links", requirePermission(Permission.BILLING_READ, billingDenialAudit), invoiceLinksController);
export default router;
