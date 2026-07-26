import {
  DashboardPage,
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui/DashboardPage";
import { SessionSecurity } from "@/components/auth/session-security";
import Link from "next/link";

export default function SettingsPage() {
  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Settings"
        description="Manage your account settings and security."
      />

      <div className="space-y-6">
        <SessionSecurity />

        <DashboardPanel>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><h2 className="text-title-lg font-bold text-primary">Document taxonomy</h2><p className="mt-1 text-sm text-on-surface-variant">Manage categories, departments, and document sensitivity classifications.</p></div>
            <Link href="/dashboard/settings/document-taxonomy" className="rounded bg-primary px-4 py-2 text-sm font-medium text-white">Open document taxonomy</Link>
          </div>
        </DashboardPanel>

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
