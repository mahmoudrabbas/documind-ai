import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import { AnalyticsService } from "./analytics.service.js";
import { InsightAgentService } from "./insight/insight-agent.service.js";
import type { AnalyticsQueryFilters } from "./analytics.types.js";

const analyticsService = new AnalyticsService();
const insightAgent = new InsightAgentService();

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;

const endpoint =
  (handler: Handler) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await handler(req, res);
      if (!res.headersSent) res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

function resolveTenantId(req: Request): string | null {
  const isSuperAdmin = req.auth?.role === "SUPER_ADMIN";
  if (isSuperAdmin) {
    const queryTenantId = (req.query.tenantId || req.body?.tenantId) as string | undefined;
    if (queryTenantId) {
      if (!mongoose.Types.ObjectId.isValid(queryTenantId)) {
        throw new AppError(400, "BAD_REQUEST", `Invalid tenantId format: ${queryTenantId}`);
      }
      return queryTenantId;
    }
    return null; // All tenants platform view for SUPER_ADMIN
  }

  if (!req.tenantId || !mongoose.Types.ObjectId.isValid(req.tenantId)) {
    throw new AppError(401, "UNAUTHORIZED", "Valid tenant context required");
  }
  return req.tenantId;
}

export const getOverviewController = endpoint(async (req: Request) => {
  const tenantId = resolveTenantId(req);
  return analyticsService.getOverview(tenantId, req.query as unknown as AnalyticsQueryFilters);
});

export const getTimeSeriesController = endpoint(async (req: Request) => {
  const tenantId = resolveTenantId(req);
  return analyticsService.getTimeSeries(tenantId, req.query as unknown as AnalyticsQueryFilters);
});

export const getCostBreakdownController = endpoint(async (req: Request) => {
  const tenantId = resolveTenantId(req);
  return analyticsService.getCostBreakdown(tenantId, req.query as unknown as AnalyticsQueryFilters);
});

export const getTopConsumersController = endpoint(async (req: Request) => {
  const tenantId = resolveTenantId(req);
  return analyticsService.getTopConsumers(tenantId, req.query as unknown as AnalyticsQueryFilters);
});

export const getQualityMetricsController = endpoint(async (req: Request) => {
  const tenantId = resolveTenantId(req);
  return analyticsService.getQualityMetrics(tenantId, req.query as unknown as AnalyticsQueryFilters);
});

export const getEventsPaginatedController = endpoint(async (req: Request) => {
  const tenantId = resolveTenantId(req);
  return analyticsService.getEventsPaginated(tenantId, req.query as unknown as AnalyticsQueryFilters);
});

export const getInsightsController = endpoint(async (req: Request) => {
  // null means platform-wide view (SUPER_ADMIN with no tenantId filter)
  const tenantId = resolveTenantId(req);
  const startDate = (req.body?.startDate as string) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const endDate = (req.body?.endDate as string) || new Date().toISOString();

  const queryFilters = { startDate, endDate };
  const [overview, quality, cost] = await Promise.all([
    analyticsService.getOverview(tenantId, queryFilters),
    analyticsService.getQualityMetrics(tenantId, queryFilters),
    analyticsService.getCostBreakdown(tenantId, queryFilters),
  ]);

  return insightAgent.generateInsights({
    tenantId: tenantId ?? "platform",
    startDate,
    endDate,
    overview: {
      totalQueries: overview.totalQueries,
      totalTokens: overview.totalTokens,
      totalCostUsd: overview.totalCostUsd,
      avgLatencyMs: overview.avgLatencyMs,
      qualityScore: overview.qualityScore,
      reconciliationDriftCount: overview.reconciliationDriftCount,
    },
    qualityMetrics: {
      noEvidenceRate: quality.noEvidenceRate,
      refusalRate: quality.refusalRate,
      citationCoverage: quality.citationCoverage,
      citationPrecision: quality.citationPrecision,
      feedbackPositiveRate: quality.feedbackPositiveRate,
      retrievalRecall: quality.retrievalRecall,
      processingSuccessRate: quality.processingSuccessRate,
    },
    topProviders: cost.map((c) => ({
      provider: c.provider,
      model: c.model,
      costUsd: c.costUsd,
      totalTokens: c.totalTokens,
      percentageOfTotal: c.percentageOfTotal,
    })),
  });
});

export const exportAnalyticsController = endpoint(async (req: Request) => {
  const tenantId = resolveTenantId(req);
  if (!req.auth?.userId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required for data export");
  }
  const type = req.body?.type || "csv";
  const filters = req.body?.filters || {};
  return analyticsService.triggerExport(tenantId, req.auth.userId, type, filters);
});

export const getExportStatusController = endpoint(async (req: Request) => {
  const tenantId = resolveTenantId(req);
  if (!req.auth?.userId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required for export status");
  }
  const jobId = req.params.id as string;
  const job = await analyticsService.getExportStatus(jobId, tenantId);
  if (!job) {
    throw new AppError(404, "NOT_FOUND", "Export job not found");
  }
  return job;
});
