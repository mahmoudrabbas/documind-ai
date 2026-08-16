"use client";

import Link from "next/link";
import type { DashboardRecentActivityItem } from "@/types/api/dashboard.types";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";
import { DashboardPanelHeader } from "@/components/ui/DashboardPage";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

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

/**
 * Rotating icon tints.
 *
 * Design tokens rather than raw palette steps: the app ships no dark theme
 * (see `globals.css`), so `dark:` variants here would be dead classes, and
 * hard-coded `blue-500`/`emerald-500` drift away from DESIGN.md the moment
 * the palette moves.
 */
const ICON_THEMES = [
  "bg-primary-container text-on-primary-container",
  "bg-secondary-container text-on-secondary-container",
  "bg-tertiary-container text-on-tertiary-container",
  "bg-info-container text-on-info-container",
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
      <div className="flex flex-col gap-3 pt-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 rounded-2xl border border-outline-variant/20 bg-surface-container-low/30 p-3">
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-2xl bg-surface-container-high" />
            <div className="min-w-0 flex-1 space-y-2 py-1">
              <div className="h-4 w-3/4 animate-pulse rounded-md bg-surface-container-high" />
              <div className="h-3 w-1/3 animate-pulse rounded-md bg-surface-container-high" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const visible = items.slice(0, max);

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-outline-variant/40 px-4 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-container-high text-on-surface-variant">
          <span className="material-symbols-outlined text-[24px]">
            history_toggle_off
          </span>
        </div>
        <p className="text-label-md text-on-surface-variant">
          {t("dashboard.noRecentActivity")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 pt-1">
      {visible.map((item, index) => (
        <div
          key={item.id}
          className="group flex items-center justify-between gap-4 rounded-2xl border border-outline-variant/20 bg-surface-container-low/25 p-3.5 transition-all duration-200 hover:border-outline-variant/50 hover:bg-surface-container-low/70"
        >
          <div className="flex min-w-0 items-center gap-3.5">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-outline-variant/30 transition-transform duration-200 group-hover:scale-105",
                ICON_THEMES[index % ICON_THEMES.length],
              )}
            >
              <span className="material-symbols-outlined text-[20px]">
                {iconFor(item.action, item.resourceType)}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-sm leading-normal text-on-surface">
                <span className="font-bold text-primary">
                  {!item.actorEmail || item.actorEmail.toLowerCase() === "system"
                    ? t("dashboard.system")
                    : item.actorEmail}
                </span>{" "}
                <span className="text-on-surface-variant">
                  {codeLabel(t, "audit.action", item.action)}
                </span>
              </p>
              <p className="mt-0.5 text-label-xs text-on-surface-variant/80">
                {formatRelativeTime(item.createdAt, t, intlLocale)}
              </p>
            </div>
          </div>

          {/* `status` takes the untranslated outcome code so the colour is
              resolved from a machine word, never from display text. */}
          {item.outcome ? (
            <Badge
              status={item.outcome}
              label={codeLabel(t, "audit.outcome", item.outcome)}
              className="shrink-0 text-label-xs"
            />
          ) : null}
        </div>
      ))}
    </div>
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
    <DashboardPanelHeader
      icon="history"
      title={t("dashboard.recentActivity")}
      action={
        href ? (
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-label-md font-semibold text-primary transition-colors hover:text-primary/80 hover:underline"
          >
            {linkLabel}
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[16px] rtl:rotate-180"
            >
              arrow_forward
            </span>
          </Link>
        ) : null
      }
    />
  );
}
