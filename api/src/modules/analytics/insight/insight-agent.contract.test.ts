import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { InsightAgentService } from "./insight-agent.service.js";
import { FakeInsightAgentAdapter } from "./fake-insight-agent.adapter.js";
import { INSIGHT_LATENCY_WARNING_THRESHOLD_MS } from "./insight-agent.types.js";
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

describe("InsightAgentService deterministic health checks", () => {
  it("reports a quality anomaly instead of a healthy baseline", async () => {
    const input = {
      ...sampleInput,
      overview: { ...sampleInput.overview, qualityScore: 40, avgLatencyMs: 8600, reconciliationDriftCount: 0 },
      qualityMetrics: { ...sampleInput.qualityMetrics, citationCoverage: 0, citationPrecision: 0 },
    };
    const proposals = await new InsightAgentService().generateInsights(input);
    assert.ok(proposals.some((proposal) => proposal.category === "quality"));
    assert.equal(proposals.some((proposal) => /within normal baseline/i.test(proposal.statement)), false);
  });

  it("does not treat unavailable citation evaluation as a quality failure", async () => {
    const proposals = await new InsightAgentService().generateInsights({
      ...sampleInput,
      qualityMetrics: { ...sampleInput.qualityMetrics, citationCoverage: null, citationPrecision: null },
    });
    assert.equal(proposals.some((proposal) => proposal.category === "quality"), false);
  });

  it("reports severe latency in milliseconds and never returns a healthy baseline", async () => {
    const proposals = await new InsightAgentService().generateInsights({
      ...sampleInput,
      overview: { ...sampleInput.overview, avgLatencyMs: 51_000, reconciliationDriftCount: 0 },
    });
    assert.ok(proposals.some((proposal) => proposal.category === "performance"));
    assert.equal(proposals.some((proposal) => /within normal baseline|running smoothly/i.test(proposal.statement)), false);
    assert.match(proposals.find((proposal) => proposal.category === "performance")?.statement ?? "", /51,000 ms/);
  });

  it("allows healthy output for latency below the centralized threshold", async () => {
    const proposals = await new InsightAgentService().generateInsights({
      ...sampleInput,
      overview: { ...sampleInput.overview, avgLatencyMs: INSIGHT_LATENCY_WARNING_THRESHOLD_MS },
    });
    assert.equal(proposals.some((proposal) => proposal.category === "performance"), false);
  });

  it("does not raise a latency alarm when latency is unavailable", async () => {
    const proposals = await new InsightAgentService().generateInsights({
      ...sampleInput,
      overview: { ...sampleInput.overview, avgLatencyMs: null },
    });
    assert.equal(proposals.some((proposal) => proposal.category === "performance"), false);
  });

  it("lets severe latency win over strong quality telemetry", async () => {
    const proposals = await new InsightAgentService().generateInsights({
      ...sampleInput,
      overview: { ...sampleInput.overview, avgLatencyMs: 51_000, qualityScore: 99 },
      qualityMetrics: { ...sampleInput.qualityMetrics, citationCoverage: 0.99, citationPrecision: 0.99 },
    });
    assert.ok(proposals.some((proposal) => proposal.category === "performance"));
    assert.equal(proposals.some((proposal) => /within normal baseline/i.test(proposal.statement)), false);
  });

  it("does not let a model-generated healthy response override severe latency", async () => {
    const healthyModel = {
      providerKey: "test-healthy-model",
      complete: async () => ({
        id: "healthy-model-response",
        provider: "test",
        model: "healthy-model",
        choices: [{ index: 0, message: { role: "assistant" as const, content: JSON.stringify([{
          id: "model_ok",
          tenantId: sampleInput.tenantId,
          statement: "System operation is within normal baseline ranges.",
          evidenceMetricIds: ["qualityScore"],
          confidence: "high" as const,
          category: "performance" as const,
          recommendedAction: "Maintain current system configurations.",
          reasoning: "The model considers the telemetry healthy.",
          generatedAt: new Date().toISOString(),
        }]) }, finishReason: "stop" as const }],
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        estimatedCost: 0,
      }),
    };
    const proposals = await new InsightAgentService(healthyModel).generateInsights({
      ...sampleInput,
      overview: { ...sampleInput.overview, avgLatencyMs: 51_000, reconciliationDriftCount: 0 },
    });
    assert.ok(proposals.some((proposal) => proposal.category === "performance" && proposal.evidenceMetricIds.includes("avgLatencyMs")));
    assert.equal(proposals.some((proposal) => proposal.id === "model_ok"), false);
  });

  it("keeps a quality warning when latency is healthy", async () => {
    const proposals = await new InsightAgentService().generateInsights({
      ...sampleInput,
      overview: { ...sampleInput.overview, avgLatencyMs: 450, qualityScore: 40, reconciliationDriftCount: 0 },
      qualityMetrics: { ...sampleInput.qualityMetrics, citationCoverage: 0, citationPrecision: 0 },
    });
    assert.ok(proposals.some((proposal) => proposal.category === "quality"));
    assert.equal(proposals.some((proposal) => proposal.category === "performance"), false);
  });
});
