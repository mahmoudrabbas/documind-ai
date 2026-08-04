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

router.get(
  "/timeseries",
  requirePermission(Permission.ANALYTICS_READ),
  validateAnalyticsQuery,
  getTimeSeriesController
);

router.get(
  "/cost",
  requirePermission(Permission.ANALYTICS_READ),
  validateAnalyticsQuery,
  getCostBreakdownController
);

router.get(
  "/top-consumers",
  requirePermission(Permission.ANALYTICS_READ),
  validateAnalyticsQuery,
  getTopConsumersController
);

router.get(
  "/quality",
  requirePermission(Permission.ANALYTICS_READ),
  validateAnalyticsQuery,
  getQualityMetricsController
);

router.get(
  "/events",
  requirePermission(Permission.ANALYTICS_READ),
  validateAnalyticsQuery,
  getEventsPaginatedController
);

router.post(
  "/export",
  requirePermission(Permission.ANALYTICS_EXPORT),
  validateExportRequest,
  exportAnalyticsController
);

router.get(
  "/export/:id",
  requirePermission(Permission.ANALYTICS_EXPORT),
  getExportStatusController
);

router.post(
  "/insights",
  requirePermission(Permission.ANALYTICS_READ),
  validateInsightRequest,
  getInsightsController
);

export default router;
