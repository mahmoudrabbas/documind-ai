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
export default function JobsPage() {
  const state = usePlatformData(listPlatformJobs);
  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Processing Jobs"
        description="Monitor document ingestion and processing activity across companies."
      />
      <PlatformState
        loading={state.loading}
        error={state.error}
        onRetry={state.reload}
      />
      {state.data ? (
        <PlatformTable
          headers={["Document", "Company", "Status", "Created", "Updated"]}
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
              <td className={cell}>{job.tenantId?.name ?? "Unknown"}</td>
              <td className={cell}>
                <StatusPill value={job.status} />
              </td>
              <td className={cell}>
                {new Date(job.createdAt).toLocaleString()}
              </td>
              <td className={cell}>
                {new Date(job.updatedAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </PlatformTable>
      ) : null}
    </DashboardPage>
  );
}
