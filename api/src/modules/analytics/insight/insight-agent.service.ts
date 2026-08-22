import type { ModelAdapter } from "../../agents/agents.types.js";
import type {
  InsightAgentPort,
  InsightAgentMetricsInput,
  InsightProposal,
} from "./insight-agent.types.js";
import { INSIGHT_LATENCY_WARNING_THRESHOLD_MS } from "./insight-agent.types.js";

export class InsightAgentService implements InsightAgentPort {
  constructor(private readonly modelAdapter?: ModelAdapter) {}

  async generateInsights(input: InsightAgentMetricsInput): Promise<InsightProposal[]> {
    const deterministicAnomalies = buildDeterministicInsights(input);

    if (this.modelAdapter) {
      try {
        const prompt = `You are the DocuMind AI Operational & Analytics Insight Agent. Analyze these sanitized, aggregated metrics for tenant "${input.tenantId}" over period ${input.startDate} to ${input.endDate} and return JSON array of insight proposals.

Metrics:
${JSON.stringify(input, null, 2)}

Return ONLY a JSON array of objects with this shape:
[
  {
    "id": "ins_1",
    "tenantId": "${input.tenantId}",
    "statement": "high level finding",
    "evidenceMetricIds": ["totalCostUsd", "qualityScore"],
    "confidence": "high" | "medium" | "low",
    "category": "cost" | "quality" | "performance" | "usage_pattern" | "anomaly",
    "recommendedAction": "actionable advice",
    "reasoning": "technical explanation",
    "generatedAt": "${new Date().toISOString()}"
  }
]`;

        const response = await this.modelAdapter.complete({
          messages: [
            {
              role: "system",
              content: "You are an expert AI Operations & Analytics agent that produces structured JSON insights from aggregate system metrics.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.1,
          maxTokens: 1000,
        });

        const text = response.choices[0]?.message?.content ?? "";
        let cleanText = text.trim();
        if (cleanText.startsWith("```")) {
          cleanText = cleanText.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
        }

        const parsed = JSON.parse(cleanText);
        if (Array.isArray(parsed) && deterministicAnomalies.length === 0) {
          return parsed as InsightProposal[];
        }
      } catch {
        // Fallback to deterministic heuristic generator if LLM fails or unparseable
      }
    }

    return deterministicAnomalies;
  }
}

/**
 * Trusted operational checks run before and independently of any model output.
 * A model must not be able to turn a measured outage/quality regression into a
 * healthy response. Missing latency is intentionally not treated as slow.
 */
function buildDeterministicInsights(input: InsightAgentMetricsInput): InsightProposal[] {
    const proposals: InsightProposal[] = [];
    const now = new Date().toISOString();

    if (input.overview.reconciliationDriftCount > 0) {
      proposals.push({
        id: `ins_drift_${Date.now()}`,
        tenantId: input.tenantId,
        statement: `Detected ${input.overview.reconciliationDriftCount} entitlement quota discrepancies across system counters.`,
        evidenceMetricIds: ["reconciliationDriftCount"],
        confidence: "high",
        category: "anomaly",
        recommendedAction: "Run entitlement reconciliation sweep via Super Admin dashboard.",
        reasoning: "Authoritative recount disagrees with current counter state.",
        generatedAt: now,
      });
    }

    if (
      typeof input.overview.avgLatencyMs === "number" &&
      Number.isFinite(input.overview.avgLatencyMs) &&
      input.overview.avgLatencyMs > INSIGHT_LATENCY_WARNING_THRESHOLD_MS
    ) {
      proposals.push({
        id: `ins_latency_${Date.now()}`,
        tenantId: input.tenantId,
        statement: `Average request latency reached ${Math.round(input.overview.avgLatencyMs).toLocaleString()} ms, above the ${INSIGHT_LATENCY_WARNING_THRESHOLD_MS.toLocaleString()} ms operational baseline.`,
        evidenceMetricIds: ["avgLatencyMs"],
        confidence: "high",
        category: "performance",
        recommendedAction: "Inspect provider latency, queue depth, and downstream dependencies before increasing traffic.",
        reasoning: "The measured average latency exceeded the centralized operational warning threshold.",
        generatedAt: now,
      });
    }

    const qualityAnomaly =
      input.overview.qualityScore < 70 ||
      input.qualityMetrics.noEvidenceRate > 0.15 ||
      (input.qualityMetrics.citationCoverage !== null && input.qualityMetrics.citationCoverage < 0.8) ||
      (input.qualityMetrics.citationPrecision !== null && input.qualityMetrics.citationPrecision < 0.8);
    if (qualityAnomaly) {
      proposals.push({
        id: `ins_evid_${Date.now()}`,
        tenantId: input.tenantId,
        statement: `AI quality telemetry is below the configured baseline (quality index ${(input.overview.qualityScore).toFixed(1)}%).`,
        evidenceMetricIds: ["qualityScore", "citationCoverage", "citationPrecision", "noEvidenceRate"],
        confidence: "high",
        category: "quality",
        recommendedAction: "Review knowledge gaps and index additional domain documentation.",
        reasoning: "The deterministic health check treats low quality or citation telemetry as an operational issue; unavailable evaluation metrics are not treated as failures.",
        generatedAt: now,
      });
    }

    if (input.overview.totalCostUsd > 10.0) {
      proposals.push({
        id: `ins_cost_${Date.now()}`,
        tenantId: input.tenantId,
        statement: `LLM usage cost reached $${input.overview.totalCostUsd.toFixed(2)} for the selected period.`,
        evidenceMetricIds: ["totalCostUsd", "totalTokens"],
        confidence: "medium",
        category: "cost",
        recommendedAction: "Consider enabling Groq or Bedrock model caching for repetitive prompt contexts.",
        reasoning: "High total token throughput contributing to increased operational expenditure.",
        generatedAt: now,
      });
    }

    if (proposals.length === 0) {
      proposals.push({
        id: `ins_ok_${Date.now()}`,
        tenantId: input.tenantId,
        statement: "System operation and AI quality parameters are performing within normal baseline ranges.",
        evidenceMetricIds: ["qualityScore", "avgLatencyMs"],
        confidence: "high",
        category: "performance",
        recommendedAction: "Maintain current system configurations.",
        reasoning: "All metrics meet SLA thresholds.",
        generatedAt: now,
      });
    }

    return proposals;
}
