import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { InsightAgentService } from "./insight-agent.service.js";
import { FakeInsightAgentAdapter } from "./fake-insight-agent.adapter.js";
import type { InsightAgentPort, InsightAgentMetricsInput } from "./insight-agent.types.js";

const sampleInput: InsightAgentMetricsInput = {
  tenantId: "tenant_123",
  startDate: "2026-08-01",
  endDate: "2026-08-01",
  overview: {
    totalQueries: 100,
    totalTokens: 50000,
    totalCostUsd: 0.15,
    avgLatencyMs: 450,
    qualityScore: 92.5,
    reconciliationDriftCount: 1,
  },
  qualityMetrics: {
    noEvidenceRate: 0.05,
    refusalRate: 0.01,
    citationCoverage: 0.95,
    citationPrecision: 0.92,
    feedbackPositiveRate: 0.98,
    retrievalRecall: 0.90,
    processingSuccessRate: 0.99,
  },
  topProviders: [
    {
      provider: "groq",
      model: "llama-3.3-70b-versatile",
      costUsd: 0.15,
      totalTokens: 50000,
      percentageOfTotal: 100,
    },
  ],
};

function runContractTests(name: string, getAgent: () => InsightAgentPort) {
  describe(`InsightAgentPort Contract: ${name}`, () => {
    it("returns structured proposals array", async () => {
      const agent = getAgent();
      const proposals = await agent.generateInsights(sampleInput);

      assert(Array.isArray(proposals));
      assert(proposals.length > 0);

      const first = proposals[0];
      assert.equal(typeof first.id, "string");
      assert.equal(typeof first.statement, "string");
      assert.equal(typeof first.category, "string");
      assert.equal(typeof first.recommendedAction, "string");
      assert.equal(typeof first.reasoning, "string");
      assert.equal(typeof first.generatedAt, "string");
    });
  });
}

runContractTests("FakeInsightAgentAdapter", () => new FakeInsightAgentAdapter());
runContractTests("InsightAgentService (Heuristic)", () => new InsightAgentService());
