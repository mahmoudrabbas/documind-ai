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
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";

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
  const { t, tPlural } = useI18n();
  const intlLocale = useIntlLocale();
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
        title={t("superAdmin.packages.detailTitle")}
        description={t("superAdmin.packages.detailDesc")}
        actions={state.data && canManage ? (
          <button type="button" onClick={() => setLifecycleAction(state.data!.active ? "archive" : "activate")}
            className="min-h-10 rounded-lg bg-primary px-4 py-2 font-bold text-on-primary">
            {state.data.active ? t("superAdmin.packages.archive") : t("superAdmin.packages.activate")}
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
              {t("superAdmin.packages.commercialDetails")}
            </h2>
            <div className="mt-4 grid gap-6 md:grid-cols-2">
              <DetailSection title={t("superAdmin.packages.pricing")}>
                <DetailRow
                  label={t("superAdmin.packages.monthlyPrice")}
                  value={formatMoneyMinor(state.data.monthlyPriceCents ?? state.data.monthlyPrice, state.data.currency, intlLocale)}
                />
                <DetailRow
                  label={t("superAdmin.packages.annualPrice")}
                  value={
                    state.data.annualPrice > 0
                      ? formatMoneyMinor(state.data.annualPriceCents ?? state.data.annualPrice, state.data.currency, intlLocale)
                      : t("superAdmin.packages.notSet")
                  }
                />
                <DetailRow label={t("superAdmin.packages.currency")} value={state.data.currency} />
                <DetailRow
                  label={t("superAdmin.packages.trialDaysLabel")}
                  value={
                    state.data.trialDays > 0
                      ? tPlural("superAdmin.packages.daysCount", state.data.trialDays)
                      : t("superAdmin.packages.noTrial")
                  }
                />
              </DetailSection>

              <DetailSection title={t("superAdmin.packages.visibility")}>
                <DetailRow
                  label={t("superAdmin.packages.visibility")}
                  value={codeLabel(t, "superAdmin.packageVisibility", state.data.visibility)}
                />
              </DetailSection>

              <DetailSection title={t("superAdmin.packages.entitlements")}>
                <DetailRow
                  label={t("superAdmin.packages.employees")}
                  value={resolvePackageEntitlement(state.data, "employees", "users")?.toLocaleString(intlLocale)}
                />
                <DetailRow
                  label={t("superAdmin.packages.admins")}
                  value={resolvePackageEntitlement(state.data, "admins")?.toLocaleString(intlLocale)}
                />
                <DetailRow
                  label={t("superAdmin.documents")}
                  value={resolvePackageEntitlement(state.data, "documents", "documents")?.toLocaleString(intlLocale)}
                />
                <DetailRow
                  label={t("superAdmin.storage")}
                  value={
                    resolvePackageEntitlement(state.data, "storageMb", "storageMb") === undefined
                      ? "—"
                      : t("superAdmin.packages.megabytes", {
                          value: String(resolvePackageEntitlement(state.data, "storageMb", "storageMb")),
                        })
                  }
                />
                <DetailRow
                  label={t("superAdmin.packages.maxFileSize")}
                  value={
                    resolvePackageEntitlement(state.data, "fileSizeMb") === undefined
                      ? "—"
                      : t("superAdmin.packages.megabytes", {
                          value: String(resolvePackageEntitlement(state.data, "fileSizeMb")),
                        })
                  }
                />
                <DetailRow
                  label={t("superAdmin.packages.queriesPerMonth")}
                  value={resolvePackageEntitlement(
                    state.data,
                    "queriesPerMonth",
                    "questionsPerMonth",
                  )?.toLocaleString(intlLocale)}
                />
                <DetailRow
                  label={t("superAdmin.packages.tokensPerMonth")}
                  value={
                    resolvePackageEntitlement(state.data, "tokensPerMonth")?.toLocaleString(intlLocale)
                  }
                />
                <DetailRow
                  label={t("superAdmin.packages.ocrPagesPerMonth")}
                  value={
                    resolvePackageEntitlement(state.data, "ocrPagesPerMonth")?.toLocaleString(intlLocale)
                  }
                />
              </DetailSection>

              <DetailSection title={t("superAdmin.packages.features")}>
                <DetailRow
                  label={t("superAdmin.packages.supportedModels")}
                  value={
                    state.data.supportedModels?.length
                      ? state.data.supportedModels.join(", ")
                      : "—"
                  }
                />
                <DetailRow
                  label={t("superAdmin.packages.analyticsLevel")}
                  value={
                    state.data.analyticsLevel
                      ? codeLabel(t, "superAdmin.analyticsLevel", state.data.analyticsLevel)
                      : "—"
                  }
                />
                <DetailRow
                  label={t("superAdmin.packages.retention")}
                  value={
                    state.data.retentionDays
                      ? tPlural("superAdmin.packages.daysCount", state.data.retentionDays)
                      : "—"
                  }
                />
                <DetailRow
                  label={t("superAdmin.packages.supportLevel")}
                  value={
                    state.data.supportLevel
                      ? codeLabel(t, "superAdmin.supportLevel", state.data.supportLevel)
                      : "—"
                  }
                />
              </DetailSection>
            </div>
          </DashboardPanel>

          {/* ─── Version history ─── */}
          <DashboardPanel className="mt-5">
            <h2 className="text-title-lg font-bold text-primary">
              {t("superAdmin.packages.versionHistory")}
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              {tPlural("superAdmin.packages.versionSummary", state.data.versions.length)}
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-start text-sm">
                <thead className="border-b border-outline-variant/30 bg-surface-container-low">
                  <tr>
                    {[
                      t("superAdmin.subsTableVersion"),
                      t("superAdmin.packages.monthly"),
                      t("superAdmin.packages.annual"),
                      t("superAdmin.packages.trial"),
                      t("superAdmin.packages.employees"),
                      t("superAdmin.packages.queriesPerMonthShort"),
                      t("superAdmin.storage"),
                      t("superAdmin.packages.models"),
                      t("superAdmin.packages.analytics"),
                      t("superAdmin.packages.support"),
                      t("superAdmin.tableCreated"),
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
                        {version.version === state.data!.version
                          ? t("superAdmin.packages.versionCurrent", { version: String(version.version) })
                          : t("superAdmin.packages.versionLabel", { version: String(version.version) })}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {formatMoneyMinor(version.monthlyPriceCents ?? version.monthlyPrice, version.currency ?? state.data!.currency, intlLocale)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {version.annualPrice > 0
                          ? formatMoneyMinor(version.annualPriceCents ?? version.annualPrice, version.currency ?? state.data!.currency, intlLocale)
                          : "—"}
                      </td>
                      <td className="px-3 py-3">
                        {version.trialDays > 0
                          ? tPlural("superAdmin.packages.daysCompact", version.trialDays)
                          : "—"}
                      </td>
                      <td className="px-3 py-3">
                        {version.entitlements?.employees?.toLocaleString(intlLocale) ??
                          version.limits?.users ?? 0}
                      </td>
                      <td className="px-3 py-3">
                        {(version.entitlements?.queriesPerMonth ??
                          version.limits?.questionsPerMonth ?? 0
                        )?.toLocaleString(intlLocale)}
                      </td>
                      <td className="px-3 py-3">
                        {t("superAdmin.packages.megabytes", {
                          value: String(version.entitlements?.storageMb ?? version.limits?.storageMb ?? 0),
                        })}
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-3">
                        {version.supportedModels?.length
                          ? version.supportedModels.join(", ")
                          : "—"}
                      </td>
                      <td className="px-3 py-3">
                        {version.analyticsLevel
                          ? codeLabel(t, "superAdmin.analyticsLevel", version.analyticsLevel)
                          : "—"}
                      </td>
                      <td className="px-3 py-3">
                        {version.supportLevel
                          ? codeLabel(t, "superAdmin.supportLevel", version.supportLevel)
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {new Date(version.createdAt).toLocaleString(intlLocale)}
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
