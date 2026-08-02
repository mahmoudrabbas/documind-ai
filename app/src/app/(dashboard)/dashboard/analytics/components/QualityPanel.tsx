"use client";

import React from "react";
import type { QualityMetricsData } from "@/services/analytics.service";

interface QualityPanelProps {
  metrics: QualityMetricsData;
}

export function QualityPanel({ metrics }: QualityPanelProps) {
  // If sample-size fields are missing (old API), assume data exists and show rates as-is
  const sampleSizesAvailable = metrics.totalQueries !== undefined;
  const hasData = !sampleSizesAvailable || metrics.totalQueries > 0 || metrics.totalFeedback > 0 || metrics.totalProcessingRuns > 0;

  const items = [
    {
      label: "Citation Coverage",
      val: metrics.citationCoverage,
      desc: "% of responses with verified source evidence",
      sampleSize: metrics.totalQueries,
      sampleLabel: "queries",
    },
    {
      label: "Citation Precision",
      val: metrics.citationPrecision,
      desc: "Relevance accuracy of cited document chunks",
      sampleSize: metrics.totalQueries,
      sampleLabel: "queries",
    },
    {
      label: "Positive Feedback Rate",
      val: metrics.feedbackPositiveRate,
      desc: "User satisfaction rating (thumbs up)",
      sampleSize: metrics.totalFeedback,
      sampleLabel: "ratings",
    },
    {
      label: "Document Processing Success",
      val: metrics.processingSuccessRate,
      desc: "% of document extraction runs completed",
      sampleSize: metrics.totalProcessingRuns,
      sampleLabel: "runs",
    },
    {
      label: "No-Evidence Rate",
      val: metrics.noEvidenceRate,
      desc: "Queries lacking relevant documentation (lower is better)",
      inverse: true,
      sampleSize: metrics.totalQueries,
      sampleLabel: "queries",
    },
    {
      label: "Safety Refusal Rate",
      val: metrics.refusalRate,
      desc: "Queries blocked by policy / guardrails",
      inverse: true,
      sampleSize: metrics.totalQueries,
      sampleLabel: "queries",
    },
  ];

  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm">
      <h3 className="text-title-md font-bold text-on-surface mb-4">AI Quality &amp; Reliability Metrics</h3>

      {!hasData ? (
        <div className="rounded-xl border border-outline-variant/20 bg-surface p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-on-surface-variant" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-body-md font-semibold text-on-surface">No quality data yet</p>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Quality metrics will appear once queries, feedback, or document processing runs are recorded.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((item, idx) => {
            const hasSample = !sampleSizesAvailable || item.sampleSize > 0;
            const pct = hasSample ? Math.round(item.val * 100) : null;
            const isGood = pct !== null && (item.inverse ? pct < 10 : pct > 80);

            return (
              <div key={idx} className="rounded-xl border border-outline-variant/30 bg-surface p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-body-sm font-semibold text-on-surface">{item.label}</span>
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
                <p className="mt-1 text-body-xs text-on-surface-variant">{item.desc}</p>
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
                      Based on {item.sampleSize.toLocaleString()} {item.sampleLabel}
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
      )}
    </div>
  );
}
