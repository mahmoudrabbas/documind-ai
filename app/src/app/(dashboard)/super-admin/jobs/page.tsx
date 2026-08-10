"use client";
import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/ui/DashboardPage";
import {
  PlatformState,
  PlatformTable,
  StatusPill,
  cell,
  usePlatformData,
} from "@/components/super-admin/platform-ui";
import { listPlatformJobs } from "@/services/super-admin.service";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";
export default function JobsPage() {
  const { t } = useI18n();
  const intlLocale = useIntlLocale();
  const state = usePlatformData(listPlatformJobs);
  return (
    <DashboardPage>
      <DashboardPageHeader
        title={t("superAdmin.jobsTitle")}
        description={t("superAdmin.jobsDesc")}
      />
      <PlatformState
        loading={state.loading}
        error={state.error}
        onRetry={state.reload}
      />
      {state.data ? (
        <PlatformTable
          headers={[
            t("superAdmin.tableDocument"),
            t("superAdmin.tableCompany"),
            t("superAdmin.tableStatus"),
            t("superAdmin.tableCreated"),
            t("superAdmin.tableUpdated"),
          ]}
        >
          {state.data.jobs.map((job) => (
            <tr key={job._id}>
              <td className={cell}>
                <p
                  className="max-w-72 truncate font-bold text-on-surface"
                  title={job.fileName}
                >
                  {job.fileName}
                </p>
              </td>
              <td className={cell}>
                {job.tenantId?.name ?? t("superAdmin.unknownCompany")}
              </td>
              <td className={cell}>
                <StatusPill
                  value={job.status}
                  label={codeLabel(t, "documents.processingStatus", job.status)}
                />
              </td>
              <td className={cell}>
                {new Date(job.createdAt).toLocaleString(intlLocale)}
              </td>
              <td className={cell}>
                {new Date(job.updatedAt).toLocaleString(intlLocale)}
              </td>
            </tr>
          ))}
        </PlatformTable>
      ) : null}
    </DashboardPage>
  );
}
