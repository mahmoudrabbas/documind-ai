"use client";

import { useEffect, useState, useCallback, type HTMLAttributes } from "react";
import { getCompanyUsage } from "@/services/entitlement.service";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { cn } from "@/lib/utils";
import { DashboardPanel, DashboardPanelHeader } from "@/components/ui/DashboardPage";
import { Alert } from "@/components/ui/Alert";
import { getQuotaBarColor } from "@/components/entitlement/QuotaProgressBar";
import { mbPerGb, mbToGb } from "@/lib/storage";

/* ------------------------------------------------------------------ */
/*  Types & row definitions                                           */
/* ------------------------------------------------------------------ */

interface MetricData {
  dimension: string;
  current: number;
  limit: number;
  showLimit?: boolean;
}

interface UsageApiResponse {
  current: Record<string, number>;
  limit: Record<string, number>;
  actual?: {
    documents: number;
    storageBytes: number;
    questions: number;
  };
  periodStart: string;
  periodEnd: string | null;
}

type ViewState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "success"; metrics: MetricData[] };

const ROW_DEFS = [
  {
    dimension: "documents",
    labelKey: "dashboard.totalDocuments",
    icon: "folder_open",
    iconBg: "bg-primary-container text-on-primary-container",
  },
  {
    dimension: "queriesPerMonth",
    labelKey: "dashboard.totalQuestions",
    icon: "forum",
    iconBg: "bg-secondary-container text-on-secondary-container",
  },
  {
    dimension: "storageMb",
    labelKey: "dashboard.storageUsed",
    icon: "database",
    iconBg: "bg-tertiary-fixed text-on-tertiary-fixed",
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function usagePercent(current: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min((current / limit) * 100, 100);
}

function formatValue(
  value: number,
  dimension: string,
  t: (key: string) => string,
  locale: string,
  gbDivisor: 1000 | 1024,
): string {
  if (value === 0) return "0";
  if (dimension === "storageMb") {
    if (value >= 1000) {
      const gb = mbToGb(value, gbDivisor);
      return `${gb.toLocaleString(locale, {
        maximumFractionDigits: gb < 10 ? 1 : 0,
      })} ${t("common.unitGB")}`;
    }
    return `${Math.round(value).toLocaleString(locale)} ${t("common.unitMB")}`;
  }
  return value.toLocaleString(locale);
}

function formatLimit(
  value: number,
  dimension: string,
  t: (key: string) => string,
  locale: string,
  gbDivisor: 1000 | 1024,
): string {
  if (value === 0) return t("common.unlimited");
  if (dimension === "storageMb") {
    if (value >= 1000) {
      return `${Math.round(mbToGb(value, gbDivisor))} ${t("common.unitGB")}`;
    }
    return `${value.toLocaleString(locale)} ${t("common.unitMB")}`;
  }
  return value.toLocaleString(locale);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function UsageQuotaPanel(props: HTMLAttributes<HTMLElement>) {
  const [view, setView] = useState<ViewState>({ status: "loading" });
  const [retryCount, setRetryCount] = useState(0);
  const { t } = useI18n();
  const intlLocale = useIntlLocale();

  const fetchMetrics = useCallback(async (signal: AbortSignal) => {
    setView({ status: "loading" });
    try {
      const response = await getCompanyUsage(signal);
      if (!response.success) {
        throw new Error("Failed to fetch usage data");
      }
      const raw = response.data as unknown as UsageApiResponse;
      const actual = raw.actual;
      const metrics: MetricData[] = [
        {
          dimension: "documents",
          current: actual?.documents ?? raw.current.documents ?? 0,
          limit: raw.limit.documents ?? 0,
        },
        {
          dimension: "queriesPerMonth",
          current: actual?.questions ?? raw.current.queriesPerMonth ?? 0,
          // All-time total question count
          limit: 0,
          showLimit: false,
        },
        {
          dimension: "storageMb",
          current: actual
            ? actual.storageBytes / (1024 * 1024)
            : raw.current.storageMb ?? 0,
          limit: raw.limit.storageMb ?? 0,
        },
      ];
      setView({ status: "success", metrics });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setView({ status: "error" });
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchMetrics(ctrl.signal);
    return () => ctrl.abort();
  }, [fetchMetrics, retryCount]);

  return (
    <DashboardPanel {...props} className={cn("shadow-card", props.className)}>
      <DashboardPanelHeader icon="pie_chart" title={t("usage.pageTitle")} />

      {/* ---- Loading skeleton ---- */}
      {view.status === "loading" ? (
        <div className="flex flex-col gap-3 pt-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/30 p-3.5"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="h-9 w-9 shrink-0 animate-pulse rounded-xl bg-surface-container-high" />
                  <div className="h-4 w-28 animate-pulse rounded-md bg-surface-container-high" />
                </div>
                <div className="h-4 w-24 animate-pulse rounded-md bg-surface-container-high" />
              </div>
              <div className="mt-3 h-2 w-full animate-pulse rounded-full bg-surface-container-high" />
            </div>
          ))}
        </div>
      ) : null}

      {/* ---- Error ---- */}
      {view.status === "error" ? (
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{t("dashboard.overview.summaryError")}</span>
            <button
              type="button"
              onClick={() => setRetryCount((c) => c + 1)}
              className="cursor-pointer font-semibold underline-offset-2 hover:underline"
            >
              {t("common.retry")}
            </button>
          </div>
        </Alert>
      ) : null}

      {/* ---- Quota rows ---- */}
      {view.status === "success" ? (
        <div className="flex flex-col gap-3 pt-1">
          {ROW_DEFS.map((def) => {
            const match = view.metrics.find(
              (m) => m.dimension === def.dimension,
            );
            const current = match?.current ?? 0;
            const limit = match?.limit ?? 0;
            const capped = match?.showLimit !== false && limit > 0;
            const pct = usagePercent(current, limit);
            const label = t(def.labelKey);
            const gbDivisor = mbPerGb(limit > 0 ? limit : current);
            const currentLabel = match
              ? formatValue(current, def.dimension, t, intlLocale, gbDivisor)
              : "0";
            const limitLabel = capped
              ? formatLimit(limit, def.dimension, t, intlLocale, gbDivisor)
              : null;

            return (
              <div
                key={def.dimension}
                className="rounded-2xl border border-outline-variant/30 bg-surface-container-low/30 p-3.5 transition-all duration-200 hover:border-outline-variant/60 hover:bg-surface-container-low/60"
              >
                <div className="flex items-center justify-between gap-3">
                  {/* Left side: Icon + Metric Label */}
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                        def.iconBg,
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className="material-symbols-outlined text-[20px]"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        {def.icon}
                      </span>
                    </div>
                    <span className="truncate text-title-sm font-semibold text-on-surface">
                      {label}
                    </span>
                  </div>

                  {/* Right side: Value / Limit + Status Badge */}
                  <div className="flex shrink-0 items-center gap-2">
                    {capped ? (
                      <>
                        <span
                          dir="ltr"
                          className="inline-flex items-baseline text-label-sm text-on-surface-variant"
                        >
                          <span className="text-title-sm font-bold text-on-surface">
                            {currentLabel}
                          </span>
                          {" / "}
                          <span className="font-medium text-on-surface-variant">
                            {limitLabel}
                          </span>
                        </span>
                        <span className="rounded-md bg-surface-container-high px-2 py-0.5 text-label-xs font-semibold text-on-surface-variant">
                          {pct < 0.1 && pct > 0 ? "<1%" : `${Math.round(pct)}%`}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-title-sm font-bold text-on-surface">
                          {currentLabel}
                        </span>
                        <span className="rounded-md bg-surface-container-high px-2 py-0.5 text-label-xs font-medium text-on-surface-variant">
                          {t("dashboard.allTimeTotal")}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Progress bar for capped items */}
                {capped ? (
                  <div
                    role="progressbar"
                    aria-label={label}
                    aria-valuenow={Math.round(current)}
                    aria-valuemin={0}
                    aria-valuemax={Math.round(limit)}
                    className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high"
                  >
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500 ease-out",
                        getQuotaBarColor(pct, false),
                      )}
                      style={{
                        width: `${Math.max(pct, current > 0 ? 1.5 : 0)}%`,
                      }}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </DashboardPanel>
  );
}
