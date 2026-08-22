export type InsightCategory = "cost" | "quality" | "performance" | "usage_pattern" | "anomaly";
export type InsightConfidence = "high" | "medium" | "low";

/** Average request latency above this value is operationally degraded. */
export const INSIGHT_LATENCY_WARNING_THRESHOLD_MS = 5_000;

export interface InsightProposal {
  id: string;
  tenantId: string;
  statement: string;
  evidenceMetricIds: string[];
  confidence: InsightConfidence;
  category: InsightCategory;
  recommendedAction: string;
  reasoning: string;
  generatedAt: string;
}

export interface InsightAgentMetricsInput {
  tenantId: string;
  startDate: string;
  endDate: string;
  overview: {
    totalQueries: number;
    totalTokens: number;
    totalCostUsd: number;
    avgLatencyMs: number | null;
    qualityScore: number;
    reconciliationDriftCount: number;
  };
  qualityMetrics: {
    noEvidenceRate: number;
    refusalRate: number;
    citationCoverage: number | null;
    citationPrecision: number | null;
    feedbackPositiveRate: number;
    retrievalRecall: number;
    processingSuccessRate: number;
  };
  topProviders: Array<{
    provider: string;
    model: string;
    costUsd: number;
    totalTokens: number;
    percentageOfTotal: number;
  }>;
}

export interface InsightAgentPort {
  generateInsights(input: InsightAgentMetricsInput): Promise<InsightProposal[]>;
}
