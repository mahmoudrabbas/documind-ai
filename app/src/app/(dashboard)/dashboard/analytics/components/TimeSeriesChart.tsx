"use client";

import React from "react";
import type { TimeSeriesPoint } from "@/services/analytics.service";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";

interface TimeSeriesChartProps {
  data: TimeSeriesPoint[];
  metricKey?: "queries" | "costUsd" | "tokens" | "avgLatencyMs";
  title?: string;
}

export function TimeSeriesChart({
  data,
  metricKey = "queries",
  title,
}: TimeSeriesChartProps) {
  const { t } = useI18n();
  const intlLocale = useIntlLocale();
  const chartTitle = title ?? t("analytics.dailyVolumeTitle");

  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-outline-variant/40 bg-surface-container-lowest p-6 text-center">
        <p className="text-body-md text-on-surface-variant">{t("analytics.noTimeSeriesData")}</p>
      </div>
    );
  }

  const values = data.map((d) => Number(d[metricKey]) || 0);
  const maxVal = Math.max(...values, 1);
  const chartHeight = 180;
  const width = 600;
  const stepX = data.length > 1 ? width / (data.length - 1) : width;

  const points = data
    .map((d, i) => {
      const val = Number(d[metricKey]) || 0;
      const x = i * stepX;
      const y = chartHeight - (val / maxVal) * (chartHeight - 20) - 10;
      return `${x},${y}`;
    })
    .join(" ");

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toLocaleDateString(intlLocale, { month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-title-md font-bold text-on-surface">{chartTitle}</h3>
        <span className="rounded bg-surface-container-high px-2 py-0.5 font-mono text-label-xs text-on-surface-variant">
          Metric: {metricKey === "costUsd" ? "Cost (USD)" : metricKey}
        </span>
      </div>

      <div className="relative w-full overflow-hidden">
        <svg viewBox={`0 0 ${width} ${chartHeight}`} className="w-full h-48 overflow-visible">
          {/* Background Grid Lines */}
          <line x1="0" y1="20" x2={width} y2="20" stroke="currentColor" className="text-outline-variant/30" strokeDasharray="4 4" />
          <line x1="0" y1={chartHeight / 2} x2={width} y2={chartHeight / 2} stroke="currentColor" className="text-outline-variant/30" strokeDasharray="4 4" />
          <line x1="0" y1={chartHeight - 10} x2={width} y2={chartHeight - 10} stroke="currentColor" className="text-outline-variant/50" />

          {/* Area Fill */}
          <polygon
            points={`0,${chartHeight} ${points} ${width},${chartHeight}`}
            className="fill-primary/10"
          />

          {/* Polyline */}
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
            className="text-primary"
          />

          {/* Data Points */}
          {data.map((d, i) => {
            const val = Number(d[metricKey]) || 0;
            const x = i * stepX;
            const y = chartHeight - (val / maxVal) * (chartHeight - 20) - 10;
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="4"
                className="fill-primary stroke-surface stroke-2 hover:r-6 transition-all"
              >
                <title>{`${d.date}: ${val} ${metricKey}`}</title>
              </circle>
            );
          })}
        </svg>
      </div>

      <div className="mt-3 flex items-center justify-between text-label-xs text-outline font-mono">
        <span>{formatDate(data[0]?.date)}</span>
        <span>{formatDate(data[Math.floor(data.length / 2)]?.date)}</span>
        <span>{formatDate(data[data.length - 1]?.date)}</span>
      </div>
    </div>
  );
}
