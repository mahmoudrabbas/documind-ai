"use client";

import React from "react";

interface MetricCardProps {
  title: string;
  value: string | number;
  changePct?: number;
  subtitle?: string;
  icon?: string;
  freshnessLabel?: string;
  costTypeBadge?: string;
}

export function MetricCard({
  title,
  value,
  changePct,
  subtitle,
  icon,
  freshnessLabel,
  costTypeBadge,
}: MetricCardProps) {
  const isPositive = changePct !== undefined && changePct >= 0;

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-label-md font-semibold text-on-surface-variant">{title}</span>
        {icon && (
          <span className="material-symbols-outlined text-outline text-xl">
            {icon}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <div className="text-headline-md font-bold text-on-surface">{value}</div>

        {changePct !== undefined && (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-label-sm font-bold ${
              isPositive
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-error/10 text-error"
            }`}
          >
            {isPositive ? "↑" : "↓"} {Math.abs(changePct)}%
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-body-xs text-on-surface-variant">
        {subtitle && <span>{subtitle}</span>}
        {costTypeBadge && (
          <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-label-xs font-semibold text-primary">
            {costTypeBadge}
          </span>
        )}
        {freshnessLabel && <span className="text-label-xs text-outline">{freshnessLabel}</span>}
      </div>
    </div>
  );
}
