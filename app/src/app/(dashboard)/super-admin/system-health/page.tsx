"use client";
import {
  DashboardPage,
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui/DashboardPage";
import {
  PlatformState,
  StatusPill,
  usePlatformData,
} from "@/components/super-admin/platform-ui";
import { getPlatformHealth } from "@/services/super-admin.service";
export default function SystemHealthPage() {
  const state = usePlatformData(getPlatformHealth);
  return (
    <DashboardPage>
      <DashboardPageHeader
        title="System Health"
        description="Review live readiness signals for core DocuMind AI services."
        actions={state.data ? <StatusPill value={state.data.status} /> : null}
      />
      <PlatformState
        loading={state.loading}
        error={state.error}
        onRetry={state.reload}
      />
      {state.data ? (
        <div className="grid auto-rows-auto items-start gap-3 sm:grid-cols-2 sm:gap-4">
          {state.data.services.map((service) => (
            <DashboardPanel key={service.name} padding="compact">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-secondary">
                    dns
                  </span>
                  <strong>{service.name}</strong>
                </div>
                <StatusPill value={service.status} />
              </div>
            </DashboardPanel>
          ))}
        </div>
      ) : null}
    </DashboardPage>
  );
}
