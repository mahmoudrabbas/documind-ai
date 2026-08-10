"use client";

import React from "react";
import { useI18n } from "@/providers/i18n-provider";

interface AnalyticsFilterBarProps {
  startDate: string;
  endDate: string;
  provider: string;
  model: string;
  onFilterChange: (filters: { startDate: string; endDate: string; provider: string; model: string }) => void;
}

function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLocalStartDateString(daysAgo = 30): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return getLocalDateString(d);
}

export function AnalyticsFilterBar({
  startDate,
  endDate,
  provider,
  model,
  onFilterChange,
}: AnalyticsFilterBarProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <label className="block text-label-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">
            {t("analytics.startDate")}
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => onFilterChange({ startDate: e.target.value, endDate, provider, model })}
            className="rounded-xl border border-outline-variant/40 bg-surface px-3 py-1.5 text-body-sm text-on-surface focus:border-primary focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-label-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">
            {t("analytics.endDate")}
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onFilterChange({ startDate, endDate: e.target.value, provider, model })}
            className="rounded-xl border border-outline-variant/40 bg-surface px-3 py-1.5 text-body-sm text-on-surface focus:border-primary focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-label-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">
            {t("analytics.provider")}
          </label>
          <select
            value={provider}
            onChange={(e) => onFilterChange({ startDate, endDate, provider: e.target.value, model })}
            className="rounded-xl border border-outline-variant/40 bg-surface px-3 py-1.5 text-body-sm text-on-surface focus:border-primary focus:outline-none"
          >
            <option value="">{t("analytics.allProviders")}</option>
            <option value="groq">Groq</option>
            <option value="bedrock">AWS</option>
          </select>
        </div>

        <div>
          <label className="block text-label-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">
            {t("analytics.model")}
          </label>
          <select
            value={model}
            onChange={(e) => onFilterChange({ startDate, endDate, provider, model: e.target.value })}
            className="rounded-xl border border-outline-variant/40 bg-surface px-3 py-1.5 text-body-sm text-on-surface focus:border-primary focus:outline-none"
          >
            <option value="">{t("analytics.allModels")}</option>
            <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
            <option value="amazon.titan-embed-text-v2:0">amazon.titan-embed-text-v2:0</option>
            <option value="amazon.titan-text-express-v1">amazon.titan-text-express-v1</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() =>
            onFilterChange({
              startDate: getLocalStartDateString(30),
              endDate: getLocalDateString(),
              provider: "",
              model: "",
            })
          }
          className="rounded-xl border border-outline-variant/40 bg-surface px-3 py-1.5 text-label-sm font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors"
        >
          {t("analytics.resetFilters")}
        </button>
      </div>
    </div>
  );
}
