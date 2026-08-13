import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { requirePlatformTenant } from "../../common/middlewares/platformTenant.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  enqueueJobController,
  getJobMetricsController,
  getJobStatusController,
  listNotificationDlqsController,
  replayJobController,
} from "./jobs.controller.js";
import { createCapabilityGuard } from "../entitlement/middlewares/entitlement.middleware.js";
import { getEntitlementService } from "../entitlement/entitlement.service.js";

const router = Router();

// ── Entitlement guards ─────────────────────────────────────────────────────

const retentionGuard = createCapabilityGuard(getEntitlementService(), {
  capability: "retentionDays",
  value: (req) => req.body?.retentionDays ?? 90,
  failMode: "fail-open",
});

/**
 * @openapi
 * /enqueue:
 *   post:
 *     summary: Enqueue a customer job
 *     description: Enqueues a typed background job against the shared job
 *       queue. The tenant and actor are derived from the authenticated
 *       session and never accepted from the request body, so callers cannot
 *       spoof another tenant. Only the document.ocr job type is currently
 *       accepted.
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [jobType, idempotencyKey, payload]
 *             properties:
 *               jobType:
 *                 type: string
 *                 example: document.ocr
 *               idempotencyKey:
 *                 type: string
 *               traceId:
 *                 type: string
 *               payload:
 *                 type: object
 *               priority:
 *                 type: integer
 *               scheduledFor:
 *                 type: string
 *                 format: date-time
 *               displayName:
 *                 type: string
 *     responses:
 *       202:
 *         description: Job enqueued successfully
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
 *                     ok:
 *                       type: boolean
 *                     jobId:
 *                       type: string
 *                     idempotencyKey:
 *                       type: string
 *                     deduplicated:
 *                       type: boolean
 *       400:
 *         description: Unsupported job type or validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       422:
 *         description: Invalid job envelope
 */
/**
 * Authenticated enqueue. Tenant/actor derived from auth context (never body).
 * Any authenticated role may enqueue against the JobDispatcher port; product
 * modules build their own typed jobs here.
 */
router.post(
  "/enqueue",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_OCR_PROCESS),
  retentionGuard,
  enqueueJobController,
);

/**
 * @openapi
 * /platform/jobs/metrics:
 *   get:
 *     summary: Platform job queue metrics
 *     description: Returns aggregate queue depth metrics for the shared job
 *       queue, including waiting, active, delayed, completed, and failed job
 *       counts. Restricted to platform super admins.
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Queue metrics
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
 *                     queue:
 *                       type: string
 *                     waiting:
 *                       type: integer
 *                     active:
 *                       type: integer
 *                     delayed:
 *                       type: integer
 *                     completed:
 *                       type: integer
 *                     failed:
 *                       type: integer
 *                     retrying:
 *                       type: integer
 *                     avgProcessingMs:
 *                       type: number
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
/**
 * Super Admin-only queue diagnostics. Inspection, metrics, and replay are
 * explicitly restricted per the security/tenancy requirements.
 */
router.get(
  "/platform/jobs/metrics",
  authenticate,
  requirePlatformTenant,
  requirePermission(Permission.COMPANY_SETTINGS_READ),
  getJobMetricsController,
);

/**
 * @openapi
 * /platform/jobs/notification-dlqs:
 *   get:
 *     summary: List notification dead-letter queues
 *     description: Returns a paginated list of failed notification delivery
 *       jobs that have been dead-lettered, newest failures first. Supports
 *       filtering by replay status. Restricted to platform super admins.
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of results per page (max 100)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, replayed]
 *         description: Filter by dead-letter status
 *     responses:
 *       200:
 *         description: Paginated dead-letter listing
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
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           tenantId:
 *                             type: string
 *                           jobId:
 *                             type: string
 *                           notificationIds:
 *                             type: array
 *                             items:
 *                               type: string
 *                           notificationCount:
 *                             type: integer
 *                           reason:
 *                             type: string
 *                             nullable: true
 *                           status:
 *                             type: string
 *                             enum: [pending, replayed]
 *                           failedAt:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                           replayedAt:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
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
 *         description: Invalid pagination or status params
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  "/platform/jobs/notification-dlqs",
  authenticate,
  requirePlatformTenant,
  requirePermission(Permission.COMPANY_SETTINGS_READ),
  listNotificationDlqsController,
);

/**
 * @openapi
 * /platform/jobs/{jobId}:
 *   get:
 *     summary: Get job status
 *     description: Inspects a single background job's status, including its
 *       current lifecycle state, attempt counts, and timing. Restricted to
 *       platform super admins.
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *         description: Job id
 *     responses:
 *       200:
 *         description: Job status details
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
 *                     jobId:
 *                       type: string
 *                     jobType:
 *                       type: string
 *                     tenantId:
 *                       type: string
 *                     actorId:
 *                       type: string
 *                     traceId:
 *                       type: string
 *                     idempotencyKey:
 *                       type: string
 *                     state:
 *                       type: string
 *                       enum: [waiting, active, delayed, completed, failed, repeat]
 *                     attemptsMade:
 *                       type: integer
 *                     maxAttempts:
 *                       type: integer
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     processedAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     finishedAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     failedReason:
 *                       type: string
 *                       nullable: true
 *                     displayName:
 *                       type: string
 *                       nullable: true
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Job not found
 */
router.get(
  "/platform/jobs/:jobId",
  authenticate,
  requirePlatformTenant,
  requirePermission(Permission.COMPANY_SETTINGS_READ),
  getJobStatusController,
);

/**
 * @openapi
 * /platform/jobs/{jobId}/replay:
 *   post:
 *     summary: Replay a dead-lettered job
 *     description: Retries a failed background job so the queue re-processes
 *       it. Only jobs in the failed state can be replayed. Restricted to
 *       platform super admins and writes an audit record on success.
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *         description: Job id
 *     responses:
 *       202:
 *         description: Job queued for replay
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
 *                     replayed:
 *                       type: string
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Job not found
 *       409:
 *         description: Job not replayable (not found or not failed)
 */
router.post(
  "/platform/jobs/:jobId/replay",
  authenticate,
  requirePlatformTenant,
  requirePermission(Permission.COMPANY_SETTINGS_UPDATE),
  replayJobController,
);

export default router;
