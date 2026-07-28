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

export default function PackagesPage() {
  const permissions = usePermissions();
  const state = usePlatformData(listPackages);
  const denied = permissions.status === "ready" && !permissions.can(Permission.BILLING_READ);
  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Packages"
        description="Create versioned SaaS packages and manage platform limits."
        actions={
          <PermissionAction permissions={[Permission.BILLING_MANAGE]}>
          <Link
            href="/super-admin/packages/new"
            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 font-bold text-on-primary sm:w-auto"
          >
            <span className="material-symbols-outlined">add</span>New package
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
        <DashboardPanel><p role="alert">You do not have permission to view packages.</p></DashboardPanel>
      ) : state.data?.length === 0 ? (
        <DashboardPanel><p>No packages have been created yet.</p></DashboardPanel>
      ) : state.data ? (
        <PlatformTable
          headers={[
            "Package",
            "Version",
            "Monthly",
            "Annual",
            "Trial",
            "Employees",
            "Queries/mo",
            "Visibility",
            "Status",
            "Actions",
          ]}
          minWidth="1100px"
        >
          {state.data.map((pkg) => (
            <tr key={pkg._id}>
              <td className={cell}>
                <p className="font-bold text-on-surface">{pkg.name}</p>
                <p className="text-xs">{pkg.code}</p>
              </td>
              <td className={cell}>v{pkg.version}</td>
              <td className={cell}>
                {formatMoneyMinor(pkg.monthlyPriceCents ?? pkg.monthlyPrice, pkg.currency)}
              </td>
              <td className={cell}>
                {pkg.annualPrice > 0
                  ? formatMoneyMinor(pkg.annualPriceCents ?? pkg.annualPrice, pkg.currency)
                  : "—"}
              </td>
              <td className={cell}>
                {pkg.trialDays > 0 ? `${pkg.trialDays}d` : "—"}
              </td>
              <td className={cell}>
                {resolvePackageEntitlement(pkg, "employees", "users")?.toLocaleString() ?? "—"}
              </td>
              <td className={cell}>
                {resolvePackageEntitlement(pkg, "queriesPerMonth", "questionsPerMonth")?.toLocaleString() ?? "—"}
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
                  {pkg.visibility}
                </span>
              </td>
              <td className={cell}>
                <StatusPill value={pkg.active ? "active" : "inactive"} />
              </td>
              <td className={cell}>
                <Link
                  href={`/super-admin/packages/${pkg._id}`}
                  className="font-bold text-secondary"
                >
                  Manage
                </Link>
              </td>
            </tr>
          ))}
        </PlatformTable>
      ) : null}
    </DashboardPage>
  );
}
