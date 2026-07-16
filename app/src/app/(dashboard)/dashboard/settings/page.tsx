import {
  DashboardPage,
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui/DashboardPage";
import { SessionSecurity } from "@/components/auth/session-security";

export default function SettingsPage() {
  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Settings"
        description="Manage your account settings and security."
      />

      <div className="space-y-6">
        <SessionSecurity />

        <DashboardPanel className="flex flex-col items-center py-8 text-center sm:py-10">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary-container/50">
            <span className="material-symbols-outlined text-[40px] text-secondary">
              bar_chart
            </span>
          </div>
          <h2 className="mb-2 text-title-lg font-bold text-primary">
            More Settings Coming Soon
          </h2>
          <p className="max-w-md text-body-md leading-relaxed text-on-surface-variant">
            We are building powerful new settings to help you manage your
            knowledge ecosystem.
          </p>
        </DashboardPanel>
      </div>
    </DashboardPage>
  );
}
