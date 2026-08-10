"use client";

import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/ui/DashboardPage";
import { PlatformSettingsForm } from "@/components/super-admin/platform-settings-form";
import { useI18n } from "@/providers/i18n-provider";

export default function AiConfigurationPage() {
  const { t } = useI18n();

  return (
    <DashboardPage>
      <DashboardPageHeader
        title={t("superAdmin.aiConfiguration.title")}
        description={t("superAdmin.aiConfiguration.description")}
      />
      <PlatformSettingsForm kind="ai-configuration" />
    </DashboardPage>
  );
}
