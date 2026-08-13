import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  getProcessingStatusController,
  getProcessingHistoryController,
  initiateProcessingController,
  retryProcessingStageController,
  reprocessDocumentController,
  cancelProcessingController,
  getFailedProcessingDashboardController,
  getAllFailedProcessingDashboardController,
} from "./processingProgress.controller.js";

const router = Router();

/**
 * @openapi
 * /documents/{id}/processing/status:
 *   get:
 *     summary: Get processing status
 *     description: Returns the current processing status for a document,
 *       including the overall status, current stage, progress percentage and
 *       the latest processing run with its individual stage details.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document id
 *     responses:
 *       200:
 *         description: Processing status
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
 *                     documentId:
 *                       type: string
 *                     documentVersion:
 *                       type: integer
 *                     overallStatus:
 *                       type: string
 *                     currentStage:
 *                       type: string
 *                     progress:
 *                       type: number
 *                     run:
 *                       type: object
 *                     error:
 *                       type: object
 *       400:
 *         description: Missing or invalid document id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found or access denied
 *       500:
 *         description: Internal server error
 */
router.get(
  "/:id/processing/status",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_READ),
  getProcessingStatusController,
);

/**
 * @openapi
 * /documents/{id}/processing/history:
 *   get:
 *     summary: Get processing history
 *     description: Returns the paginated processing run history for a
 *       document. Each run reports its status, timings, progress, retry
 *       counts and the stages that were executed.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document id
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
 *           default: 10
 *         description: Number of runs per page
 *     responses:
 *       200:
 *         description: Paginated processing history
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
 *                     documentId:
 *                       type: string
 *                     documentVersion:
 *                       type: integer
 *                     runs:
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
 *                         totalPages:
 *                           type: integer
 *                         totalRecords:
 *                           type: integer
 *       400:
 *         description: Missing or invalid document id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found or access denied
 *       500:
 *         description: Internal server error
 */
router.get(
  "/:id/processing/history",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_READ),
  getProcessingHistoryController,
);

/**
 * @openapi
 * /documents/{id}/processing/initiate:
 *   post:
 *     summary: Initiate processing
 *     description: Starts a new processing run for a document, executing the
 *       full pipeline of stages. An optional version can be provided to
 *       process a specific document version.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               version:
 *                 type: integer
 *                 description: Document version to process (defaults to 1)
 *     responses:
 *       200:
 *         description: Processing initiated
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
 *                     runId:
 *                       type: string
 *                     status:
 *                       type: string
 *                     message:
 *                       type: string
 *       400:
 *         description: Missing or invalid document id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found or access denied
 *       500:
 *         description: Internal server error
 */
router.post(
  "/:id/processing/initiate",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_OCR_PROCESS),
  initiateProcessingController,
);

/**
 * @openapi
 * /documents/{id}/processing/retry:
 *   post:
 *     summary: Retry processing stage
 *     description: Queues a retry of a specific failed processing stage for a
 *       document. The stage name is supplied in the request body.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               stageName:
 *                 type: string
 *                 description: Name of the stage to retry
 *     responses:
 *       200:
 *         description: Processing retry queued
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
 *                 data:
 *                   type: object
 *       400:
 *         description: Missing or invalid document id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found or access denied
 *       500:
 *         description: Internal server error
 */
router.post(
  "/:id/processing/retry",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_OCR_PROCESS),
  retryProcessingStageController,
);

/**
 * @openapi
 * /documents/{id}/processing/reprocess:
 *   post:
 *     summary: Reprocess document
 *     description: Starts a full reprocessing run for a document, re-running
 *       every stage of the pipeline from the beginning.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document id
 *     responses:
 *       200:
 *         description: Document reprocessing initiated
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
 *                 data:
 *                   type: object
 *       400:
 *         description: Missing or invalid document id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found or access denied
 *       500:
 *         description: Internal server error
 */
router.post(
  "/:id/processing/reprocess",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_OCR_PROCESS),
  reprocessDocumentController,
);

/**
 * @openapi
 * /documents/{id}/processing/cancel:
 *   post:
 *     summary: Cancel processing
 *     description: Cancels an in-progress processing run for a document. An
 *       optional cancellation reason may be supplied.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Cancellation reason
 *     responses:
 *       200:
 *         description: Processing canceled
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
 *                 data:
 *                   type: object
 *       400:
 *         description: Missing or invalid document id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found or access denied
 *       500:
 *         description: Internal server error
 */
router.post(
  "/:id/processing/cancel",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_OCR_PROCESS),
  cancelProcessingController,
);

/**
 * @openapi
 * /documents/processing/failed:
 *   get:
 *     summary: Get failed processing dashboard
 *     description: Returns the failed processing dashboard for the current
 *       tenant. Requires company settings read permission.
 *     tags: [Documents]
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
 *         description: Number of records per page
 *     responses:
 *       200:
 *         description: Failed processing dashboard
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
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.get(
  "/processing/failed",
  authenticate,
  tenantScoping,
  requirePermission(Permission.COMPANY_SETTINGS_READ),
  getFailedProcessingDashboardController,
);

/**
 * @openapi
 * /documents/processing/failed/all:
 *   get:
 *     summary: Get all failed processing dashboard
 *     description: Returns the failed processing dashboard across all
 *       tenants. Requires a super admin or company admin role.
 *     tags: [Documents]
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
 *         description: Number of records per page
 *     responses:
 *       200:
 *         description: Failed processing dashboard for all tenants
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
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.get(
  "/processing/failed/all",
  authenticate,
  tenantScoping,
  requirePermission(Permission.COMPANY_SETTINGS_READ),
  getAllFailedProcessingDashboardController,
);

export default router;
