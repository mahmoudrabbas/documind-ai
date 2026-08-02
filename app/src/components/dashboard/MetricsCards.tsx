"use client";

import { useEffect, useState, useCallback } from "react";
import { getCompanyUsage } from "@/services/entitlement.service";

/* ------------------------------------------------------------------ */
/*  Types & card definitions                                          */
/* ------------------------------------------------------------------ */

interface MetricData {
  dimension: string;
  current: number;
  limit: number;
  showLimit?: boolean;
}

/** Actual backend shape: { current: Record<dimension, number>, limit: Record<dimension, number>, periodStart, periodEnd } */
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
  | { status: "error"; message: string }
  | { status: "success"; metrics: MetricData[] };

const CARD_DEFS = [
  {
    dimension: "documents",
    label: "Total Documents",
    icon: "folder_open",
    iconBg: "bg-primary-container",
    iconColor: "text-on-primary-container",
  },
  {
    dimension: "queriesPerMonth",
    label: "Total Questions",
    icon: "forum",
    iconBg: "bg-secondary-container",
    iconColor: "text-on-secondary-container",
  },
  {
    dimension: "storageMb",
    label: "Storage Used",
    icon: "database",
    iconBg: "bg-tertiary-fixed",
    iconColor: "text-on-tertiary-fixed",
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function usagePercent(current: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min((current / limit) * 100, 100);
}

function statusColor(percent: number): string {
  if (percent > 90) return "#EF4444";
  if (percent >= 70) return "#F59E0B";
  return "#22C55E";
}

function formatValue(value: number, dimension: string): string {
  if (value === 0) return "0";
  if (dimension === "storageMb") {
    if (value >= 1024) return `${(value / 1024).toFixed(1)} GB`;
    return `${value.toLocaleString()} MB`;
  }
  return value.toLocaleString();
}

function formatLimit(value: number, dimension: string): string {
  if (value === 0) return "Unlimited";
  if (dimension === "storageMb") {
    if (value >= 1024) return `${(value / 1024).toFixed(1)} GB`;
    return `${value.toLocaleString()} MB`;
  }
  return value.toLocaleString();
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MetricsCards() {
  const [view, setView] = useState<ViewState>({ status: "loading" });
  const [retryCount, setRetryCount] = useState(0);

  const fetchMetrics = useCallback(async (signal: AbortSignal) => {
    setView({ status: "loading" });
    try {
      const response = await getCompanyUsage(signal);
      if (!response.success) {
        throw new Error("Failed to fetch usage data");
      }
      /* Plan limits and actual dashboard totals are separate concepts. */
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
          // This is an all-time total; do not compare it with a monthly plan
          // limit or present a misleading `total / per-month` progress bar.
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
      setView({
        status: "error",
        message:
          err instanceof Error ? err.message : "Failed to load metrics",
      });
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchMetrics(ctrl.signal);
    return () => ctrl.abort();
  }, [fetchMetrics, retryCount]);

  /* ---- Loading skeleton ----------------------------------------- */
  if (view.status === "loading") {
    return (
      <>
        {[0, 1, 2].map((i) => (
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
              <div className="h-1.5 w-full animate-pulse rounded-full bg-surface-container-high" />
              <div className="h-3 w-28 animate-pulse rounded bg-surface-container-high" />
            </div>
          </div>
        ))}
      </>
    );
  }

  /* ---- Error state ---------------------------------------------- */
  if (view.status === "error") {
    return (
      <>
        <div className="col-span-1 flex min-h-0 min-w-0 flex-col items-center justify-center rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-8 shadow-sm">
          <span className="material-symbols-outlined text-4xl text-error">
            error_outline
          </span>
          <p className="mt-2 text-label-md text-on-surface-variant">
            Failed to load metrics
          </p>
          <button
            type="button"
            onClick={() => setRetryCount((c) => c + 1)}
            className="mt-3 cursor-pointer text-primary underline-offset-2 hover:underline"
          >
            Retry
          </button>
        </div>
      </>
    );
  }

  /* ---- Normal / empty data -------------------------------------- */
  const { metrics } = view;

  return (
    <>
      {CARD_DEFS.map((def) => {
        const match = metrics.find((m) => m.dimension === def.dimension);
        const hasData = match !== undefined;
        const current = match?.current ?? 0;
        const limit = match?.limit ?? 0;
        const showLimit = match?.showLimit !== false && limit > 0;
        const pct = usagePercent(current, limit);

        const displayValue = hasData
          ? formatValue(current, def.dimension)
          : "\u2014";

        return (
          <div
            key={def.dimension}
            className="col-span-1 flex min-h-0 min-w-0 flex-col rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm transition-transform hover:-translate-y-1 lg:p-5"
          >
            {/* Icon */}
            <div className="mb-3 flex items-start justify-between">
              <div
                className={`p-3 ${def.iconBg} ${def.iconColor} rounded-xl`}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  {def.icon}
                </span>
              </div>
            </div>

            {/* Label + value */}
            <p className="text-label-md text-on-surface-variant">
              {def.label}
            </p>
            <h3 className="break-words text-headline-lg font-bold leading-none text-primary sm:text-display-lg">
              {displayValue}
            </h3>

            {/* Status bar (hidden when unlimited) */}
            {hasData && showLimit && (
              <>
                <div className="mt-3 h-1.5 w-full rounded-full bg-surface-container">
                  <div
                    className="h-1.5 rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: statusColor(pct),
                    }}
                  />
                </div>
                <p className="mt-1 text-label-sm text-on-surface-variant">
                  {current.toLocaleString()} /{" "}
                  {formatLimit(limit, def.dimension)} used
                </p>
              </>
            )}

            {/* Unlimited label */}
            {hasData && !showLimit && (
              <p className="mt-1 text-label-sm text-on-surface-variant">
                {current.toLocaleString()} used
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}
