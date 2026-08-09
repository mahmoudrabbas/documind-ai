"use client";

import {
  DashboardPage,
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui/DashboardPage";
import { StatCard } from "@/components/ui/StatCard";
import {
  PlatformState,
  StatusPill,
  usePlatformData,
} from "@/components/super-admin/platform-ui";
import { getPlatformOverview } from "@/services/super-admin.service";
import { useI18n } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";

export default function SuperAdminOverviewPage() {
  const { t, dir } = useI18n();
  const state = usePlatformData(getPlatformOverview);

  const metrics: readonly [string, string, string][] = [
    ["companies", t("superAdmin.companies"), "business"],
    ["activeCompanies", t("superAdmin.activeCompanies"), "domain_verification"],
    ["users", t("superAdmin.users"), "group"],
    ["documents", t("superAdmin.documents"), "description"],
    ["questions", t("superAdmin.queries"), "forum"],
    ["estimatedCost", t("superAdmin.estimatedCost"), "payments"],
    ["failedJobs", t("superAdmin.failedJobs"), "error"],
    ["storageBytes", t("superAdmin.storage"), "database"],
  ];

  const format = (key: string, value: number) =>
    key === "estimatedCost"
      ? `$${value.toFixed(2)}`
      : key === "storageBytes"
        ? `${(value / 1024 / 1024).toFixed(1)} MB`
        : value.toLocaleString();

  return (
    <DashboardPage dir={dir}>
      <DashboardPageHeader
        title={t("superAdmin.title")}
        description={t("superAdmin.description")}
      />
      <PlatformState
        loading={state.loading}
        error={state.error}
        onRetry={state.reload}
      />
      {state.data ? (
        <>
          <div className="grid auto-rows-auto items-start gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4 xl:gap-5">
            {metrics.map(([key, label, icon]) => (
              <StatCard
                key={key}
                label={label}
                value={format(key, state.data!.metrics[key] ?? 0)}
                icon={<span className="material-symbols-outlined">{icon}</span>}
              />
            ))}
          </div>
          <DashboardPanel className="mt-5">
            <h2 className="text-title-lg font-bold text-primary">
              Recent administrative activity
            </h2>
            <div className="mt-4 divide-y divide-outline-variant/30">
              {state.data.recentAudit.length ? (
                state.data.recentAudit.map((item) => (
                  <div
                    key={item._id}
                    className="flex min-w-0 flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-on-surface">
                        {item.action.replaceAll("_", " ")}
                      </p>
                      <p className="truncate text-sm text-on-surface-variant">
                        {item.actorEmail} · {item.resourceType}
                      </p>
                    </div>
                    <StatusPill
                      value={item.actorRole ?? "unknown"}
                      label={codeLabel(t, "audit.actorRole", item.actorRole ?? "unknown")}
                    />
                  </div>
                ))
              ) : (
                <p className="py-6 text-center text-on-surface-variant">
                  No administrative activity yet.
                </p>
              )}
            </div>
          </DashboardPanel>
        </>
      ) : null}
    </DashboardPage>
  );
}
