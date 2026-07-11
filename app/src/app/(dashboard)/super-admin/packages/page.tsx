"use client";

import Link from "next/link";
import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/ui/DashboardPage";
import {
  PlatformState,
  PlatformTable,
  StatusPill,
  cell,
  usePlatformData,
} from "@/components/super-admin/platform-ui";
import { listPackages } from "@/services/super-admin.service";

export default function PackagesPage() {
  const state = usePlatformData(listPackages);
  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Packages"
        description="Create versioned SaaS packages and manage platform limits."
        actions={
          <Link
            href="/super-admin/packages/new"
            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 font-bold text-on-primary sm:w-auto"
          >
            <span className="material-symbols-outlined">add</span>New package
          </Link>
        }
      />
      <PlatformState
        loading={state.loading}
        error={state.error}
        onRetry={state.reload}
      />
      {state.data ? (
        <PlatformTable
          headers={[
            "Package",
            "Version",
            "Price",
            "Users",
            "Documents",
            "Queries",
            "Status",
            "Actions",
          ]}
          minWidth="900px"
        >
          {state.data.map((pkg) => (
            <tr key={pkg._id}>
              <td className={cell}>
                <p className="font-bold text-on-surface">{pkg.name}</p>
                <p className="text-xs">{pkg.code}</p>
              </td>
              <td className={cell}>v{pkg.version}</td>
              <td className={cell}>
                {pkg.currency} {pkg.monthlyPrice.toFixed(2)}
              </td>
              <td className={cell}>{pkg.limits.users}</td>
              <td className={cell}>{pkg.limits.documents}</td>
              <td className={cell}>{pkg.limits.questionsPerMonth}</td>
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
