"use client";

import React from "react";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import type { QualityMetricsData } from "@/services/analytics.service";

interface QualityPanelProps {
  metrics: QualityMetricsData;
}

export function QualityPanel({ metrics }: QualityPanelProps) {
  const { t } = useI18n();
  const intlLocale = useIntlLocale();

  // If sample-size fields are missing (old API), assume data exists and show rates as-is
  const sampleSizesAvailable = metrics.totalQueries !== undefined;
  const hasData =
    !sampleSizesAvailable ||
    metrics.totalQueries > 0 ||
    metrics.totalFeedback > 0 ||
    metrics.totalProcessingRuns > 0 ||
    metrics.judgeEvaluatedCount > 0;

  const items = [
    {
      labelKey: "qualityPanel.citationCoverage",
      val: metrics.citationCoverage,
      descKey: "qualityPanel.citationCoverageDesc",
      sampleSize: metrics.totalQueries,
      sampleLabelKey: "qualityPanel.sample.queries",
    },
    {
      labelKey: "qualityPanel.citationPrecision",
      val: metrics.citationPrecision,
      descKey: "qualityPanel.citationPrecisionDesc",
      sampleSize: metrics.totalQueries,
      sampleLabelKey: "qualityPanel.sample.queries",
    },
    {
      labelKey: "qualityPanel.feedbackPositive",
      val: metrics.feedbackPositiveRate,
      descKey: "qualityPanel.feedbackPositiveDesc",
      sampleSize: metrics.totalFeedback,
      sampleLabelKey: "qualityPanel.sample.ratings",
    },
    {
      labelKey: "qualityPanel.processingSuccess",
      val: metrics.processingSuccessRate,
      descKey: "qualityPanel.processingSuccessDesc",
      sampleSize: metrics.totalProcessingRuns,
      sampleLabelKey: "qualityPanel.sample.runs",
    },
    {
      labelKey: "qualityPanel.noEvidence",
      val: metrics.noEvidenceRate,
      descKey: "qualityPanel.noEvidenceDesc",
      inverse: true,
      sampleSize: metrics.totalQueries,
      sampleLabelKey: "qualityPanel.sample.queries",
    },
    {
      labelKey: "qualityPanel.refusal",
      val: metrics.refusalRate,
      descKey: "qualityPanel.refusalDesc",
      inverse: true,
      sampleSize: metrics.totalQueries,
      sampleLabelKey: "qualityPanel.sample.queries",
    },
  ];

  const judgeScores = metrics.judgeScores ?? {
    faithfulness: 0,
    relevancy: 0,
    coherence: 0,
    overall: 0,
  };
  const judgeHasCompleted = (metrics.judgeEvaluatedCount ?? 0) > 0;
  const judgeHasAnyResult =
    judgeHasCompleted ||
    (metrics.judgeDegradedCount ?? 0) > 0 ||
    (metrics.judgeFailedCount ?? 0) > 0;
  const judgeItems = [
    { labelKey: "qualityPanel.faithfulness", val: judgeScores.faithfulness, descKey: "qualityPanel.faithfulnessDesc" },
    { labelKey: "qualityPanel.relevancy", val: judgeScores.relevancy, descKey: "qualityPanel.relevancyDesc" },
    { labelKey: "qualityPanel.coherence", val: judgeScores.coherence, descKey: "qualityPanel.coherenceDesc" },
    { labelKey: "qualityPanel.overall", val: judgeScores.overall, descKey: "qualityPanel.overallDesc" },
  ];

  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm">
      <h3 className="text-title-md font-bold text-on-surface mb-4">{t("qualityPanel.title")}</h3>

      {!hasData ? (
        <div className="rounded-xl border border-outline-variant/20 bg-surface p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-on-surface-variant" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-body-md font-semibold text-on-surface">{t("qualityPanel.emptyTitle")}</p>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            {t("qualityPanel.emptyBody")}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((item, idx) => {
            const hasSample = !sampleSizesAvailable || item.sampleSize > 0;
            const pct = hasSample ? Math.round(item.val * 100) : null;
            const isGood = pct !== null && (item.inverse ? pct < 10 : pct > 80);

            return (
              <div key={idx} className="rounded-xl border border-outline-variant/30 bg-surface p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-body-sm font-semibold text-on-surface">{t(item.labelKey)}</span>
                  {pct !== null ? (
                    <span
                      className={`text-label-md font-bold font-mono ${
                        isGood ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                      }`}
                    >
                      {pct}%
                    </span>
                  ) : (
                    <span className="text-label-md font-medium text-on-surface-variant/60">—</span>
                  )}
                </div>
                <p className="mt-1 text-body-xs text-on-surface-variant">{t(item.descKey)}</p>
                {pct !== null ? (
                  <>
                    <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isGood ? "bg-emerald-500" : "bg-amber-500"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-[10px] text-on-surface-variant/50">
                      {t("qualityPanel.basedOn", {
                        count: item.sampleSize.toLocaleString(intlLocale),
                        label: t(item.sampleLabelKey),
                      })}
                    </p>
                  </>
                ) : (
                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
                    <div className="h-full bg-surface-container-high" style={{ width: "0%" }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* LLM judge scores */}
        <div className="mt-5 border-t border-outline-variant/30 pt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-title-sm font-semibold text-on-surface">{t("qualityPanel.judgeTitle")}</h4>
            {judgeHasCompleted ? (
              <p className="text-body-xs text-on-surface-variant">
                {t("qualityPanel.judgeCounts", {
                  evaluated: (metrics.judgeEvaluatedCount ?? 0).toLocaleString(intlLocale),
                  degraded: (metrics.judgeDegradedCount ?? 0).toLocaleString(intlLocale),
                  failed: (metrics.judgeFailedCount ?? 0).toLocaleString(intlLocale),
                })}
              </p>
            ) : judgeHasAnyResult ? (
              <p className="text-body-xs text-on-surface-variant">{t("qualityPanel.judgeNoCompleted")}</p>
            ) : (
              <p className="text-body-xs text-on-surface-variant">{t("qualityPanel.judgePending")}</p>
            )}
          </div>
          {judgeHasCompleted ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {judgeItems.map((item, idx) => {
                const pct = Math.round(Math.max(0, Math.min(1, item.val)) * 100);
                const isGood = pct >= 80;
                return (
                  <div key={idx} className="rounded-xl border border-outline-variant/30 bg-surface p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-body-sm font-semibold text-on-surface">{t(item.labelKey)}</span>
                      <span
                        className={`text-label-md font-bold font-mono ${
                          isGood ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {pct}%
                      </span>
                    </div>
                    <p className="mt-1 text-body-xs text-on-surface-variant">{t(item.descKey)}</p>
                    <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
                      <div
                        className={`h-full transition-all duration-300 ${isGood ? "bg-emerald-500" : "bg-amber-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-body-sm text-on-surface-variant">
              {judgeHasAnyResult ? t("qualityPanel.judgeNoCompletedBody") : t("qualityPanel.judgePendingBody")}
            </p>
          )}
        </div>
        </>
      )}
    </div>
  );
}
