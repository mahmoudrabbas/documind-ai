import {
  DashboardPage,
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui/DashboardPage";
import { SessionSecurity } from "@/components/auth/session-security";
import { TenantSettingsManager } from "@/components/settings/TenantSettingsManager";
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

        <TenantSettingsManager />
      </div>
    </DashboardPage>
  );
}
