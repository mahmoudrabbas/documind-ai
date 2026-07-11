import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/ui/DashboardPage";
import { PlatformSettingsForm } from "@/components/super-admin/platform-settings-form";
export default function AiConfigurationPage() {
  return (
    <DashboardPage>
      <DashboardPageHeader
        title="AI Configuration"
        description="Manage platform-wide model defaults without exposing provider secrets to the browser."
      />
      <PlatformSettingsForm kind="ai-configuration" />
    </DashboardPage>
  );
}
