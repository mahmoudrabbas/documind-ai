import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  getOverviewController,
  getTimeSeriesController,
  getCostBreakdownController,
  getTopConsumersController,
  getQualityMetricsController,
  getEventsPaginatedController,
  exportAnalyticsController,
  getExportStatusController,
  getInsightsController,
} from "./analytics.controller.js";
import {
  validateAnalyticsQuery,
  validateExportRequest,
  validateInsightRequest,
} from "./analytics.validator.js";
const router = Router();

router.use(authenticate);
router.use(tenantScoping);

/**
 * @openapi
 * /analytics/overview:
 *   get:
 *     summary: Dashboard stats
 *     description: Returns aggregate analytics for the tenant's dashboard,
 *       including query volumes, document counts, cost, and quality metrics.
 *       Super admins may pass a tenantId query parameter to view a specific
 *       tenant, or omit it for a platform-wide view.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Inclusive start of the analysis window
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Inclusive end of the analysis window
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *         description: Super admin only - target tenant id
 *     responses:
 *       200:
 *         description: Dashboard overview metrics
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
 *                     queries:
 *                       type: object
 *                     documents:
 *                       type: object
 *                     users:
 *                       type: object
 *                     cost:
 *                       type: object
 *                     quality:
 *                       type: object
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  "/overview",
  requirePermission(Permission.ANALYTICS_READ),
  validateAnalyticsQuery,
  getOverviewController
);

/**
 * @openapi
 * /analytics/timeseries:
 *   get:
 *     summary: Time series metrics
 *     description: Returns time-bucketed query volumes, cost and latency for
 *       the tenant's analytics window. Super admins may pass a tenantId query
 *       parameter to target a specific tenant.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Inclusive start of the analysis window
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Inclusive end of the analysis window
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *         description: Super admin only - target tenant id
 *       - in: query
 *         name: provider
 *         schema:
 *           type: string
 *         description: Filter by LLM provider
 *       - in: query
 *         name: model
 *         schema:
 *           type: string
 *         description: Filter by model name
 *       - in: query
 *         name: departmentId
 *         schema:
 *           type: string
 *       - in: query
 *         name: actorId
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Time series metrics
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
 */
router.get(
  "/timeseries",
  requirePermission(Permission.ANALYTICS_READ),
  validateAnalyticsQuery,
  getTimeSeriesController
);

/**
 * @openapi
 * /analytics/cost:
 *   get:
 *     summary: Cost breakdown
 *     description: Returns LLM cost and token usage broken down by provider and
 *       model for the tenant's analytics window. Super admins may pass a
 *       tenantId query parameter to target a specific tenant.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Inclusive start of the analysis window
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Inclusive end of the analysis window
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *         description: Super admin only - target tenant id
 *     responses:
 *       200:
 *         description: Cost breakdown by provider and model
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
 *                       provider:
 *                         type: string
 *                       model:
 *                         type: string
 *                       costUsd:
 *                         type: number
 *                       totalTokens:
 *                         type: integer
 *                       percentageOfTotal:
 *                         type: number
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  "/cost",
  requirePermission(Permission.ANALYTICS_READ),
  validateAnalyticsQuery,
  getCostBreakdownController
);

/**
 * @openapi
 * /analytics/top-consumers:
 *   get:
 *     summary: Top consumers
 *     description: Returns the heaviest users, departments or actors by query
 *       volume and cost within the tenant's analytics window.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Inclusive start of the analysis window
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Inclusive end of the analysis window
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *         description: Super admin only - target tenant id
 *       - in: query
 *         name: actorId
 *         schema:
 *           type: string
 *       - in: query
 *         name: departmentId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Top consumers ranking
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
 */
router.get(
  "/top-consumers",
  requirePermission(Permission.ANALYTICS_READ),
  validateAnalyticsQuery,
  getTopConsumersController
);

