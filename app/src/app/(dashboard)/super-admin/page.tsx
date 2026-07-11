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

const metrics = [
  ["companies", "Total Companies", "business"],
  ["activeCompanies", "Active Companies", "domain_verification"],
  ["users", "Platform Users", "group"],
  ["documents", "Documents", "description"],
  ["questions", "Queries", "forum"],
  ["estimatedCost", "Estimated Cost", "payments"],
  ["failedJobs", "Failed Jobs", "error"],
  ["storageBytes", "Storage", "database"],
] as const;

export default function SuperAdminOverviewPage() {
  const state = usePlatformData(getPlatformOverview);
  const format = (key: string, value: number) =>
    key === "estimatedCost"
      ? `$${value.toFixed(2)}`
      : key === "storageBytes"
        ? `${(value / 1024 / 1024).toFixed(1)} MB`
        : value.toLocaleString();
  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Platform Overview"
        description="Monitor companies, usage, processing, and operational activity across DocuMind AI."
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
                    <StatusPill value={item.actorRole} />
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
