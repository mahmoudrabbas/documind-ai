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
