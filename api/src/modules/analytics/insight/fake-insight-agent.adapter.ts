import type {
  InsightAgentPort,
  InsightAgentMetricsInput,
  InsightProposal,
} from "./insight-agent.types.js";

export class FakeInsightAgentAdapter implements InsightAgentPort {
  async generateInsights(input: InsightAgentMetricsInput): Promise<InsightProposal[]> {
    return [
      {
        id: "ins_fake_1",
        tenantId: input.tenantId,
        statement: "Fake Adapter: Citation coverage is healthy at 95%",
        evidenceMetricIds: ["citationCoverage"],
        confidence: "high",
        category: "quality",
        recommendedAction: "Maintain document chunking parameters",
        reasoning: "Synthetic test evaluation",
        generatedAt: new Date().toISOString(),
      },
    ];
  }
}