/**
 * @swagger
 * /analytics/quality:
 *   get:
 *     summary: Get quality metrics (incl. LLM-as-a-Judge aggregates)
 *     description: >
 *       Quality metrics for the tenant. `judgeScores` are the average LLM-as-a-Judge
 *       scores computed from `completed` evaluations only (0-1 each).
 *       `judgeEvaluatedCount`, `judgeDegradedCount` and `judgeFailedCount` report
 *       how many evaluations were completed, degraded (malformed output) and failed
 *       (provider error) respectively.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Quality metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 noEvidenceRate:
 *                   type: number
 *                 refusalRate:
 *                   type: number
 *                 citationCoverage:
 *                   type: number
 *                 citationPrecision:
 *                   type: number
 *                 feedbackPositiveRate:
 *                   type: number
 *                 retrievalRecall:
 *                   type: number
 *                 processingSuccessRate:
 *                   type: number
 *                 judgeScores:
 *                   type: object
 *                   properties:
 *                     faithfulness:
 *                       type: number
 *                     relevancy:
 *                       type: number
 *                     coherence:
 *                       type: number
 *                     overall:
 *                       type: number
 *                 judgeEvaluatedCount:
 *                   type: number
 *                 judgeDegradedCount:
 *                   type: number
 *                 judgeFailedCount:
 *                   type: number
 *                 totalQueries:
 *                   type: number
 *                 totalFeedback:
 *                   type: number
 *                 totalProcessingRuns:
 *                   type: number
 *       '401':
 *         description: Authentication required
 *       '403':
 *         description: Insufficient permissions
 */
router.get(
  "/quality",
  requirePermission(Permission.ANALYTICS_READ),
  validateAnalyticsQuery,
  getQualityMetricsController
);

/**
 * @openapi
 * /analytics/events:
 *   get:
 *     summary: Paginated analytics events
 *     description: Returns a paginated feed of raw analytics events (queries,
 *       feedback, processing runs) for the tenant. Use limit and offset for
 *       pagination.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Inclusive start of the analysis window
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Inclusive end of the analysis window
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *         description: Super admin only - target tenant id
 *       - in: query
 *         name: eventType
 *         schema:
 *           type: string
 *         description: Filter by event type
 *       - in: query
 *         name: provider
 *         schema:
 *           type: string
 *       - in: query
 *         name: model
 *         schema:
 *           type: string
 *       - in: query
 *         name: actorId
 *         schema:
 *           type: string
 *       - in: query
 *         name: departmentId
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Paginated analytics events
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
 *                     events:
 *                       type: array
 *                       items:
 *                         type: object
 *                     pagination:
 *                       type: object
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  "/events",
  requirePermission(Permission.ANALYTICS_READ),
  validateAnalyticsQuery,
  getEventsPaginatedController
);

/**
 * @openapi
 * /analytics/export:
 *   post:
 *     summary: Trigger analytics export
 *     description: Starts an asynchronous export job (CSV or XLSX) for the
 *       tenant's analytics data. The export id returned can be polled via
 *       GET /analytics/export/{id}.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [csv, xlsx]
 *                 default: csv
 *               filters:
 *                 type: object
 *                 description: Analytics query filters to scope the export
 *     responses:
 *       200:
 *         description: Export job started
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
 *       400:
 *         description: Invalid export request payload
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.post(
  "/export",
  requirePermission(Permission.ANALYTICS_EXPORT),
  validateExportRequest,
  exportAnalyticsController
);

/**
 * @openapi
 * /analytics/export/{id}:
 *   get:
 *     summary: Get export status
 *     description: Returns the status and download information of a previously
 *       triggered analytics export job.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Export job id
 *     responses:
 *       200:
 *         description: Export job status
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
 *                     downloadUrl:
 *                       type: string
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Export job not found
 */
router.get(
  "/export/:id",
  requirePermission(Permission.ANALYTICS_EXPORT),
  getExportStatusController
);

/**
 * @openapi
 * /analytics/insights:
 *   post:
 *     summary: Generate AI insights
 *     description: Uses an insight agent to analyze overview, quality and cost
 *       metrics over a window and return natural-language recommendations.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date-time
 *                 default: 30 days ago
 *               endDate:
 *                 type: string
 *                 format: date-time
 *                 default: now
 *               focusArea:
 *                 type: string
 *                 enum: [all, cost, quality, performance, usage_pattern]
 *                 default: all
 *     responses:
 *       200:
 *         description: Generated insights
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
 *                     insights:
 *                       type: array
 *                       items:
 *                         type: object
 *       400:
 *         description: Invalid insight request payload
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.post(
  "/insights",
  requirePermission(Permission.ANALYTICS_READ),
  validateInsightRequest,
  getInsightsController
);

export default router;
