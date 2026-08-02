import { AnalyticsRepository } from "./analytics.repository.js";
import { AnalyticsExportService } from "./analytics.export.service.js";
import { QualityService } from "./quality.service.js";
import { AggregationService } from "./aggregation.service.js";
import type {
  AnalyticsQueryFilters,
  AnalyticsOverviewMetrics,
  TimeSeriesPoint,
  CostBreakdownItem,
  TopConsumerItem,
  QualityOverviewMetrics,
} from "./analytics.types.js";

export class AnalyticsService {
  constructor(
    private readonly repository: AnalyticsRepository = new AnalyticsRepository(),
    private readonly exportService: AnalyticsExportService = new AnalyticsExportService(repository),
    private readonly qualityService: QualityService = new QualityService(),
    private readonly aggregationService: AggregationService = new AggregationService()
  ) {}

  private parseDateRange(query: AnalyticsQueryFilters): { start: Date; end: Date } {
    let end: Date;
    if (query.endDate) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(query.endDate)) {
        end = new Date(`${query.endDate}T23:59:59.999Z`);
      } else {
        end = new Date(query.endDate);
      }
    } else {
      end = new Date();
    }

    let start: Date;
    if (query.startDate) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(query.startDate)) {
        start = new Date(`${query.startDate}T00:00:00.000Z`);
      } else {
        start = new Date(query.startDate);
      }
    } else {
      start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    return { start, end };
  }

  async getOverview(tenantId: string | null, query: AnalyticsQueryFilters): Promise<AnalyticsOverviewMetrics> {
    const { start, end } = this.parseDateRange(query);

    const stats = await this.repository.getOverviewStats(tenantId, start, end, query);
    const quality = await this.getQualityMetrics(tenantId, query);

    // Compute period-over-period comparison (prior 30 days)
    const periodMs = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - periodMs);
    const prevStats = await this.repository.getOverviewStats(tenantId, prevStart, start, query);

    const calcTrend = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Number((((curr - prev) / prev) * 100).toFixed(1));
    };

    const qualityScore = stats.totalQueries > 0
      ? Number(
          (
            (quality.citationCoverage * 0.3 +
              quality.feedbackPositiveRate * 0.3 +
              quality.processingSuccessRate * 0.2 +
              (1 - quality.noEvidenceRate) * 0.2) *
            100
          ).toFixed(1)
        )
      : 0;

    return {
      totalQueries: stats.totalQueries,
      totalTokens: stats.totalTokens,
      totalCostUsd: stats.totalCostUsd,
      costType: "calculated",
      dataFreshness: new Date().toISOString(),
      avgLatencyMs: stats.avgLatencyMs,
      qualityScore,
      activeUsersCount: stats.activeUsersCount,
      totalDocumentsProcessed: stats.totalDocumentsProcessed,
      reconciliationDriftCount: stats.reconciliationDriftCount,
      trends: {
        queriesChangePct: calcTrend(stats.totalQueries, prevStats.totalQueries),
        costChangePct: calcTrend(stats.totalCostUsd, prevStats.totalCostUsd),
        tokensChangePct: calcTrend(stats.totalTokens, prevStats.totalTokens),
        latencyChangePct: prevStats.avgLatencyMs > 0 ? calcTrend(stats.avgLatencyMs, prevStats.avgLatencyMs) : 0,
      },
    };
  }

  async getTimeSeries(tenantId: string | null, query: AnalyticsQueryFilters): Promise<TimeSeriesPoint[]> {
    const { start, end } = this.parseDateRange(query);
    return this.repository.getTimeSeries(tenantId, start, end, query);
  }

  async getCostBreakdown(tenantId: string | null, query: AnalyticsQueryFilters): Promise<CostBreakdownItem[]> {
    const { start, end } = this.parseDateRange(query);
    return this.repository.getCostBreakdown(tenantId, start, end, query);
  }

  async getTopConsumers(tenantId: string | null, query: AnalyticsQueryFilters): Promise<TopConsumerItem[]> {
    const { start, end } = this.parseDateRange(query);
    return this.repository.getTopConsumers(tenantId, start, end, query.limit || 10, query);
  }

  async getQualityMetrics(tenantId: string | null, query: AnalyticsQueryFilters): Promise<QualityOverviewMetrics> {
    const { start, end } = this.parseDateRange(query);
    const computed = await this.qualityService.computeQualityMetrics(tenantId, start, end, "daily", query);
    return {
      noEvidenceRate: computed.noEvidenceRate,
      refusalRate: computed.refusalRate,
      citationCoverage: computed.citationCoverage,
      citationPrecision: computed.citationPrecision,
      feedbackPositiveRate: computed.feedbackPositiveRate,
      retrievalRecall: computed.retrievalRecall,
      processingSuccessRate: computed.processingSuccessRate,
      totalQueries: computed.totalQueries,
      totalFeedback: computed.totalFeedback,
      totalProcessingRuns: computed.totalProcessingRuns,
    };
  }

  async getEventsPaginated(tenantId: string | null, query: AnalyticsQueryFilters) {
    return this.repository.getEventsPaginated({ ...query, tenantId: tenantId ?? undefined });
  }

  async triggerExport(tenantId: string | null, actorId: string, type: "csv" | "xlsx", filters?: AnalyticsQueryFilters) {
    return this.exportService.createExportJob(tenantId, actorId, type, filters);
  }

  async getExportStatus(jobId: string, tenantId: string | null) {
    return this.exportService.getJobStatus(jobId, tenantId);
  }
}
