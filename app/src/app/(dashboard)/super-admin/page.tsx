"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  DashboardPage,
  DashboardPageHeader,
  DashboardPanelHeader,
} from "@/components/ui/DashboardPage";
import { PlatformState, usePlatformData } from "@/components/super-admin/platform-ui";
import { Badge } from "@/components/ui/Badge";
import { getPlatformOverview } from "@/services/super-admin.service";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";
import { cn } from "@/lib/utils";

function PlatformMetricCard({
  label,
  value,
  icon,
  attention = false,
}: {
  label: string;
  value: ReactNode;
  icon: string;
  attention?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[100px] min-w-0 flex-col justify-between gap-2 rounded-lg border p-4",
        attention
          ? "border-error/10 bg-surface-container-lowest"
          : "border-outline-variant/40 bg-surface-container-lowest",
      )}
    >
      <div className="flex min-w-0 items-end justify-between gap-3">
        <p
          className={cn(
            "min-w-0 break-words text-headline-md font-bold",
            attention ? "text-error" : "text-on-surface",
          )}
        >
          {value}
        </p>
        <span
          aria-hidden="true"
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[18px]",
            attention
              ? "bg-error-container text-on-error-container"
              : "bg-surface-container-high text-on-surface-variant",
          )}
        >
          <span className="material-symbols-outlined">{icon}</span>
        </span>
      </div>
      <p className="truncate text-label-sm font-medium text-on-surface-variant">
        {label}
      </p>
    </div>
  );
}

export default function SuperAdminOverviewPage() {
  const { t, dir } = useI18n();
  const intlLocale = useIntlLocale();
  const state = usePlatformData(getPlatformOverview);

  const format = (key: string, value: number) =>
    key === "estimatedCost"
      ? new Intl.NumberFormat(intlLocale, {
          style: "currency",
          currency: "USD",
        }).format(value)
      : key === "storageBytes"
        ? `${(value / 1024 / 1024).toLocaleString(intlLocale, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })} ${t("common.unitMB")}`
        : value.toLocaleString(intlLocale);

  const primaryMetrics: readonly [string, string, string][] = [
    ["companies", t("superAdmin.companies"), "business"],
    ["activeCompanies", t("superAdmin.activeCompanies"), "domain_verification"],
    ["users", t("superAdmin.users"), "group"],
    ["documents", t("superAdmin.documents"), "description"],
  ];

  const operationalMetrics: readonly [string, string, string, boolean][] = [
    ["questions", t("superAdmin.queries"), "forum", false],
    ["estimatedCost", t("superAdmin.estimatedCost"), "payments", false],
    ["failedJobs", t("superAdmin.failedJobs"), "error", true],
    ["storageBytes", t("superAdmin.storage"), "database", false],
  ];

  return (
    <DashboardPage dir={dir}>
      <DashboardPageHeader
        title={t("superAdmin.title")}
        description={t("superAdmin.description")}
        className="mb-8"
      />
      <PlatformState
        loading={state.loading}
        error={state.error}
        onRetry={state.reload}
      />
      {state.data ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4 xl:gap-5">
            {primaryMetrics.map(([key, label, icon]) => (
              <PlatformMetricCard
                key={key}
                label={label}
                value={format(key, state.data!.metrics[key] ?? 0)}
                icon={icon}
              />
            ))}
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4 xl:gap-5">
            {operationalMetrics.map(([key, label, icon, attention]) => (
              <PlatformMetricCard
                key={key}
                label={label}
                value={format(key, state.data!.metrics[key] ?? 0)}
                icon={icon}
                attention={attention}
              />
            ))}
          </div>

          <section className="mt-8">
            <DashboardPanelHeader
              icon="history"
              title={t("superAdmin.recentActivity")}
              action={
                <Link
                  href="/super-admin/audit"
                  className="inline-flex items-center gap-1 text-label-md font-semibold text-primary transition-colors hover:text-primary/80 hover:underline"
                >
                  {t("dashboard.viewAll")}
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-[16px] rtl:rotate-180"
                  >
                    arrow_forward
                  </span>
                </Link>
              }
            />
            {state.data.recentAudit.length ? (
              <ul className="divide-y divide-outline-variant/40 overflow-hidden rounded-lg border border-outline-variant/40 bg-surface-container-lowest">
                {state.data.recentAudit.map((item) => {
                  const outcomeLower = item.outcome.toLowerCase();
                  const isSuccess = outcomeLower === "success";
                  const actorName =
                    !item.actorEmail ||
                    item.actorEmail.toLowerCase() === "system"
                      ? t("dashboard.system")
                      : item.actorEmail;
                  const roleLabel = item.actorRole
                    ? codeLabel(t, "audit.actorRole", item.actorRole)
                    : null;
                  return (
                    <li
                      key={item._id}
                      className="flex min-w-0 flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body-md font-semibold text-on-surface">
                          {codeLabel(t, "audit.action", item.action)}
                        </p>
                        <p className="mt-0.5 truncate text-label-sm text-on-surface-variant">
                          {actorName}
                          {roleLabel ? ` · ${roleLabel}` : ""}
                          {" · "}
                          {codeLabel(t, "audit.resource", item.resourceType)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <time
                          dateTime={item.createdAt}
                          className="text-label-sm text-on-surface-variant"
                        >
                          {new Date(item.createdAt).toLocaleString(intlLocale)}
                        </time>
                        <Badge
                          status={item.outcome}
                          label={codeLabel(
                            t,
                            "superAdmin.auditOutcome",
                            item.outcome,
                          )}
                          className={cn(
                            "shrink-0",
                            isSuccess &&
                              "bg-transparent text-success ring-0 hover:bg-transparent",
                          )}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-4 py-8 text-center text-body-sm text-on-surface-variant">
                {t("superAdmin.noRecentActivity")}
              </p>
            )}
          </section>
        </>
      ) : null}
    </DashboardPage>
  );
}
