"use client";

import React from "react";
import type { CostBreakdownItem } from "@/services/analytics.service";
import { useI18n } from "@/providers/i18n-provider";

interface CostBreakdownChartProps {
  data: CostBreakdownItem[];
}

export function CostBreakdownChart({ data }: CostBreakdownChartProps) {
  const { t } = useI18n();

  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-outline-variant/40 bg-surface-container-lowest p-6 text-center">
        <p className="text-body-md text-on-surface-variant">{t("analytics.noCostData")}</p>
      </div>
    );
  }

  const COLORS = ["#6366f1", "#06b6d4", "#10b981", "#f59e0b", "#8b5cf6"];

  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm">
      <h3 className="text-title-md font-bold text-on-surface mb-4">{t("analytics.costBreakdownTitle")}</h3>

      {/* Stacked Progress Bar */}
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-surface-container-high mb-6">
        {data.map((item, idx) => (
          <div
            key={idx}
            style={{
              width: `${Math.max(item.percentageOfTotal, 2)}%`,
              backgroundColor: COLORS[idx % COLORS.length],
            }}
            title={`${item.provider}/${item.model}: ${item.percentageOfTotal}% ($${item.costUsd})`}
            className="transition-all duration-300 hover:opacity-80"
          />
        ))}
      </div>

      {/* Breakdown List */}
      <div className="space-y-3">
        {data.map((item, idx) => (
          <div key={idx} className="flex items-center justify-between text-body-sm">
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: COLORS[idx % COLORS.length] }}
              />
              <span className="font-medium text-on-surface">
                {item.provider} / {item.model}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-on-surface-variant font-mono text-label-xs">{t("analytics.tokensCount", { count: item.totalTokens.toLocaleString() })}</span>
              <span className="font-bold text-on-surface font-mono">${item.costUsd.toFixed(4)}</span>
              <span className="text-outline font-mono text-label-xs w-12 text-end">{item.percentageOfTotal}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
