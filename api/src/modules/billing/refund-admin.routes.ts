import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { requirePlatformTenant } from "../../common/middlewares/platformTenant.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import {
  platformRefundConfirmController,
  platformRefundDetailController,
  platformRefundListController,
  platformRefundRejectController,
  platformRefundRetryController,
} from "./refund-admin.controller.js";

const router = Router();
router.use(authenticate, requirePlatformTenant);

/**
 * @openapi
 * /super-admin/refunds:
 *   get:
 *     summary: List all refund requests (platform)
 *     description: Lists all refund requests across tenants for platform super
 *       admins. Supports filtering by status and tenant id, and pagination.
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
 *           enum: [REQUESTED, PROVIDER_PENDING, SUCCEEDED, FAILED, REJECTED, RETRY_PENDING]
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *         description: Filter refunds by tenant id (24 hex characters)
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
 *                           tenant:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               name:
 *                                 type: string
 *                               slug:
 *                                 type: string
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
 *                           requestedBy:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               name:
 *                                 type: string
 *                               email:
 *                                 type: string
 *                           confirmedBy:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               name:
 *                                 type: string
 *                               email:
 *                                 type: string
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
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions or not a platform tenant
 */
router.get("/refunds", requirePermission(Permission.BILLING_READ), platformRefundListController);
/**
 * @openapi
 * /super-admin/refunds/{refundId}:
 *   get:
 *     summary: Get a refund request (platform)
 *     description: Returns a single refund request by id for platform super
 *       admins, including tenant, invoice, and subscription context.
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
 *                     tenant:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         slug:
 *                           type: string
 *                     invoiceId:
 *                       type: string
 *                     invoiceNumber:
 *                       type: string
 *                     subscriptionId:
 *                       type: string
 *                     subscription:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         status:
 *                           type: string
 *                         packageName:
 *                           type: string
 *                         packageCode:
 *                           type: string
 *                         packageVersion:
 *                           type: number
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
 *         description: Insufficient permissions or not a platform tenant
 *       404:
 *         description: Refund request not found
 */
router.get("/refunds/:refundId", requirePermission(Permission.BILLING_READ), platformRefundDetailController);
/**
 * @openapi
 * /super-admin/refunds/{refundId}/confirm:
 *   post:
 *     summary: Confirm a refund request (platform)
 *     description: Confirms and executes a refund request with the payment
 *       provider. Requires the BILLING_REFUND_CONFIRM permission. Returns the
 *       refund with its provider-facing status.
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
 *         description: Refund confirmed and submitted to the provider
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
 *                         amountMinor:
 *                           type: number
 *                         currency:
 *                           type: string
 *                         reason:
 *                           type: string
 *                         status:
 *                           type: string
 *                         providerPending:
 *                           type: boolean
 *                         failureCode:
 *                           type: string
 *                         operationId:
 *                           type: string
 *                         confirmedBy:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: string
 *                             name:
 *                               type: string
 *                             email:
 *                               type: string
 *                         confirmedAt:
 *                           type: string
 *                           format: date-time
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
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions or not a platform tenant
 *       404:
 *         description: Refund request not found
 *       409:
 *         description: Refund can no longer be confirmed or eligibility changed
 */
router.post("/refunds/:refundId/confirm", requirePermission(Permission.BILLING_REFUND_CONFIRM), platformRefundConfirmController);
/**
 * @openapi
 * /super-admin/refunds/{refundId}/reject:
 *   post:
 *     summary: Reject a refund request (platform)
 *     description: Rejects a pending refund request and releases its reserved
 *       amount. The reason is recorded for audit. Requires the
 *       BILLING_REFUND_CONFIRM permission.
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
 *                 example: Duplicate of a successful earlier refund
 *     responses:
 *       200:
 *         description: Refund request rejected
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
 *                     status:
 *                       type: string
 *                     rejectedAt:
 *                       type: string
 *                       format: date-time
 *                     rejectionReason:
 *                       type: string
 *                     amountMinor:
 *                       type: number
 *                     currency:
 *                       type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions or not a platform tenant
 *       404:
 *         description: Refund request not found
 *       409:
 *         description: Refund can no longer be rejected
 */
router.post("/refunds/:refundId/reject", requirePermission(Permission.BILLING_REFUND_CONFIRM), platformRefundRejectController);
/**
 * @openapi
 * /super-admin/refunds/{refundId}/retry:
 *   post:
 *     summary: Retry a refund request (platform)
 *     description: Retries a refund request whose provider operation previously
 *       failed or was left pending. Requires the BILLING_REFUND_CONFIRM
 *       permission. Returns the updated refund.
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
 *         description: Refund request retried
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
 *                     status:
 *                       type: string
 *                     providerPending:
 *                       type: boolean
 *                     failureCode:
 *                       type: string
 *                     amountMinor:
 *                       type: number
 *                     currency:
 *                       type: string
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions or not a platform tenant
 *       404:
 *         description: Refund request not found
 *       409:
 *         description: Refund is not retryable
 */
router.post("/refunds/:refundId/retry", requirePermission(Permission.BILLING_REFUND_CONFIRM), platformRefundRetryController);

export default router;
