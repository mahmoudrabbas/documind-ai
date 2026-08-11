"use client";

import { DashboardPage, DashboardPageHeader, DashboardPanel } from "@/components/ui/DashboardPage";
import { Button } from "@/components/ui/Button";
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
          <div className="mt-4">
            <Button onClick={() => alert(t("superAdmin.platformEmails.notImplemented"))}>
              {t("superAdmin.platformEmails.sendTest")}
            </Button>
          </div>
        </DashboardPanel>
      </div>
    </DashboardPage>
  );
}
