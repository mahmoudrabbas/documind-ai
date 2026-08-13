import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { QualityPanel } from "./QualityPanel";
import type { QualityMetricsData } from "@/services/analytics.service";

const localeState = vi.hoisted(() => ({
  locale: "en" as "en" | "ar",
  t: (key: string, params?: Record<string, string>) =>
    params ? `${key}:${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(",")}` : key,
}));
vi.mock("@/providers/i18n-provider", () => ({ useI18n: () => ({ locale: localeState.locale, dir: localeState.locale === "ar" ? "rtl" : "ltr", t: localeState.t, tPlural: (key: string) => key, setLocale: vi.fn() }), useIntlLocale: () => (localeState.locale === "ar" ? "ar-EG-u-nu-latn" : "en-US") }));

function baseMetrics(overrides: Partial<QualityMetricsData> = {}): QualityMetricsData {
  return {
    noEvidenceRate: 0.1,
    refusalRate: 0.02,
    citationCoverage: 0.85,
    citationPrecision: 0.9,
    feedbackPositiveRate: 0.7,
    retrievalRecall: 0.8,
    processingSuccessRate: 0.95,
    judgeScores: { faithfulness: 0.9, relevancy: 0.8, coherence: 0.7, overall: 0.83 },
    judgeEvaluatedCount: 2,
    judgeDegradedCount: 1,
    judgeFailedCount: 1,
    totalQueries: 50,
    totalFeedback: 10,
    totalProcessingRuns: 5,
    ...overrides,
  };
}

function render(metrics: QualityMetricsData) {
  return renderToStaticMarkup(<QualityPanel metrics={metrics} />);
}

describe("QualityPanel", () => {
  it("renders the judge section heading and score tiles when evaluations exist", () => {
    const html = render(baseMetrics());
    expect(html).toContain("qualityPanel.judgeTitle");
    expect(html).toContain("qualityPanel.faithfulness");
    expect(html).toContain("qualityPanel.relevancy");
    expect(html).toContain("qualityPanel.coherence");
    expect(html).toContain("qualityPanel.overall");
  });

  it("renders judge scores as percentages", () => {
    const html = render(baseMetrics());
    expect(html).toContain("90%");
    expect(html).toContain("80%");
    expect(html).toContain("70%");
    expect(html).toContain("83%");
  });

  it("renders the evaluated/degraded/failed counts", () => {
    const html = render(baseMetrics());
    expect(html).toContain("qualityPanel.judgeCounts");
    expect(html).toContain("qualityPanel.judgeTitle");
  });

  it("shows the no-completed state when only degraded/failed evaluations exist", () => {
    const html = render(baseMetrics({ judgeEvaluatedCount: 0, judgeDegradedCount: 3, judgeFailedCount: 1 }));
    expect(html).toContain("qualityPanel.judgeNoCompleted");
    expect(html).toContain("qualityPanel.judgeNoCompletedBody");
    expect(html).not.toContain("qualityPanel.faithfulness");
  });

  it("shows the pending state when no judge evaluations exist yet", () => {
    const html = render(baseMetrics({ judgeEvaluatedCount: 0, judgeDegradedCount: 0, judgeFailedCount: 0 }));
    expect(html).toContain("qualityPanel.judgePending");
    expect(html).toContain("qualityPanel.judgePendingBody");
    expect(html).not.toContain("qualityPanel.faithfulness");
  });

  it("falls back to zero scores when judgeScores is missing (old API)", () => {
    const metrics = baseMetrics();
    delete (metrics as Partial<QualityMetricsData>).judgeScores;
    const html = render(metrics);
    expect(html).toContain("qualityPanel.judgeTitle");
    expect(html).toContain("qualityPanel.faithfulness");
  });

  it("shows the empty state when there is no data of any kind", () => {
    const html = render(
      baseMetrics({
        totalQueries: 0,
        totalFeedback: 0,
        totalProcessingRuns: 0,
        judgeEvaluatedCount: 0,
      }),
    );
    expect(html).toContain("qualityPanel.emptyTitle");
    expect(html).not.toContain("qualityPanel.judgeTitle");
  });

  it("keeps a zero overall score renderable without division errors", () => {
    const html = render(baseMetrics({ judgeScores: { faithfulness: 0, relevancy: 0, coherence: 0, overall: 0 } }));
    expect(html).toContain("0%");
  });

  it("localizes every visible string through t() instead of hardcoded English", () => {
    const html = render(baseMetrics());
    expect(html).toContain("qualityPanel.title");
    expect(html).toContain("qualityPanel.citationCoverage");
    expect(html).toContain("qualityPanel.citationCoverageDesc");
    expect(html).toContain("qualityPanel.citationPrecision");
    expect(html).toContain("qualityPanel.feedbackPositive");
    expect(html).toContain("qualityPanel.processingSuccess");
    expect(html).toContain("qualityPanel.noEvidence");
    expect(html).toContain("qualityPanel.refusal");
    expect(html).toContain("qualityPanel.sample.queries");
    expect(html).toContain("qualityPanel.basedOn");
    expect(html).not.toContain("Citation Coverage");
    expect(html).not.toContain("LLM-as-a-Judge Scores");
    expect(html).not.toContain("No quality data yet");
  });
});
