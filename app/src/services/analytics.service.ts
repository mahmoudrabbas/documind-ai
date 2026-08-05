import { apiClient } from "@/lib/api-client";

export interface AnalyticsOverviewData {
  totalQueries: number;
  totalTokens: number;
  totalCostUsd: number;
  costType: "estimated" | "calculated" | "invoiced" | "reconciled";
  dataFreshness: string;
  avgLatencyMs: number;
  qualityScore: number;
  activeUsersCount: number;
  totalDocumentsProcessed: number;
  reconciliationDriftCount: number;
  trends: {
    queriesChangePct: number;
    costChangePct: number;
    tokensChangePct: number;
    latencyChangePct: number;
  };
}

export interface TimeSeriesPoint {
  timestamp: string;
  date: string;
  queries: number;
  tokens: number;
  costUsd: number;
  avgLatencyMs: number;
  errorCount: number;
}

export interface CostBreakdownItem {
  provider: string;
  model: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costType: "estimated" | "calculated" | "invoiced" | "reconciled";
  percentageOfTotal: number;
}

export interface TopConsumerItem {
  id: string;
  name: string;
  type: "user" | "department" | "document";
  queriesCount: number;
  tokensUsed: number;
  costUsd: number;
}

export interface QualityJudgeScores {
  faithfulness: number;
  relevancy: number;
  coherence: number;
  overall: number;
}

export interface QualityMetricsData {
  noEvidenceRate: number;
  refusalRate: number;
  citationCoverage: number;
  citationPrecision: number;
  feedbackPositiveRate: number;
  retrievalRecall: number;
  processingSuccessRate: number;
  judgeScores: QualityJudgeScores;
  judgeEvaluatedCount: number;
  judgeDegradedCount: number;
  judgeFailedCount: number;
  totalQueries: number;
  totalFeedback: number;
  totalProcessingRuns: number;
}

export interface InsightProposal {
  id: string;
  tenantId: string;
  statement: string;
  evidenceMetricIds: string[];
  confidence: "high" | "medium" | "low";
  category: "cost" | "quality" | "performance" | "usage_pattern" | "anomaly";
  recommendedAction: string;
  reasoning: string;
  generatedAt: string;
}

export interface ExportJobStatus {
  _id: string;
  tenantId: string;
  status: "pending" | "running" | "completed" | "failed";
  rowCount?: number;
  filePath?: string;
  error?: string;
}

type Success<T> = { success: true; data: T };

export const getAnalyticsOverview = (params?: Record<string, string>, signal?: AbortSignal) => {
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  return apiClient<Success<AnalyticsOverviewData>>(`/analytics/overview${query}`, { signal });
};

export const getAnalyticsTimeSeries = (params?: Record<string, string>, signal?: AbortSignal) => {
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  return apiClient<Success<TimeSeriesPoint[]>>(`/analytics/timeseries${query}`, { signal });
};

export const getAnalyticsCostBreakdown = (params?: Record<string, string>, signal?: AbortSignal) => {
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  return apiClient<Success<CostBreakdownItem[]>>(`/analytics/cost${query}`, { signal });
};

export const getAnalyticsTopConsumers = (params?: Record<string, string>, signal?: AbortSignal) => {
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  return apiClient<Success<TopConsumerItem[]>>(`/analytics/top-consumers${query}`, { signal });
};

export const getAnalyticsQualityMetrics = (params?: Record<string, string>, signal?: AbortSignal) => {
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  return apiClient<Success<QualityMetricsData>>(`/analytics/quality${query}`, { signal });
};

export const getAnalyticsInsights = (body?: Record<string, unknown>, signal?: AbortSignal) => {
  return apiClient<Success<InsightProposal[]>>("/analytics/insights", {
    method: "POST",
    body: JSON.stringify(body || {}),
    signal,
  });
};

export const triggerAnalyticsExport = (type: "csv" | "xlsx" = "csv", filters?: Record<string, string>) => {
  return apiClient<Success<ExportJobStatus>>("/analytics/export", {
    method: "POST",
    body: { type, ...(filters ? { filters } : {}) } as unknown as Record<string, unknown>,
  });
};

export const getAnalyticsExportStatus = (jobId: string, signal?: AbortSignal) => {
  return apiClient<Success<ExportJobStatus>>(`/analytics/export/${encodeURIComponent(jobId)}`, { signal });
};
