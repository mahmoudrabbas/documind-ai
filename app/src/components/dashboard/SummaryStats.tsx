"use client";

import type { DashboardSummary } from "@/types/api/dashboard.types";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Shared card chrome                                                 */
/* ------------------------------------------------------------------ */

const CARD_CLASS =
  "flex min-h-[168px] min-w-0 flex-col justify-between rounded-3xl " +
  "border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-card transition-all duration-200 " +
  "hover:-translate-y-0.5 hover:border-outline-variant/80 hover:shadow-popover";

/* ------------------------------------------------------------------ */
/*  Card definitions                                                   */
/* ------------------------------------------------------------------ */

const STAT_DEFS = [
  {
    key: "users",
    labelKey: "dashboard.activeUsers",
    icon: "group",
    iconBg: "bg-primary-container text-on-primary-container",
    barColor: "bg-primary",
  },
  {
    key: "documents",
    labelKey: "dashboard.documentsProcessed",
    icon: "description",
    iconBg: "bg-secondary-container text-on-secondary-container",
    barColor: "bg-secondary",
  },
  {
    key: "questions",
    labelKey: "dashboard.questionsAsked",
    icon: "forum",
    iconBg: "bg-tertiary-fixed text-on-tertiary-fixed",
    barColor: "bg-on-tertiary-container",
  },
  {
    key: "gaps",
    labelKey: "dashboard.knowledgeGaps",
    icon: "search_insights",
    iconBg: "bg-surface-container-high text-on-surface-variant",
    barColor: "bg-outline",
  },
] as const;

type StatKey = (typeof STAT_DEFS)[number]["key"];

const GAPS_ALERT_TONE = {
  iconBg: "bg-error-container text-on-error-container",
  barColor: "bg-error",
} as const;

function statValue(
  summary: DashboardSummary,
  key: StatKey,
  locale: string,
): { primary: string; isFraction: boolean } {
  switch (key) {
    case "users":
      return { primary: `${summary.users.active}/${summary.users.total}`, isFraction: true };
    case "documents":
      return { primary: summary.documents.processed.toLocaleString(locale), isFraction: false };
    case "questions":
      return { primary: summary.usage.questionsAsked30d.toLocaleString(locale), isFraction: false };
    case "gaps":
      return { primary: `${summary.knowledgeGaps.open}/${summary.knowledgeGaps.total}`, isFraction: true };
  }
}

function statSub(
  summary: DashboardSummary,
  key: StatKey,
  t: (key: string, params?: Record<string, string>) => string,
): string {
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

function statRatio(summary: DashboardSummary, key: StatKey): number {
  switch (key) {
    case "users":
      return ratio(summary.users.active, summary.users.total);
    case "documents":
      return ratio(summary.documents.processed, summary.documents.total);
    case "questions":
      return ratio(summary.usage.questionsAsked7d, summary.usage.questionsAsked30d);
    case "gaps":
      return ratio(summary.knowledgeGaps.open, summary.knowledgeGaps.total);
  }
}

function ratio(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return Math.min(Math.max((part / whole) * 100, 0), 100);
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
          <div key={i} className={CARD_CLASS}>
            <div>
              <div className="mb-4 flex items-center justify-between">
                <div className="h-11 w-11 animate-pulse rounded-2xl bg-surface-container-high" />
              </div>
              <div className="h-4 w-24 animate-pulse rounded-md bg-surface-container-high" />
              <div className="mt-2 h-9 w-28 animate-pulse rounded-lg bg-surface-container-high" />
            </div>
            <div className="mt-4">
              <div className="h-1.5 w-full animate-pulse rounded-full bg-surface-container-high" />
              <div className="mt-2.5 h-3 w-32 animate-pulse rounded-md bg-surface-container-high" />
            </div>
          </div>
        ))}
      </>
    );
  }

  const gapsAlert = summary.knowledgeGaps.open > 0;

  return (
    <>
      {STAT_DEFS.map((def) => {
        const tone =
          def.key === "gaps" && gapsAlert ? GAPS_ALERT_TONE : def;
        const pct = statRatio(summary, def.key);
        const val = statValue(summary, def.key, intlLocale);

        return (
          <div
            key={def.key}
            className={CARD_CLASS}
          >
            <div>
              <div className="mb-4 flex items-center justify-between">
                <div
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-2xl",
                    tone.iconBg,
                  )}
                >
                  <span
                    className="material-symbols-outlined text-[22px]"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    {def.icon}
                  </span>
                </div>
              </div>

              <p className="text-label-md text-on-surface-variant">
                {t(def.labelKey)}
              </p>

              <p className="mt-1 break-words text-headline-lg font-bold text-on-surface sm:text-display-sm">
                {val.isFraction ? (
                  <span dir="ltr" className="inline-block">
                    {val.primary}
                  </span>
                ) : (
                  val.primary
                )}
              </p>
            </div>

            <div className="mt-4">
              <div
                aria-hidden="true"
                className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high"
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500 ease-out",
                    tone.barColor,
                  )}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
              <p className="mt-2.5 text-label-sm text-on-surface-variant">
                {statSub(summary, def.key, t)}
              </p>
            </div>
          </div>
        );
      })}
    </>
  );
}
