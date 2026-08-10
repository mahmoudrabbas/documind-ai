"use client";

import React from "react";
import type { InsightProposal } from "@/services/analytics.service";
import { useI18n } from "@/providers/i18n-provider";

interface InsightPanelProps {
  insights: InsightProposal[];
  loading?: boolean;
  onRefresh?: () => void;
}

export function InsightPanel({ insights, loading, onRefresh }: InsightPanelProps) {
  const { t } = useI18n();

  const categoryBadgeColors: Record<string, string> = {
    cost: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-200/50",
    quality: "bg-primary/10 text-primary border-primary/20",
    performance: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200/50",
    anomaly: "bg-error/10 text-error border-error/20",
    usage_pattern: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200/50",
  };

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-title-md font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-xl">auto_awesome</span>
              <span>{t("analytics.insightAgentTitle")}</span>
              <span className="rounded-full bg-gradient-to-r from-primary to-tertiary px-2.5 py-0.5 text-label-xs font-bold text-on-primary">
                {t("analytics.aiPowered")}
              </span>
            </h3>
            <p className="text-body-xs text-on-surface-variant mt-0.5">
              {t("analytics.insightAgentSubtitle")}
            </p>
          </div>

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface px-3 py-1.5 text-label-sm font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-sm ${loading ? "animate-spin" : ""}`}>
                {loading ? "sync" : "refresh"}
              </span>
              <span>{loading ? t("analytics.analyzing") : t("analytics.reAnalyze")}</span>
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-outline-variant/30 bg-surface/50 p-6">
            <span className="material-symbols-outlined text-primary text-3xl animate-spin">progress_activity</span>
            <span className="text-body-xs font-medium text-on-surface-variant">
              {t("analytics.runningAnalysis")}
            </span>
          </div>
        ) : !insights || insights.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant/40 bg-surface/40 p-6 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary mb-2">
              <span className="material-symbols-outlined text-xl">check_circle</span>
            </div>
            <p className="text-body-sm font-semibold text-on-surface">{t("analytics.systemRunningSmoothly")}</p>
            <p className="text-body-xs text-on-surface-variant mt-1 max-w-sm">
              {t("analytics.noAnomalies")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {insights.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-outline-variant/30 bg-surface p-4 transition-all hover:border-outline-variant/60"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-body-sm font-bold text-on-surface">{item.statement}</span>
                  <span
                    className={`rounded-lg border px-2 py-0.5 text-label-xs font-semibold uppercase tracking-wider ${
                      categoryBadgeColors[item.category] || categoryBadgeColors.quality
                    }`}
                  >
                    {item.category}
                  </span>
                </div>

                <p className="mt-2 text-body-xs text-on-surface-variant">
                  <strong className="text-on-surface font-semibold">{t("analytics.recommendedAction")}</strong> {item.recommendedAction}
                </p>

                <div className="mt-2.5 flex items-center justify-between border-t border-outline-variant/20 pt-2 text-label-xs text-outline">
                  <span>{t("analytics.reasoning", { reasoning: item.reasoning })}</span>
                  <span className="font-mono font-medium">{t("analytics.confidence", { confidence: item.confidence })}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
