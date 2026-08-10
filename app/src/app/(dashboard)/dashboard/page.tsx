"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { isStandardUserRole } from "@/lib/role-home";
import {
  DashboardPage as DashboardPageShell,
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui/DashboardPage";
import { SubscriptionWidget } from "@/components/billing/SubscriptionWidget";
import MetricsCards from "@/components/dashboard/MetricsCards";
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

export default function DashboardPage() {
  const auth = useAuth();
  const { t, tPlural, dir } = useI18n();
  const intlLocale = useIntlLocale();
  const router = useRouter();
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
    if (isStandardUserRole(auth.user.role)) {
      router.replace("/dashboard/chat");
    }
  }, [auth, router]);

  useEffect(() => {
    if (auth.status !== "authenticated") return;
    if (isStandardUserRole(auth.user.role)) return;
    const ctrl = new AbortController();
    void fetchSummary(ctrl.signal);
    return () => ctrl.abort();
  }, [fetchSummary, retryCount, auth]);

  if (auth.status !== "authenticated") return null;
  if (isStandardUserRole(auth.user.role)) return null;

  const summary = view.status === "success" ? view.summary : null;
  const hasOpenGaps = (summary?.knowledgeGaps.open ?? 0) > 0;

  return (
    <DashboardPageShell dir={dir}>
      <DashboardPageHeader
        title={t("dashboard.title")}
        description={t("dashboard.description")}
        actions={
          <div className="flex w-full flex-wrap gap-3 sm:w-auto">
            {summary ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-label-sm text-on-surface-variant">
                <span className="material-symbols-outlined text-[16px]">
                  schedule
                </span>
                {t("dashboard.updatedAtTime", {
                  time: new Date(summary.generatedAt).toLocaleTimeString(
                    intlLocale,
                  ),
                })}
              </span>
            ) : null}
            <Link
              href="/dashboard/audit"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-outline px-4 py-2 text-label-md font-bold transition-colors hover:bg-surface-container-high"
            >
              <span className="material-symbols-outlined text-[18px]">
                policy
              </span>
              {t("audit.title")}
            </Link>
            <button
              type="button"
              onClick={() => setRetryCount((count) => count + 1)}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-secondary-container px-4 py-2 text-label-md font-bold text-on-secondary-container transition-opacity hover:opacity-90"
            >
              <span className="material-symbols-outlined text-[18px]">
                refresh
              </span>
              {t("dashboard.refresh")}
            </button>
          </div>
        }
      />

      {/* Bento Grid: usage metrics + subscription */}
      <div className="grid min-w-0 auto-rows-auto grid-cols-1 items-start gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4 xl:gap-5">
        <MetricsCards />
        <SubscriptionWidget />
      </div>

      {/* Bento Grid: live tenant summary */}
      <div className="mt-3 grid min-w-0 auto-rows-auto grid-cols-1 items-start gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4 xl:gap-5">
        <SummaryStats summary={summary} />
      </div>

      {view.status === "error" ? (
        <DashboardPanel className="mt-6 flex flex-col items-center justify-center px-4 py-10 text-center">
          <span className="material-symbols-outlined text-4xl text-error">
            error_outline
          </span>
          <p className="mt-2 text-label-md text-on-surface-variant">
            {view.message || t("dashboard.overview.summaryError")}
          </p>
          <button
            type="button"
            onClick={() => setRetryCount((count) => count + 1)}
            className="mt-3 cursor-pointer text-primary underline-offset-2 hover:underline"
          >
            {t("common.retry")}
          </button>
        </DashboardPanel>
      ) : null}

      {view.status === "success" ? (
        <>
          {/* Recent Activity Feed */}
          <DashboardPanel className="mt-6">
            <RecentActivityHeader href="/dashboard/audit" />
            <RecentActivityFeed items={view.summary.recentActivity} />
          </DashboardPanel>

          {/* AI Insight Section */}
          {hasOpenGaps ? (
            <section className="relative mt-6 min-w-0 overflow-hidden rounded-3xl bg-primary-container p-4 text-on-primary sm:p-lg lg:mt-8 lg:p-xl">
              <div className="relative z-10 flex w-full flex-col gap-lg md:flex-row md:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-tertiary text-on-tertiary sm:flex">
                    <span
                      className="material-symbols-outlined"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      auto_awesome
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="mb-3 inline-block rounded-full bg-tertiary px-3 py-1 text-label-sm font-bold text-on-tertiary">
                      {t("dashboard.overview.aiSuggestionEyebrow")}
                    </span>
                    <h3 className="mb-2 text-headline-md font-bold">
                      {t("dashboard.overview.gapsDetectedTitle")}
                    </h3>
                    <p className="max-w-2xl text-body-md leading-relaxed text-on-primary-container">
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
                  className="w-full shrink-0 rounded-2xl bg-surface px-8 py-4 text-center text-label-md font-bold text-primary shadow-xl transition-all hover:scale-105 hover:bg-secondary-container md:w-auto"
                >
                  {t("dashboard.overview.reviewGaps")}
                </Link>
              </div>
            </section>
          ) : null}
        </>
      ) : null}

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
