"use client";
import { useState } from "react";
import {
  DashboardPage,
  DashboardPageHeader,
} from "@/components/ui/DashboardPage";
import {
  PlatformState,
  PlatformTable,
  StatusPill,
  cell,
} from "@/components/super-admin/platform-ui";
import { usePlatformQuery } from "@/components/super-admin/use-platform-query";
import { listPlatformJobs } from "@/services/super-admin.service";
import { AdminPagination } from "@/components/ui";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";

const loadJobs = (
  params: { page: number; pageSize: number },
  signal?: AbortSignal,
) => listPlatformJobs(params, signal);

export default function JobsPage() {
  const { t } = useI18n();
  const intlLocale = useIntlLocale();
  const [page, setPage] = useState(1);
  const state = usePlatformQuery(loadJobs, { page, pageSize: 20 });
  return (
    <DashboardPage>
      <DashboardPageHeader
        title={t("superAdmin.jobsTitle")}
        description={t("superAdmin.jobsDesc")}
      />
      <PlatformState
        loading={state.loading}
        refreshing={state.refreshing}
        error={state.error}
        onRetry={state.reload}
      />
      {state.data ? (
        <>
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
          <div className="sticky bottom-0 z-10">
            <AdminPagination
              currentPage={page}
              totalPages={state.data.pagination.totalPages}
              onPageChange={setPage}
            />
          </div>
        </>
      ) : null}
    </DashboardPage>
  );
}
