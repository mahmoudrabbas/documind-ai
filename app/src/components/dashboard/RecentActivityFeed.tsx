"use client";

import Link from "next/link";
import type { DashboardRecentActivityItem } from "@/types/api/dashboard.types";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatRelativeTime(
  iso: string,
  t: (key: string, params?: Record<string, string>) => string,
  locale: string,
): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return new Date(iso).toLocaleString(locale);
  }
  if (seconds < 60) return t("dashboard.justNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)
    return t("dashboard.minutesAgo", { count: String(minutes) });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("dashboard.hoursAgo", { count: String(hours) });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("dashboard.daysAgo", { count: String(days) });
  return new Date(iso).toLocaleDateString(locale);
}

function iconFor(action: string, resourceType: string): string {
  const haystack = `${resourceType} ${action}`.toLowerCase();
  if (haystack.includes("document") || haystack.includes("file"))
    return "description";
  if (haystack.includes("user") || haystack.includes("invitation"))
    return "person";
  if (haystack.includes("role")) return "manage_accounts";
  if (
    haystack.includes("question") ||
    haystack.includes("query") ||
    haystack.includes("ask")
  )
    return "question_answer";
  if (haystack.includes("login") || haystack.includes("auth"))
    return "lock";
  if (haystack.includes("knowledge") || haystack.includes("gap"))
    return "search_insights";
  if (haystack.includes("setting") || haystack.includes("tenant"))
    return "settings";
  return "history";
}

const ICON_STYLES = [
  "bg-secondary-container text-on-secondary-container",
  "bg-tertiary-container text-on-tertiary-container",
  "bg-primary-container text-on-primary-container",
  "bg-error-container text-on-error-container",
] as const;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function RecentActivityFeed({
  items,
  max = 5,
}: {
  items: DashboardRecentActivityItem[] | null;
  max?: number;
}) {
  const { t } = useI18n();
  const intlLocale = useIntlLocale();

  if (!items) {
    return (
      <>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-4 p-3">
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-surface-container-high" />
            <div className="min-w-0 flex-1 space-y-2 py-1">
              <div className="h-4 w-3/4 animate-pulse rounded bg-surface-container-high" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-surface-container-high" />
            </div>
          </div>
        ))}
      </>
    );
  }

  const visible = items.slice(0, max);

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
        <span className="material-symbols-outlined text-4xl text-on-surface-variant">
          history_toggle_off
        </span>
        <p className="text-body-sm text-on-surface-variant">
          {t("dashboard.noRecentActivity")}
        </p>
      </div>
    );
  }

  return (
    <>
      {visible.map((item, index) => (
        <div
          key={item.id}
          className="flex gap-4 rounded-xl p-3 transition-colors hover:bg-surface-container-low"
        >
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              ICON_STYLES[index % ICON_STYLES.length]
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">
              {iconFor(item.action, item.resourceType)}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-body-sm leading-relaxed text-on-surface">
              <span className="font-bold">
                {!item.actorEmail || item.actorEmail.toLowerCase() === "system"
                  ? t("dashboard.system")
                  : item.actorEmail}
              </span>{" "}
              <span className="text-on-surface-variant">
                {codeLabel(t, "audit.action", item.action)}
              </span>
            </p>
            <p className="mt-0.5 text-[12px] text-on-surface-variant">
              {formatRelativeTime(item.createdAt, t, intlLocale)}
              {item.outcome
                ? ` · ${codeLabel(t, "audit.outcome", item.outcome)}`
                : ""}
            </p>
          </div>
        </div>
      ))}
    </>
  );
}

export function RecentActivityHeader({
  href,
  hrefLabel,
}: {
  href?: string;
  hrefLabel?: string;
}) {
  const { t } = useI18n();
  const linkLabel = hrefLabel ?? t("dashboard.viewAll");

  return (
    <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
      <h4 className="flex items-center gap-2 text-title-lg font-bold text-primary">
        <span className="material-symbols-outlined">history</span>
        {t("dashboard.recentActivity")}
      </h4>
      {href ? (
        <Link
          href={href}
          className="text-label-md text-on-primary-container hover:underline"
        >
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}
