"use client";

import { DashboardPage, DashboardPageHeader } from "@/components/ui/DashboardPage";
import { TaxonomyManager } from "@/components/documents/TaxonomyManager";
import { useI18n } from "@/providers/i18n-provider";

export default function DocumentTaxonomyPage() {
  const { t } = useI18n();

  return <DashboardPage><DashboardPageHeader guideId="page-heading-document-taxonomy" title={t("settings.documentTaxonomyTitle")} description={t("settings.documentTaxonomyDesc")} /><TaxonomyManager /></DashboardPage>;
}
