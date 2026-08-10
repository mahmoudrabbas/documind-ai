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
import { useI18n } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";
export default function SystemHealthPage() {
  const { t } = useI18n();
  const state = usePlatformData(getPlatformHealth);
  return (
    <DashboardPage>
      <DashboardPageHeader
        title={t("superAdmin.systemHealthTitle")}
        description={t("superAdmin.systemHealthDesc")}
        actions={
          state.data ? (
            <StatusPill
              value={state.data.status}
              label={codeLabel(t, "superAdmin.serviceStatus", state.data.status)}
            />
          ) : null
        }
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
                <StatusPill
                  value={service.status}
                  label={codeLabel(t, "superAdmin.serviceStatus", service.status)}
                />
              </div>
            </DashboardPanel>
          ))}
        </div>
      ) : null}
    </DashboardPage>
  );
}
