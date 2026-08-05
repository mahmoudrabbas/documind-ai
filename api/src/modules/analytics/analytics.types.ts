export interface AnalyticsQueryFilters {
  tenantId?: string;
  startDate?: string;
  endDate?: string;
  provider?: string;
  model?: string;
  departmentId?: string;
  actorId?: string;
  eventType?: string;
  limit?: number;
  offset?: number;
}

export interface AnalyticsOverviewMetrics {
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

export interface QualityOverviewMetrics {
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

export interface ExportJobRequest {
  type: "csv" | "xlsx";
  filters?: AnalyticsQueryFilters;
}

export interface ExportJobResponse {
  jobId: string;
  status: "pending" | "running" | "completed" | "failed";
  downloadUrl?: string;
  rowCount?: number;
  expiresAt: string;
}
