"use client";

import Link from "next/link";
import {
  DashboardPage,
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui/DashboardPage";
import {
  PlatformState,
  PlatformTable,
  StatusPill,
  cell,
  usePlatformData,
} from "@/components/super-admin/platform-ui";
import { listPackages } from "@/services/super-admin.service";
import { PermissionAction } from "@/components/auth/permission-boundary";
import { Permission } from "@/types/api/permissions.types";
import { usePermissions } from "@/providers/permission-provider";
import { resolvePackageEntitlement } from "@/components/super-admin/package-display.contract";
import { formatMoneyMinor } from "@/lib/money";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";

export default function PackagesPage() {
  const { t, tPlural } = useI18n();
  const intlLocale = useIntlLocale();
  const permissions = usePermissions();
  const state = usePlatformData(listPackages);
  const denied = permissions.status === "ready" && !permissions.can(Permission.BILLING_READ);
  return (
    <DashboardPage>
      <DashboardPageHeader
        title={t("superAdmin.packages.title")}
        description={t("superAdmin.packages.desc")}
        actions={
          <PermissionAction permissions={[Permission.BILLING_MANAGE]}>
          <Link
            href="/super-admin/packages/new"
            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 font-bold text-on-primary sm:w-auto"
          >
            <span className="material-symbols-outlined">add</span>{t("superAdmin.packages.new")}
          </Link>
          </PermissionAction>
        }
      />
      <PlatformState
        loading={!denied && state.loading}
        error={denied ? "" : state.error}
        onRetry={state.reload}
      />
      {denied ? (
        <DashboardPanel><p role="alert">{t("superAdmin.packages.noPermission")}</p></DashboardPanel>
      ) : state.data?.length === 0 ? (
        <DashboardPanel><p>{t("superAdmin.packages.none")}</p></DashboardPanel>
      ) : state.data ? (
        <PlatformTable
          headers={[
            t("superAdmin.subsTablePackage"),
            t("superAdmin.subsTableVersion"),
            t("superAdmin.packages.monthly"),
            t("superAdmin.packages.annual"),
            t("superAdmin.packages.trial"),
            t("superAdmin.packages.employees"),
            t("superAdmin.packages.queriesPerMonthShort"),
            t("superAdmin.packages.visibility"),
            t("superAdmin.tableStatus"),
            t("superAdmin.packages.actions"),
          ]}
          minWidth="1100px"
        >
          {state.data.map((pkg) => (
            <tr key={pkg._id}>
              <td className={cell}>
                <p className="font-bold text-on-surface">{pkg.name}</p>
                <p className="text-xs">{pkg.code}</p>
              </td>
              <td className={cell}>{t("superAdmin.packages.versionLabel", { version: String(pkg.version) })}</td>
              <td className={cell}>
                {formatMoneyMinor(pkg.monthlyPriceCents ?? pkg.monthlyPrice, pkg.currency, intlLocale)}
              </td>
              <td className={cell}>
                {pkg.annualPrice > 0
                  ? formatMoneyMinor(pkg.annualPriceCents ?? pkg.annualPrice, pkg.currency, intlLocale)
                  : "—"}
              </td>
              <td className={cell}>
                {pkg.trialDays > 0 ? tPlural("superAdmin.packages.daysCompact", pkg.trialDays) : "—"}
              </td>
              <td className={cell}>
                {resolvePackageEntitlement(pkg, "employees", "users")?.toLocaleString(intlLocale) ?? "—"}
              </td>
              <td className={cell}>
                {resolvePackageEntitlement(pkg, "queriesPerMonth", "questionsPerMonth")?.toLocaleString(intlLocale) ?? "—"}
              </td>
              <td className={cell}>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                    pkg.visibility === "public"
                      ? "bg-tertiary-container/20 text-on-tertiary-container"
                      : "bg-surface-container text-on-surface-variant"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      pkg.visibility === "public"
                        ? "bg-tertiary"
                        : "bg-on-surface-variant"
                    }`}
                  />
                  {codeLabel(t, "superAdmin.packageVisibility", pkg.visibility)}
                </span>
              </td>
              <td className={cell}>
                <StatusPill
                  value={pkg.active ? "active" : "inactive"}
                  label={codeLabel(t, "superAdmin.packageState", pkg.active ? "active" : "inactive")}
                />
              </td>
              <td className={cell}>
                <Link
                  href={`/super-admin/packages/${pkg._id}`}
                  className="font-bold text-secondary"
                >
                  {t("superAdmin.packages.manage")}
                </Link>
              </td>
            </tr>
          ))}
        </PlatformTable>
      ) : null}
    </DashboardPage>
  );
}
