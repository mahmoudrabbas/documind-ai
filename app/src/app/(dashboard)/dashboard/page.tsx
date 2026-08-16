"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/providers/auth-provider";
import { usePermissions } from "@/providers/permission-provider";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { Permission } from "@/types/api/permissions.types";
import {
  DashboardPage as DashboardPageShell,
  DashboardPanel,
  DashboardPanelHeader,
} from "@/components/ui/DashboardPage";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { SubscriptionWidget } from "@/components/billing/SubscriptionWidget";
import UsageQuotaPanel from "@/components/dashboard/UsageQuotaPanel";
import SummaryStats from "@/components/dashboard/SummaryStats";
import RecentActivityFeed, {
  RecentActivityHeader,
} from "@/components/dashboard/RecentActivityFeed";
import { getDashboardSummary } from "@/services/dashboard.service";
import type { DashboardSummary } from "@/types/api/dashboard.types";

type SummaryViewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; summary: DashboardSummary };

/** Right-column shortcut rows — one row per destination. */
const SHORTCUTS = [
  {
    href: "/dashboard/chat",
    labelKey: "nav.chat",
    icon: "forum",
    iconBg: "bg-primary-container text-on-primary-container",
  },
  {
    href: "/dashboard/documents",
    labelKey: "nav.documents",
    icon: "description",
    iconBg: "bg-secondary-container text-on-secondary-container",
  },
  {
    href: "/dashboard/analytics",
    labelKey: "nav.analytics",
    icon: "analytics",
    iconBg: "bg-tertiary-fixed text-on-tertiary-fixed",
  },
] as const;

