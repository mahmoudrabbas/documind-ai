"use client";

import {
  DashboardPage,
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui/DashboardPage";
import { SessionSecurity } from "@/components/auth/session-security";
import { TenantSettingsManager } from "@/components/settings/TenantSettingsManager";
import Link from "next/link";
import { useI18n } from "@/providers/i18n-provider";

export default function SettingsPage() {
  const { t, dir } = useI18n();

  return (
    <DashboardPage dir={dir}>
      <DashboardPageHeader
        guideId="page-heading-settings"
        title={t("settings.title")}
        description={t("settings.description")}
      />

      <div className="space-y-6">
        <div data-guide-id="settings-session-security">
          <SessionSecurity />
        </div>

        <DashboardPanel>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-title-lg font-bold text-primary">{t("settings.documentTaxonomyTitle")}</h2>
              <p className="mt-1 text-sm text-on-surface-variant">{t("settings.documentTaxonomyDesc")}</p>
            </div>
            <Link href="/dashboard/settings/document-taxonomy" data-guide-id="settings-taxonomy-link" className="rounded bg-primary px-4 py-2 text-sm font-medium text-white">
              {t("settings.openDocumentTaxonomy")}
            </Link>
          </div>
        </DashboardPanel>

        <TenantSettingsManager />
      </div>
    </DashboardPage>
  );
}
