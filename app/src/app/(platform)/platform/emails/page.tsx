"use client";

import { DashboardPage, DashboardPageHeader, DashboardPanel } from "@/components/ui/DashboardPage";
import { useI18n } from "@/providers/i18n-provider";

export default function PlatformEmailsPage() {
  const { t } = useI18n();
  return (
    <DashboardPage>
      <DashboardPageHeader
        title={t("superAdmin.platformEmails.title")}
        description={t("superAdmin.platformEmails.description")}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardPanel className="flex flex-col gap-4">
          <h3 className="text-title-md font-semibold">
            {t("superAdmin.platformEmails.smtpTitle")}
          </h3>
          <p className="text-body-sm text-on-surface-variant">
            {t("superAdmin.platformEmails.smtpDescription")}
          </p>
          <p className="mt-4 rounded-lg border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-body-sm text-on-surface-variant" role="status">
            {t("superAdmin.platformEmails.notImplemented")}
          </p>
        </DashboardPanel>
      </div>
    </DashboardPage>
  );
}
