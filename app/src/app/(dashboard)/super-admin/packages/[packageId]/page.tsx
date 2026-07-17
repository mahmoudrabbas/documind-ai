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

const label = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (l) => l.toUpperCase());

function DetailRow({
  label: lbl,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-outline-variant/20 pb-2 text-sm">
      <span className="font-medium text-on-surface-variant">{lbl}</span>
      <span className="font-semibold text-on-surface">
        {value ?? "—"}
      </span>
    </div>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

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

          {/* ─── FR-PAY-001 detail summary ─── */}
          <DashboardPanel className="mt-5">
            <h2 className="text-title-lg font-bold text-primary">
              Commercial details
            </h2>
            <div className="mt-4 grid gap-6 md:grid-cols-2">
              <DetailSection title="Pricing">
                <DetailRow
                  label="Monthly price"
                  value={`${state.data.currency} ${state.data.monthlyPrice.toFixed(2)}`}
                />
                <DetailRow
                  label="Annual price"
                  value={
                    state.data.annualPrice > 0
                      ? `${state.data.currency} ${state.data.annualPrice.toFixed(2)}`
                      : "Not set"
                  }
                />
                <DetailRow label="Currency" value={state.data.currency} />
                <DetailRow
                  label="Trial days"
                  value={
                    state.data.trialDays > 0
                      ? `${state.data.trialDays} days`
                      : "No trial"
                  }
                />
              </DetailSection>

              <DetailSection title="Visibility">
                <DetailRow label="Visibility" value={state.data.visibility} />
              </DetailSection>

              <DetailSection title="Entitlements">
                <DetailRow
                  label="Employees"
                  value={state.data.entitlements?.employees?.toLocaleString() ?? state.data.limits.users}
                />
                <DetailRow
                  label="Admins"
                  value={state.data.entitlements?.admins?.toLocaleString() ?? "—"}
                />
                <DetailRow
                  label="Documents"
                  value={state.data.entitlements?.documents?.toLocaleString() ?? state.data.limits.documents}
                />
                <DetailRow
                  label="Storage"
                  value={
                    state.data.entitlements?.storageMb
                      ? `${state.data.entitlements.storageMb} MB`
                      : `${state.data.limits.storageMb} MB`
                  }
                />
                <DetailRow
                  label="Max file size"
                  value={
                    state.data.entitlements?.fileSizeMb
                      ? `${state.data.entitlements.fileSizeMb} MB`
                      : "—"
                  }
                />
                <DetailRow
                  label="Queries / month"
                  value={(
                    state.data.entitlements?.queriesPerMonth ??
                    state.data.limits.questionsPerMonth
                  )?.toLocaleString()}
                />
                <DetailRow
                  label="Tokens / month"
                  value={
                    state.data.entitlements?.tokensPerMonth
                      ? state.data.entitlements.tokensPerMonth.toLocaleString()
                      : "—"
                  }
                />
                <DetailRow
                  label="OCR pages / month"
                  value={
                    state.data.entitlements?.ocrPagesPerMonth
                      ? state.data.entitlements.ocrPagesPerMonth.toLocaleString()
                      : "—"
                  }
                />
              </DetailSection>

              <DetailSection title="Features">
                <DetailRow
                  label="Supported models"
                  value={
                    state.data.supportedModels?.length
                      ? state.data.supportedModels.join(", ")
                      : "—"
                  }
                />
                <DetailRow
                  label="Analytics level"
                  value={
                    state.data.analyticsLevel
                      ? label(state.data.analyticsLevel)
                      : "—"
                  }
                />
                <DetailRow
                  label="Retention"
                  value={
                    state.data.retentionDays
                      ? `${state.data.retentionDays} days`
                      : "—"
                  }
                />
                <DetailRow
                  label="Support level"
                  value={
                    state.data.supportLevel
                      ? label(state.data.supportLevel)
                      : "—"
                  }
                />
              </DetailSection>
            </div>
          </DashboardPanel>

          {/* ─── Version history ─── */}
          <DashboardPanel className="mt-5">
            <h2 className="text-title-lg font-bold text-primary">
              Version history
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              {state.data.versions.length} version
              {state.data.versions.length === 1 ? "" : "s"} — each snapshot is
              immutable once created.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-start text-sm">
                <thead className="border-b border-outline-variant/30 bg-surface-container-low">
                  <tr>
                    {[
                      "Version",
                      "Monthly",
                      "Annual",
                      "Trial",
                      "Employees",
                      "Queries/mo",
                      "Storage",
                      "Models",
                      "Analytics",
                      "Support",
                      "Created",
                    ].map((h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap px-3 py-2 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {[...state.data.versions].reverse().map((version) => (
                    <tr key={version.version}>
                      <td className="px-3 py-3 font-bold">
                        v{version.version}
                        {version.version === state.data!.version
                          ? " (current)"
                          : null}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {version.currency} {version.monthlyPrice.toFixed(2)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {version.annualPrice > 0
                          ? `${version.currency} ${version.annualPrice.toFixed(2)}`
                          : "—"}
                      </td>
                      <td className="px-3 py-3">
                        {version.trialDays > 0 ? `${version.trialDays}d` : "—"}
                      </td>
                      <td className="px-3 py-3">
                        {version.entitlements?.employees?.toLocaleString() ??
                          version.limits.users}
                      </td>
                      <td className="px-3 py-3">
                        {(version.entitlements?.queriesPerMonth ??
                          version.limits.questionsPerMonth
                        )?.toLocaleString()}
                      </td>
                      <td className="px-3 py-3">
                        {version.entitlements?.storageMb ?? version.limits.storageMb} MB
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-3">
                        {version.supportedModels?.length
                          ? version.supportedModels.join(", ")
                          : "—"}
                      </td>
                      <td className="px-3 py-3">
                        {version.analyticsLevel
                          ? label(version.analyticsLevel)
                          : "—"}
                      </td>
                      <td className="px-3 py-3">
                        {version.supportLevel
                          ? label(version.supportLevel)
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {new Date(version.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DashboardPanel>
        </>
      ) : null}
    </DashboardPage>
  );
}
