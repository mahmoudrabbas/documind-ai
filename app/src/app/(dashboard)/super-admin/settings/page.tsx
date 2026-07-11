import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/ui/DashboardPage";
import { PlatformSettingsForm } from "@/components/super-admin/platform-settings-form";
export default function GlobalSettingsPage() {
  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Global Settings"
        description="Configure registration, support, maintenance, trials, and retention defaults."
      />
      <PlatformSettingsForm kind="settings" />
    </DashboardPage>
  );
}
