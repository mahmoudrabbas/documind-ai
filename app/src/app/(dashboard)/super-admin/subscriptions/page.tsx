"use client";

import { useState } from "react";
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
import {
  listPackages,
  listSubscriptions,
  updateSubscription,
} from "@/services/super-admin.service";
import { listTenants } from "@/services/platform.service";

const loadData = async (signal?: AbortSignal) => {
  const [subscriptions, packages, tenants] = await Promise.all([
    listSubscriptions(signal),
    listPackages(signal),
    listTenants(
      { page: 1, pageSize: 100, search: "", status: "", plan: "" },
      signal,
    ),
  ]);
  return {
    data: {
      subscriptions: subscriptions.data,
      packages: packages.data,
      tenants: tenants.data.tenants,
    },
  };
};
export default function SubscriptionsPage() {
  const state = usePlatformData(loadData);
  const [tenantId, setTenantId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [status, setStatus] = useState("active");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  async function save() {
    if (!tenantId || !packageId) return;
    setPending(true);
    setNotice("");
    try {
      await updateSubscription(tenantId, { packageId, status });
      setNotice("Subscription updated successfully.");
      await state.reload();
    } catch {
      setNotice("Unable to update the subscription.");
    } finally {
      setPending(false);
    }
  }
  const control =
    "min-h-11 w-full rounded-lg border border-outline-variant bg-surface px-3";
  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Subscriptions"
        description="Assign versioned packages and manage company subscription status."
      />
      <DashboardPanel className="mb-5">
        <div className="grid min-w-0 gap-3 md:grid-cols-4 md:items-end">
          <label className="text-sm font-bold">
            Company
            <select
              value={tenantId}
              onChange={(event) => setTenantId(event.target.value)}
              className={`mt-1 ${control}`}
            >
              <option value="">Select company</option>
              {state.data?.tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-bold">
            Package
            <select
              value={packageId}
              onChange={(event) => setPackageId(event.target.value)}
              className={`mt-1 ${control}`}
            >
              <option value="">Select package</option>
              {state.data?.packages
                .filter((pkg) => pkg.active)
                .map((pkg) => (
                  <option key={pkg._id} value={pkg._id}>
                    {pkg.name} v{pkg.version}
                  </option>
                ))}
            </select>
          </label>
          <label className="text-sm font-bold">
            Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className={`mt-1 ${control}`}
            >
              {["active", "trialing", "past_due", "cancelled"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <button
            disabled={pending || !tenantId || !packageId}
            onClick={() => void save()}
            className="min-h-11 rounded-lg bg-primary px-4 font-bold text-on-primary disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save subscription"}
          </button>
        </div>
        {notice ? (
          <p className="mt-3 text-sm" aria-live="polite">
            {notice}
          </p>
        ) : null}
      </DashboardPanel>
      <PlatformState
        loading={state.loading}
        error={state.error}
        onRetry={state.reload}
      />
      {state.data ? (
        <PlatformTable
          headers={[
            "Company",
            "Package",
            "Version",
            "Status",
            "Renews",
            "Updated",
          ]}
        >
          {state.data.subscriptions.map((item) => (
            <tr key={item._id}>
              <td className={cell}>
                <strong className="text-on-surface">
                  {item.tenantId.name}
                </strong>
                <p className="text-xs">{item.tenantId.slug}</p>
              </td>
              <td className={cell}>{item.packageId.name}</td>
              <td className={cell}>v{item.packageVersion}</td>
              <td className={cell}>
                <StatusPill value={item.status} />
              </td>
              <td className={cell}>
                {item.renewsAt
                  ? new Date(item.renewsAt).toLocaleDateString()
                  : "—"}
              </td>
              <td className={cell}>
                {new Date(item.updatedAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </PlatformTable>
      ) : null}
    </DashboardPage>
  );
}
