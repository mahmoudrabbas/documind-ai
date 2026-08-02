export type InsightCategory = "cost" | "quality" | "performance" | "usage_pattern" | "anomaly";
export type InsightConfidence = "high" | "medium" | "low";

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
    avgLatencyMs: number;
    qualityScore: number;
    reconciliationDriftCount: number;
  };
  qualityMetrics: {
    noEvidenceRate: number;
    refusalRate: number;
    citationCoverage: number;
    citationPrecision: number;
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