export default function DashboardPage() {
  const auth = useAuth();
  const permissions = usePermissions();
  const { t, tPlural, dir } = useI18n();
  const intlLocale = useIntlLocale();
  const [view, setView] = useState<SummaryViewState>({ status: "loading" });
  const [retryCount, setRetryCount] = useState(0);

  const fetchSummary = useCallback(async (signal: AbortSignal) => {
    setView({ status: "loading" });
    try {
      const response = await getDashboardSummary(signal);
      setView({ status: "success", summary: response.data });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setView({
        status: "error",
        message:
          err instanceof Error
            ? err.message
            : "Failed to load dashboard summary",
      });
    }
  }, []);

  useEffect(() => {
    if (auth.status !== "authenticated") return;
    if (permissions.status !== "ready") return;
    if (!permissions.can(Permission.ANALYTICS_READ)) return;
    const ctrl = new AbortController();
    void fetchSummary(ctrl.signal);
    return () => ctrl.abort();
  }, [fetchSummary, retryCount, auth, permissions]);

  if (auth.status !== "authenticated") return null;
  if (
    permissions.status !== "ready" ||
    !permissions.can(Permission.ANALYTICS_READ)
  ) return null;

  const summary = view.status === "success" ? view.summary : null;
  const hasOpenGaps = (summary?.knowledgeGaps.open ?? 0) > 0;

  return (
    <DashboardPageShell dir={dir}>
      {/* ── Top Executive Header ────────────────────────────────────────── */}
      <header
        data-guide-id="page-heading-overview"
        className="mb-8 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0 flex-1">
          <h1 className="text-headline-lg-mobile font-bold text-primary sm:text-headline-lg">
            {t("dashboard.title")}
          </h1>
          <p className="mt-1 text-body-md text-on-surface-variant">
            {t("dashboard.description")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {summary ? (
            <span className="text-label-sm text-on-surface-variant">
              {t("dashboard.updatedAtTime", {
                time: new Date(summary.generatedAt).toLocaleTimeString(
                  intlLocale,
                ),
              })}
            </span>
          ) : null}

          <Link
            href="/dashboard/audit"
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-outline bg-surface-container-lowest px-4 text-label-md font-semibold text-on-surface transition-colors hover:bg-surface-container hover:border-outline-variant"
          >
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[18px]"
            >
              policy
            </span>
            {t("audit.title")}
          </Link>

          <Button
            variant="primary"
            data-guide-id="overview-refresh"
            onClick={() => setRetryCount((c) => c + 1)}
            className="min-h-10"
          >
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[18px]"
            >
              refresh
            </span>
            {t("dashboard.refresh")}
          </Button>
        </div>
      </header>

      {/* ── 1. Top section: 4 KPI cards ───────────────────────────────── */}
      {view.status === "error" ? (
        <Alert variant="error" className="rounded-3xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {view.message || t("dashboard.overview.summaryError")}
            </span>
            <button
              type="button"
              onClick={() => setRetryCount((c) => c + 1)}
              className="cursor-pointer font-semibold underline-offset-2 hover:underline"
            >
              {t("common.retry")}
            </button>
          </div>
        </Alert>
      ) : (
        <div
          data-guide-id="overview-summary"
          className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:gap-5"
        >
          <SummaryStats summary={summary} />
        </div>
      )}

      {/* ── 2. Main bento grid: primary column + sidebar ──────────────── */}
      <div className="mt-8 grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-12 xl:gap-8">
        {/* Primary column (Col 7 / Col 8): plan usage, AI insight, activity */}
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-7 xl:col-span-8">
          <UsageQuotaPanel data-guide-id="overview-metrics" />

          {/* AI knowledge-gap insight card */}
          {view.status === "success" && hasOpenGaps ? (
            <section
              className="flex min-w-0 flex-col gap-5 rounded-3xl bg-primary-container p-6 text-on-primary shadow-card sm:p-7 md:flex-row md:items-center md:justify-between"
              data-guide-id="overview-gaps"
            >
              <div className="flex min-w-0 flex-1 items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-tertiary-fixed text-on-tertiary-fixed">
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-[24px]"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    auto_awesome
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <span className="mb-2 inline-block rounded-full bg-tertiary-fixed/20 px-3 py-1 text-label-xs font-bold text-tertiary-fixed">
                    {t("dashboard.overview.aiSuggestionEyebrow")}
                  </span>
                  <h3 className="text-title-lg font-bold text-on-primary sm:text-headline-md">
                    {t("dashboard.overview.gapsDetectedTitle")}
                  </h3>
                  <p className="mt-1 max-w-2xl text-body-md leading-relaxed text-on-primary/80">
                    {tPlural(
                      "dashboard.overview.gapsDetectedBody",
                      view.summary.knowledgeGaps.open,
                      {
                        total: String(view.summary.knowledgeGaps.total),
                      },
                    )}
                  </p>
                </div>
              </div>

              <Link
                href="/dashboard/knowledge-gaps"
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-surface px-6 py-3 text-label-md font-bold text-primary shadow-sm transition-all hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              >
                {t("dashboard.overview.reviewGaps")}
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-[18px] rtl:rotate-180"
                >
                  arrow_forward
                </span>
              </Link>
            </section>
          ) : null}

          {/* Recent activity */}
          {view.status !== "error" ? (
            <DashboardPanel
              data-guide-id="overview-activity"
              className="shadow-card"
            >
              <RecentActivityHeader href="/dashboard/audit" />
              <RecentActivityFeed
                items={
                  view.status === "success"
                    ? view.summary.recentActivity
                    : null
                }
              />
            </DashboardPanel>
          ) : null}
        </div>

        {/* Sidebar (Col 5 / Col 4): subscription + quick shortcuts */}
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-5 xl:col-span-4">
          <div data-guide-id="overview-subscription">
            <SubscriptionWidget />
          </div>

          <DashboardPanel
            padding="compact"
            className="shadow-card"
          >
            <DashboardPanelHeader
              icon="bolt"
              title={t("dashboard.quickActions")}
            />
            <div className="flex flex-col gap-2 pt-1">
              {SHORTCUTS.map((shortcut) => (
                <Link
                  key={shortcut.href}
                  href={shortcut.href}
                  className="group flex items-center justify-between rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 p-3.5 transition-all duration-200 hover:border-outline-variant hover:bg-surface-container-low"
                >
                  <div className="flex min-w-0 items-center gap-3.5">
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
                        shortcut.iconBg,
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className="material-symbols-outlined text-[20px]"
                      >
                        {shortcut.icon}
                      </span>
                    </div>
                    <span className="truncate text-title-sm text-on-surface">
                      {t(shortcut.labelKey)}
                    </span>
                  </div>
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined shrink-0 text-on-surface-variant transition-transform duration-200 group-hover:translate-x-1 rtl:group-hover:-translate-x-1 text-[20px]"
                  >
                    chevron_right
                  </span>
                </Link>
              ))}
            </div>
          </DashboardPanel>
        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="mt-8 flex min-w-0 flex-col items-center justify-between gap-4 border-t border-outline-variant/30 px-0 py-6 text-center text-on-surface-variant sm:flex-row sm:text-start">
        <p className="text-label-sm">
          {t("dashboard.footer.copyright", {
            year: String(new Date().getFullYear()),
          })}
        </p>
        <p className="text-label-sm">
          {summary
            ? t("dashboard.footer.tenantPlan", {
                tenant: summary.tenant.name,
                plan: summary.tenant.plan,
              })
            : t("dashboard.footer.fallback")}
        </p>
      </footer>
    </DashboardPageShell>
  );
}
