"use client";

import type { DashboardSummary } from "@/types/api/dashboard.types";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";

/* ------------------------------------------------------------------ */
/*  Card definitions                                                   */
/* ------------------------------------------------------------------ */

const STAT_DEFS = [
  {
    key: "users",
    labelKey: "dashboard.activeUsers",
    icon: "group",
    iconBg: "bg-primary-container",
    iconColor: "text-on-primary-container",
  },
  {
    key: "documents",
    labelKey: "dashboard.documentsProcessed",
    icon: "description",
    iconBg: "bg-secondary-container",
    iconColor: "text-on-secondary-container",
  },
  {
    key: "questions",
    labelKey: "dashboard.questionsAsked",
    icon: "forum",
    iconBg: "bg-tertiary-fixed",
    iconColor: "text-on-tertiary-fixed",
  },
  {
    key: "gaps",
    labelKey: "dashboard.knowledgeGaps",
    icon: "search_insights",
    iconBg: "bg-error-container",
    iconColor: "text-on-error-container",
  },
] as const;

type StatKey = (typeof STAT_DEFS)[number]["key"];

function statValue(
  summary: DashboardSummary,
  key: StatKey,
  locale: string,
): string {
  switch (key) {
    case "users":
      return `${summary.users.active}/${summary.users.total}`;
    case "documents":
      return summary.documents.processed.toLocaleString(locale);
    case "questions":
      return summary.usage.questionsAsked30d.toLocaleString(locale);
    case "gaps":
      return `${summary.knowledgeGaps.open}/${summary.knowledgeGaps.total}`;
  }
}

function statSub(summary: DashboardSummary, key: StatKey, t: (key: string, params?: Record<string, string>) => string): string {
  switch (key) {
    case "users":
      return t("dashboard.pendingInvitations", {
        count: String(summary.users.pendingInvitations),
      });
    case "documents":
      return t("dashboard.documentsState", {
        processing: String(summary.documents.processing),
        failed: String(summary.documents.failed),
      });
    case "questions":
      return t("dashboard.questionsLast7d", {
        count: String(summary.usage.questionsAsked7d),
      });
    case "gaps":
      return t("dashboard.openGaps", {
        count: String(summary.knowledgeGaps.open),
      });
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SummaryStats({
  summary,
}: {
  summary: DashboardSummary | null;
}) {
  const { t } = useI18n();
  const intlLocale = useIntlLocale();

  if (!summary) {
    return (
      <>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="col-span-1 flex min-h-0 min-w-0 flex-col rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm lg:p-5"
          >
            <div className="mb-3 flex items-start justify-between">
              <div className="h-12 w-12 animate-pulse rounded-xl bg-surface-container-high" />
            </div>
            <div className="space-y-3">
              <div className="h-4 w-24 animate-pulse rounded bg-surface-container-high" />
              <div className="h-9 w-36 animate-pulse rounded bg-surface-container-high" />
              <div className="h-3 w-28 animate-pulse rounded bg-surface-container-high" />
            </div>
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      {STAT_DEFS.map((def) => (
        <div
          key={def.key}
          className="col-span-1 flex min-h-0 min-w-0 flex-col rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm transition-transform hover:-translate-y-1 lg:p-5"
        >
          <div className="mb-3 flex items-start justify-between">
            <div className={`p-3 ${def.iconBg} ${def.iconColor} rounded-xl`}>
              <span
                className="material-symbols-outlined"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {def.icon}
              </span>
            </div>
          </div>
          <p className="text-label-md text-on-surface-variant">
            {t(def.labelKey)}
          </p>
          <h3 className="break-words text-headline-lg font-bold leading-none text-primary sm:text-display-lg">
            {statValue(summary, def.key, intlLocale)}
          </h3>
          <p className="mt-2 text-label-sm text-on-surface-variant">
            {statSub(summary, def.key, t)}
          </p>
        </div>
      ))}
    </>
  );
}
