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
          <DashboardPanel className="mt-5">
            <h2 className="text-title-lg font-bold text-primary">
              Version history
            </h2>
            <div className="mt-3 divide-y divide-outline-variant/30">
              {[...state.data.versions].reverse().map((version) => (
                <div
                  key={version.version}
                  className="flex flex-wrap justify-between gap-3 py-3 text-sm"
                >
                  <strong>Version {version.version}</strong>
                  <span>
                    {state.data!.currency} {version.monthlyPrice.toFixed(2)}
                  </span>
                  <span>{new Date(version.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </DashboardPanel>
        </>
      ) : null}
    </DashboardPage>
  );
}
