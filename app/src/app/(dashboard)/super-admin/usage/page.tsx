"use client";
import {
  DashboardPage,
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui/DashboardPage";
import { StatCard } from "@/components/ui/StatCard";
import {
  PlatformState,
  PlatformTable,
  cell,
  usePlatformData,
} from "@/components/super-admin/platform-ui";
import { getPlatformUsage } from "@/services/super-admin.service";
export default function UsagePage() {
  const state = usePlatformData(getPlatformUsage);
  const total =
    state.data?.byTenant.reduce((sum, item) => sum + item.questions, 0) ?? 0;
  const cost =
    state.data?.byTenant.reduce((sum, item) => sum + item.estimatedCost, 0) ??
    0;
  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Usage & Costs"
        description="Track query volume, storage consumption, and estimated AI cost across tenants."
      />
      <PlatformState
        loading={state.loading}
        error={state.error}
        onRetry={state.reload}
      />
      {state.data ? (
        <>
          <div className="mb-5 grid auto-rows-auto items-start gap-3 sm:grid-cols-3 sm:gap-4">
            <StatCard label="Queries" value={total.toLocaleString()} />
            <StatCard label="Estimated cost" value={`$${cost.toFixed(2)}`} />
            <StatCard
              label="Storage"
              value={`${(state.data.storage.storageBytes / 1024 / 1024).toFixed(1)} MB`}
            />
          </div>
          <PlatformTable headers={["Company", "Queries", "Estimated cost"]}>
            {state.data.byTenant.map((item) => (
              <tr key={item.tenantId}>
                <td className={cell}>
                  <strong className="text-on-surface">{item.tenantName}</strong>
                </td>
                <td className={cell}>{item.questions.toLocaleString()}</td>
                <td className={cell}>${item.estimatedCost.toFixed(2)}</td>
              </tr>
            ))}
          </PlatformTable>
          <DashboardPanel className="mt-5">
            <h2 className="text-title-lg font-bold text-primary">
              Daily query volume
            </h2>
            <div
              className="mt-4 flex h-48 items-end gap-1 overflow-x-auto"
              aria-label="Daily query volume chart"
            >
              {state.data.byDay.map((item) => {
                const max = Math.max(
                  1,
                  ...state.data!.byDay.map((row) => row.questions),
                );
                return (
                  <div
                    key={item._id}
                    className="flex min-w-8 flex-1 flex-col items-center justify-end gap-2"
                  >
                    <div
                      className="w-full rounded-t bg-secondary"
                      style={{
                        height: `${Math.max(4, (item.questions / max) * 160)}px`,
                      }}
                      title={`${item.questions} queries`}
                    />
                    <span className="text-[10px] text-on-surface-variant">
                      {item._id.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          </DashboardPanel>
        </>
      ) : null}
    </DashboardPage>
  );
}
