"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/providers/auth-provider";
import { usePermissions } from "@/providers/permission-provider";
import { Permission } from "@/types/api/permissions.types";
import { getSubscriptionStatus } from "@/services/billing.service";
import type { SubscriptionStatus } from "@/types/api/billing.types";
import { ApiError } from "@/lib/api-client";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";
import {
  formatPrice,
  formatNullableDate,
  getDaysRemaining,
} from "@/lib/billing.helpers";
import { DashboardPanel, Badge, Skeleton, Button } from "@/components/ui";
import { SUBSCRIPTION_BADGE_STATUS } from "@/components/ui/variants";

/* ── State machine ─────────────────────────────────────────────────── */

type WidgetState =
  | { phase: "loading" }
  | { phase: "error"; message: string; isNotFound: boolean }
  | { phase: "active"; subscription: SubscriptionStatus };

/* ── Entitlement grid helpers ──────────────────────────────────────── */

type TranslateFn = (key: string, params?: Record<string, string>) => string;
type PluralFn = (key: string, count: number, params?: Record<string, string>) => string;

function formatStorage(mb: number, t: TranslateFn): string {
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${gb % 1 === 0 ? gb : gb.toFixed(1)} ${t("common.unitGB")}`;
  }
  return `${mb} ${t("common.unitMB")}`;
}

interface EntitlementRow {
  /** Untranslated row identifier — used as the React key so the list
      stays keyed on a machine code rather than on display text. */
  id: string;
  label: string;
  value: string;
}

function getEntitlementRows(
  e: SubscriptionStatus["packageId"]["entitlements"],
  t: TranslateFn,
  tPlural: PluralFn,
  intlLocale: string,
): EntitlementRow[] {
  return [
    {
      id: "employees",
      label: t("billing.entitlementLabelEmployees"),
      value: tPlural("billing.entitlementEmployees", e.employees),
    },
    {
      id: "documents",
      label: t("billing.entitlementLabelDocuments"),
      value: e.documents.toLocaleString(intlLocale),
    },
    {
      id: "storage",
      label: t("billing.entitlementLabelStorage"),
      value: formatStorage(e.storageMb, t),
    },
    {
      id: "queries",
      label: t("billing.entitlementLabelQueries"),
      value: t("billing.entitlementQueriesShort", {
        count: e.queriesPerMonth.toLocaleString(intlLocale),
      }),
    },
  ];
}

/* ── Component ─────────────────────────────────────────────────────── */

export function SubscriptionWidget() {
  const { t, tPlural } = useI18n();
  const intlLocale = useIntlLocale();
  const auth = useAuth();
  const permissions = usePermissions();

  const canReadBilling =
    auth.status === "authenticated" &&
    permissions.can(Permission.BILLING_READ);
  const [state, setState] = useState<WidgetState>({ phase: "loading" });
  const [fetchKey, setFetchKey] = useState(0);

  /* ── Fetch subscription data ──────────────────────────────────── */

  useEffect(() => {
    if (!canReadBilling) return;

    const controller = new AbortController();
    setState({ phase: "loading" });

    getSubscriptionStatus(controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          setState({ phase: "active", subscription: res.data });
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        const isNotFound = err instanceof ApiError && err.status === 404;
        setState({
          phase: "error",
          message: isNotFound
            ? "No active subscription"
            : "Could not load subscription data",
          isNotFound,
        });
      });

    return () => controller.abort();
  }, [canReadBilling, fetchKey]);

  /* ── Retry handler ────────────────────────────────────────────── */

  const handleRetry = useCallback(() => {
    setFetchKey((k) => k + 1);
  }, []);

  /* ── Render: No permission ────────────────────────────────────── */

  if (!canReadBilling) return null;

  /* ── Render: Loading ──────────────────────────────────────────── */

  if (state.phase === "loading") {
    return (
      <DashboardPanel padding="compact">
        <div className="space-y-3" role="status">
          <Skeleton className="h-6 w-48 rounded-lg" />
          <Skeleton className="h-4 w-32 rounded-lg" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <span className="sr-only">Loading subscription&hellip;</span>
        </div>
      </DashboardPanel>
    );
  }

  /* ── Render: Error / No subscription ──────────────────────────── */

  if (state.phase === "error") {
    if (state.isNotFound) {
      return (
        <DashboardPanel padding="compact">
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="material-symbols-outlined text-[36px] text-on-surface-variant">
              credit_card_off
            </span>
            <div>
              <h3 className="text-title-lg font-bold text-on-surface">
                No active subscription
              </h3>
              <p className="mt-1 text-body-sm text-on-surface-variant">
                You don&apos;t currently have an active subscription plan.
              </p>
            </div>
            <Link href="/checkout">
              <Button variant="primary" size="md">
                View Plans
              </Button>
            </Link>
          </div>
        </DashboardPanel>
      );
    }

    return (
      <DashboardPanel padding="compact">
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="material-symbols-outlined text-[36px] text-error">
            error
          </span>
          <p className="text-body-sm text-on-surface-variant">
            {state.message}
          </p>
          <Button variant="outline" size="sm" onClick={handleRetry}>
            Retry
          </Button>
        </div>
      </DashboardPanel>
    );
  }

  /* ── Render: Active subscription ──────────────────────────────── */

  const { subscription: sub } = state;
  const pkg = sub.packageId;
  const entitlements = getEntitlementRows(
    pkg.entitlements,
    t,
    tPlural,
    intlLocale,
  );

  return (
    <DashboardPanel padding="compact">
      {/* Header row: plan name + status badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">
            <span
              className="material-symbols-outlined text-[20px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              workspace_premium
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-title-lg font-bold text-on-surface truncate capitalize">
              {pkg.name}
            </h3>
            <p className="text-label-sm text-on-surface-variant truncate">
              {t("billing.paymentLabel", {
                state: codeLabel(t, "billing.paymentState", sub.paymentState),
              })}
            </p>
          </div>
        </div>
        <Badge
          status={SUBSCRIPTION_BADGE_STATUS[sub.status] ?? "neutral"}
          label={codeLabel(t, "billing.subscriptionStatus", sub.status)}
          className="shrink-0"
        />
      </div>

      {/* Divider */}
      <div className="my-3.5 h-px bg-outline-variant/30" />

      {/* Billing period & trial info */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-body-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-[16px] shrink-0">
            calendar_month
          </span>
          <span className="truncate text-label-md">
            Billing Period:{" "}
            <span className="font-medium text-on-surface">
              {formatNullableDate(sub.periodStart)}
            </span>
            <span className="mx-1">&mdash;</span>
            <span className="font-medium text-on-surface">
              {formatNullableDate(sub.periodEnd)}
            </span>
          </span>
        </div>

        {/* Trial info (only when TRIALING) */}
        {sub.status === "TRIALING" && sub.trialEnd ? (
          <div className="flex items-center gap-1.5 text-body-sm text-tertiary">
            <span className="material-symbols-outlined text-[16px] shrink-0">
              schedule
            </span>
            <span className="truncate text-label-md">
              Trial: {formatNullableDate(sub.trialStart)}&nbsp;&mdash;
              {formatNullableDate(sub.trialEnd)}
              {getDaysRemaining(sub.trialEnd) !== null && (
                <span className="ms-1 font-medium">
                  ({getDaysRemaining(sub.trialEnd)}d left)
                </span>
              )}
            </span>
          </div>
        ) : null}

        {/* Cancel at period end warning */}
        {sub.cancelAtPeriodEnd ? (
          <div className="flex items-center gap-1.5 text-body-sm text-warning">
            <span className="material-symbols-outlined text-[16px] shrink-0">
              warning
            </span>
            <span className="font-medium text-label-md">Cancels at period end</span>
          </div>
        ) : null}
      </div>

      {/* Divider */}
      <div className="my-3.5 h-px bg-outline-variant/30" />

      {/* Entitlements grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {entitlements.map((item) => (
          <div key={item.id} className="min-w-0">
            <p className="text-label-sm text-on-surface-variant truncate">
              {item.label}
            </p>
            <p className="mt-0.5 text-title-md font-bold leading-tight text-on-surface break-words">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div className="my-3.5 h-px bg-outline-variant/30" />

      {/* Footer: price + manage billing */}
      <div className="flex flex-col gap-3">
        <p className="text-body-sm text-on-surface-variant">
          <span className="font-semibold text-on-surface">
            {formatPrice(pkg.monthlyPrice, pkg.currency)}
          </span>
          /mo
          {pkg.annualPrice > 0 ? (
            <span>
              {" "}or{" "}
              <span className="font-semibold text-on-surface">
                {formatPrice(pkg.annualPrice, pkg.currency)}
              </span>
              /yr
            </span>
          ) : null}
        </p>

        {sub.canOpenPortal ? (
          <Link
            href="/dashboard/settings/billing"
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-outline bg-transparent px-4 py-2 font-bold text-on-surface transition-colors hover:bg-surface-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <span className="material-symbols-outlined text-[18px]">
              account_balance
            </span>
            {t("billingAdmin.title")}
          </Link>
        ) : null}
      </div>
    </DashboardPanel>
  );
}
