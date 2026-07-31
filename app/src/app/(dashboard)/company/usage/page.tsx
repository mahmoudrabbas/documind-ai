"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DashboardPage,
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui/DashboardPage";
import { QuotaProgressBar } from "@/components/entitlement/QuotaProgressBar";
import { UpgradePrompt } from "@/components/entitlement/UpgradePrompt";
import { getCompanyUsage } from "@/services/entitlement.service";
import { mapEntitlementError } from "@/lib/entitlement-errors";
import { useAuth } from "@/providers/auth-provider";
import { usePermissions } from "@/providers/permission-provider";
import { useI18n } from "@/providers/i18n-provider";
import { Permission } from "@/types/api/permissions.types";
import type { EntitlementUsageResponse } from "@/types/api/entitlement.types";

/* ── Dimension label resolution ──────────────────────────────────── */

const DIMENSION_LABEL_KEYS: Record<string, string> = {
  employees: "usage.dimension.employees",
  admins: "usage.dimension.admins",
  documents: "usage.dimension.documents",
  storageMb: "usage.dimension.storageMb",
  fileSizeMb: "usage.dimension.fileSizeMb",
  queriesPerMonth: "usage.dimension.queriesPerMonth",
  tokensPerMonth: "usage.dimension.tokensPerMonth",
  ocrPagesPerMonth: "usage.dimension.ocrPagesPerMonth",
};

function resolveDimensionLabel(t: (key: string) => string, dimension: string): string {
  const key = DIMENSION_LABEL_KEYS[dimension];
  if (key) {
    const label = t(key);
    if (label !== key) return label;
  }
  /* Fallback: camelCase → Title Case */
  return dimension
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^[a-z]/, (c) => c.toUpperCase());
}

function formatDimensionValue(dimension: string, value: number): string {
  if (dimension === "storageMb" || dimension === "fileSizeMb") {
    if (value >= 1024) return `${(value / 1024).toFixed(1)} GB`;
    return `${value} MB`;
  }
  if (dimension === "tokensPerMonth") {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toLocaleString();
  }
  return value.toLocaleString();
}

function getUsagePercentage(current: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((current / limit) * 100));
}

/* ── Skeleton loading card ──────────────────────────────────────── */

function SkeletonCard() {
  return (
    <div className="flex min-h-0 min-w-0 animate-pulse flex-col gap-4 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm lg:p-5">
      <div className="h-5 w-2/3 rounded bg-surface-container-high" />
      <div className="h-3 w-1/3 rounded bg-surface-container-high" />
      <div className="mt-1 h-2 w-full rounded-full bg-surface-container-high" />
      <div className="flex items-center justify-between">
        <div className="h-4 w-20 rounded bg-surface-container-high" />
        <div className="h-4 w-16 rounded bg-surface-container-high" />
      </div>
    </div>
  );
}

/* ── Usage dimension card ───────────────────────────────────────── */

function UsageCard({
  dimension,
  current,
  limit,
  periodReset,
  hasBillingPermission,
  onUpgradeClick,
  dir,
  t,
}: {
  dimension: string;
  current: number;
  limit: number;
  periodReset?: string;
  hasBillingPermission: boolean;
  onUpgradeClick: () => void;
  dir: "ltr" | "rtl";
  t: (key: string) => string;
}) {
  const pct = getUsagePercentage(current, limit);
  const label = resolveDimensionLabel(t, dimension);

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-3">
      {/* Quota bar card (label, progress, current/limit, reset date) */}
      <QuotaProgressBar
        label={label}
        current={current}
        limit={limit}
        dimension={dimension}
        periodReset={periodReset}
        dir={dir}
      />

      {/* Upgrade prompt — renders itself only at >= 80% of limit */}
      <UpgradePrompt
        dimension={dimension}
        current={current}
        limit={limit}
        onUpgradeClick={onUpgradeClick}
        hasBillingPermission={hasBillingPermission}
        warningThreshold={0.8}
      />
    </div>
  );
}

/* ── Empty state ────────────────────────────────────────────────── */

function EmptyState({ t }: { t: (key: string) => string }) {
  return (
    <DashboardPanel>
      <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
        {/* Inline SVG illustration */}
        <svg
          width="120"
          height="120"
          viewBox="0 0 120 120"
          fill="none"
          aria-hidden="true"
          className="text-outline-variant"
        >
          <rect
            x="20"
            y="30"
            width="80"
            height="60"
            rx="8"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M40 50h40M40 62h28M40 74h16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M60 90v10M50 105h20"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="88" cy="88" r="12" fill="currentColor" opacity="0.15" />
          <path
            d="M84 88h8M88 84v8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <h3 className="text-title-lg font-bold text-on-surface">
          {t("usage.emptyTitle")}
        </h3>
        <p className="max-w-xs text-body-md text-on-surface-variant">
          {t("usage.emptyDescription")}
        </p>
      </div>
    </DashboardPanel>
  );
}

