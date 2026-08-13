"use client";

import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/ui/DashboardPage";
import { PackageForm } from "@/components/super-admin/package-form";
import { useI18n } from "@/providers/i18n-provider";

export default function NewPackagePage() {
  const { t } = useI18n();

  return (
    <DashboardPage>
      <DashboardPageHeader
        title={t("superAdmin.packageForm.newTitle")}
        description={t("superAdmin.packageForm.newDescription")}
      />
      <PackageForm />
    </DashboardPage>
  );
}
