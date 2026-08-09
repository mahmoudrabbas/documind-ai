"use client";

import type { GapMetrics } from "@/types/api/knowledge-gaps.types";
import { useI18n } from "@/providers/i18n-provider";

interface GapMetricsCardsProps {
  metrics: GapMetrics | null;
  loading?: boolean;
}

export function GapMetricsCards({ metrics, loading }: GapMetricsCardsProps) {
  const { t } = useI18n();

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" id="gap-metrics-loading">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl border border-outline-variant/30 bg-surface-container/50" />
        ))}
      </div>
    );
  }

  if (!metrics) return null;

  const cards = [
    {
      key: "totalGaps",
      title: t("dashboard.knowledgeGaps.totalGaps"),
      value: metrics.totalGaps,
      icon: "search_insights",
      color: "text-primary bg-primary/10",
    },
    {
      key: "openAssigned",
      title: t("dashboard.knowledgeGaps.openAssigned"),
      value: (metrics.byStatus.open || 0) + (metrics.byStatus.assigned || 0) + (metrics.byStatus.reopened || 0),
      icon: "troubleshoot",
      color: "text-error bg-error/10",
    },
    {
      key: "resolved",
      title: t("dashboard.knowledgeGaps.resolved"),
      value: metrics.byStatus.resolved || 0,
      icon: "check_circle",
      color: "text-success bg-success/10",
    },
    {
      key: "resolutionRate",
      title: t("dashboard.knowledgeGaps.resolutionRate"),
      value: `${Math.round(metrics.resolutionRate * 100)}%`,
      icon: "trending_up",
      color: "text-tertiary bg-tertiary/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" id="gap-metrics-cards">
      {cards.map((card) => (
        <div
          key={card.key}
          className="flex items-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm"
        >
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.color}`}>
            <span className="material-symbols-outlined text-[20px]">{card.icon}</span>
          </div>
          <div>
            <p className="text-body-xs text-on-surface-variant">{card.title}</p>
            <p className="text-title-lg font-bold text-on-surface">{card.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
