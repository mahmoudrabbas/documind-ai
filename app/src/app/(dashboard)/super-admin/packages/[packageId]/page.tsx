"use client";

import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
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
import { PackageLifecycleDialog } from "@/components/super-admin/package-lifecycle-dialog";
import { usePermissions } from "@/providers/permission-provider";
import { Permission } from "@/types/api/permissions.types";
import { formatMoneyMinor } from "@/lib/money";
import type { PackageLifecycleAction } from "@/types/api/super-admin.types";
import { resolvePackageEntitlement } from "@/components/super-admin/package-display.contract";

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
  const permissions = usePermissions();
  const canManage = permissions.can(Permission.BILLING_MANAGE);
  const [lifecycleAction, setLifecycleAction] = useState<PackageLifecycleAction | null>(null);
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
        actions={state.data && canManage ? (
          <button type="button" onClick={() => setLifecycleAction(state.data!.active ? "archive" : "activate")}
            className="min-h-10 rounded-lg bg-primary px-4 py-2 font-bold text-on-primary">
            {state.data.active ? "Archive package" : "Activate package"}
          </button>
        ) : undefined}
      />
      <PlatformState
        loading={state.loading}
        error={state.error}
        onRetry={state.reload}
      />
      {state.data ? (
        <>
          <PackageForm key={state.data.version} existing={state.data} onSaved={state.reload} />

          {/* ─── FR-PAY-001 detail summary ─── */}
          <DashboardPanel className="mt-5">
            <h2 className="text-title-lg font-bold text-primary">
              Commercial details
            </h2>
            <div className="mt-4 grid gap-6 md:grid-cols-2">
              <DetailSection title="Pricing">
                <DetailRow
                  label="Monthly price"
                  value={formatMoneyMinor(state.data.monthlyPriceCents ?? state.data.monthlyPrice, state.data.currency)}
                />
                <DetailRow
                  label="Annual price"
                  value={
                    state.data.annualPrice > 0
                      ? formatMoneyMinor(state.data.annualPriceCents ?? state.data.annualPrice, state.data.currency)
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
                  value={resolvePackageEntitlement(state.data, "employees", "users")?.toLocaleString()}
                />
                <DetailRow
                  label="Admins"
                  value={resolvePackageEntitlement(state.data, "admins")?.toLocaleString()}
                />
                <DetailRow
                  label="Documents"
                  value={resolvePackageEntitlement(state.data, "documents", "documents")?.toLocaleString()}
                />
                <DetailRow
                  label="Storage"
                  value={
                    resolvePackageEntitlement(state.data, "storageMb", "storageMb") === undefined
                      ? "—"
                      : `${resolvePackageEntitlement(state.data, "storageMb", "storageMb")} MB`
                  }
                />
                <DetailRow
                  label="Max file size"
                  value={
                    resolvePackageEntitlement(state.data, "fileSizeMb") === undefined
                      ? "—"
                      : `${resolvePackageEntitlement(state.data, "fileSizeMb")} MB`
                  }
                />
                <DetailRow
                  label="Queries / month"
                  value={resolvePackageEntitlement(
                    state.data,
                    "queriesPerMonth",
                    "questionsPerMonth",
                  )?.toLocaleString()}
                />
                <DetailRow
                  label="Tokens / month"
                  value={
                    resolvePackageEntitlement(state.data, "tokensPerMonth")?.toLocaleString()
                  }
                />
                <DetailRow
                  label="OCR pages / month"
                  value={
                    resolvePackageEntitlement(state.data, "ocrPagesPerMonth")?.toLocaleString()
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
                        {formatMoneyMinor(version.monthlyPriceCents ?? version.monthlyPrice, version.currency ?? state.data!.currency)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {version.annualPrice > 0
                          ? formatMoneyMinor(version.annualPriceCents ?? version.annualPrice, version.currency ?? state.data!.currency)
                          : "—"}
                      </td>
                      <td className="px-3 py-3">
                        {version.trialDays > 0 ? `${version.trialDays}d` : "—"}
                      </td>
                      <td className="px-3 py-3">
                        {version.entitlements?.employees?.toLocaleString() ??
                          version.limits?.users ?? 0}
                      </td>
                      <td className="px-3 py-3">
                        {(version.entitlements?.queriesPerMonth ??
                          version.limits?.questionsPerMonth ?? 0
                        )?.toLocaleString()}
                      </td>
                      <td className="px-3 py-3">
                        {version.entitlements?.storageMb ?? version.limits?.storageMb ?? 0} MB
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
          {lifecycleAction ? (
            <PackageLifecycleDialog
              open
              action={lifecycleAction}
              pkg={state.data}
              onClose={() => setLifecycleAction(null)}
              onSuccess={state.reload}
            />
          ) : null}
        </>
      ) : null}
    </DashboardPage>
  );
}
