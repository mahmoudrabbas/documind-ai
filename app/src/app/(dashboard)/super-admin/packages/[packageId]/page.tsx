"use client";

import { useParams } from "next/navigation";
import { useCallback } from "react";
import {
  DashboardPage,
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui/DashboardPage";
import { PackageForm } from "@/components/super-admin/package-form";
import {
  PlatformState,
  usePlatformData,
} from "@/components/super-admin/platform-ui";
import { getPackage } from "@/services/super-admin.service";
export default function PackageDetailPage() {
  const id = String(useParams<{ packageId: string }>().packageId ?? "");
  const loader = useCallback(
    (signal?: AbortSignal) => getPackage(id, signal),
    [id],
  );
  const state = usePlatformData(loader);
  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Package Details"
        description="Update this package to create a new immutable version snapshot."
      />
      <PlatformState
        loading={state.loading}
        error={state.error}
        onRetry={state.reload}
      />
      {state.data ? (
        <>
          <PackageForm existing={state.data} />
          {/* --- Field summary --- */}
          <DashboardPanel className="mt-5">
            <h2 className="text-title-lg font-bold text-primary">
              Current package snapshot
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-3">
              <div>
                <span className="font-semibold text-on-surface-variant">
                  Monthly
                </span>
                <p>
                  {state.data.currency} {state.data.monthlyPrice.toFixed(2)}
                </p>
              </div>
              <div>
                <span className="font-semibold text-on-surface-variant">
                  Annual
                </span>
                <p>
                  {state.data.annualPrice > 0
                    ? `${state.data.currency} ${state.data.annualPrice.toFixed(2)}`
                    : "\u2014"}
                </p>
              </div>
              <div>
                <span className="font-semibold text-on-surface-variant">
                  Trial
                </span>
                <p>
                  {state.data.trialDays > 0
                    ? `${state.data.trialDays}d`
                    : "\u2014"}
                </p>
              </div>
              <div>
                <span className="font-semibold text-on-surface-variant">
                  Visibility
                </span>
                <p className="capitalize">{state.data.visibility}</p>
              </div>
              <div>
                <span className="font-semibold text-on-surface-variant">
                  Analytics
                </span>
                <p className="capitalize">{state.data.analyticsLevel}</p>
              </div>
              <div>
                <span className="font-semibold text-on-surface-variant">
                  Support
                </span>
                <p className="capitalize">{state.data.supportLevel}</p>
              </div>
              <div>
                <span className="font-semibold text-on-surface-variant">
                  Retention
                </span>
                <p>{state.data.retentionDays}d</p>
              </div>
              <div className="md:col-span-2">
                <span className="font-semibold text-on-surface-variant">
                  Models
                </span>
                <p>
                  {state.data.supportedModels.length > 0
                    ? state.data.supportedModels.join(", ")
                    : "\u2014"}
                </p>
              </div>
            </div>
          </DashboardPanel>
          {/* --- Version history --- */}
          <DashboardPanel className="mt-5">
            <h2 className="text-title-lg font-bold text-primary">
              Version history
            </h2>
            <div className="mt-3 divide-y divide-outline-variant/30">
              {[...state.data.versions].reverse().map((version) => (
                <div
                  key={version.version}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                >
                  <strong>Version {version.version}</strong>
                  <span className="text-on-surface-variant">
                    Monthly: {state.data!.currency}{" "}
                    {version.monthlyPrice.toFixed(2)}
                    {version.annualPrice > 0
                      ? ` \u00b7 Annual: ${state.data!.currency} ${version.annualPrice.toFixed(2)}`
                      : ""}
                  </span>
                  <span className="text-on-surface-variant">
                    {new Date(version.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </DashboardPanel>
        </>
      ) : null}
    </DashboardPage>
  );
}