/* ── Error state ────────────────────────────────────────────────── */

function ErrorState({
  message,
  onRetry,
  t,
}: {
  message: string;
  onRetry: () => void;
  t: (key: string) => string;
}) {
  return (
    <DashboardPanel>
      <div
        role="alert"
        className="rounded-xl border border-error/20 bg-error-container p-4 text-on-error-container"
      >
        <p className="text-body-md font-medium">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 min-h-10 rounded-lg bg-error px-4 py-2 text-label-md font-bold text-on-error transition-opacity hover:opacity-90"
        >
          {t("common.retry")}
        </button>
      </div>
    </DashboardPanel>
  );
}

/* ── Page ───────────────────────────────────────────────────────── */

export default function CompanyUsagePage() {
  const auth = useAuth();
  const permissions = usePermissions();
  const { dir, t } = useI18n();
  const router = useRouter();

  const [usage, setUsage] = useState<EntitlementUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [subscriptionInactive, setSubscriptionInactive] = useState(false);

  const hasBillingPermission =
    auth.status === "authenticated" && permissions.can(Permission.BILLING_MANAGE);

  const fetchUsage = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    setSubscriptionInactive(false);
    try {
      const response = await getCompanyUsage(signal);
      setUsage(response.data);
    } catch (err) {
      if (!signal?.aborted) {
        if (mapEntitlementError(err)?.kind === "subscription-inactive") {
          setSubscriptionInactive(true);
        } else {
          setError(
            err instanceof Error ? err.message : t("usage.fetchError"),
          );
        }
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void fetchUsage(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fetchUsage]);

  /* Guard: unauthenticated */
  if (auth.status !== "authenticated") return null;

  const isEmployee = auth.user.role === "EMPLOYEE";

  /* Map the backend records into per-dimension card inputs. */
  const dimensions = usage
    ? Object.entries(usage.current).map(([dimension, current]) => ({
        dimension,
        current,
        limit: usage.limit[dimension] ?? 0,
      }))
    : [];
  const periodReset = usage?.periodEnd ?? undefined;

  return (
    <DashboardPage dir={dir}>
      <DashboardPageHeader
        title={t("usage.pageTitle")}
        description={t("usage.pageDescription")}
      />

      {/* Loading state */}
      {loading ? (
        <div
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 lg:gap-5"
          role="status"
          aria-label={t("common.loading")}
        >
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : null}

      {/* Subscription inactive state (403 SUBSCRIPTION_INACTIVE) */}
      {!loading && subscriptionInactive ? (
        <DashboardPanel>
          <UpgradePrompt
            variant="subscription-inactive"
            dimension="subscription"
            onUpgradeClick={() => router.push("/checkout")}
            hasBillingPermission={hasBillingPermission}
            title={t("entitlement.denial.subscriptionInactiveTitle")}
            description={t("entitlement.denial.subscriptionInactiveDescription")}
            ctaLabel={t("entitlement.denial.reactivateCta")}
            hintLabel={t("entitlement.denial.reactivateHint")}
          />
        </DashboardPanel>
      ) : null}

      {/* Error state */}
      {!loading && error ? (
        <ErrorState message={error} onRetry={() => fetchUsage()} t={t} />
      ) : null}

      {/* Empty state */}
      {!loading && !error && usage && dimensions.length === 0 ? (
        <EmptyState t={t} />
      ) : null}

      {/* Data state */}
      {!loading && !error && dimensions.length > 0 ? (
        <>
          {/* Employee note about read-only view */}
          {isEmployee ? (
            <DashboardPanel tone="muted" padding="compact">
              <p className="text-body-sm text-on-surface-variant">
                {t("usage.readOnlyNote")}
              </p>
            </DashboardPanel>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 lg:gap-5">
            {dimensions.map((item) => (
              <UsageCard
                key={item.dimension}
                dimension={item.dimension}
                current={item.current}
                limit={item.limit}
                periodReset={periodReset}
                hasBillingPermission={hasBillingPermission}
                onUpgradeClick={() => router.push("/checkout")}
                dir={dir}
                t={t}
              />
            ))}
          </div>
        </>
      ) : null}
    </DashboardPage>
  );
}
