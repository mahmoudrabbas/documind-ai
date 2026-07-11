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
import { listPlatformAudit } from "@/services/super-admin.service";
export default function AuditPage() {
  const state = usePlatformData(listPlatformAudit);
  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Security & Audit"
        description="Review sensitive administrative actions across the platform."
      />
      <PlatformState
        loading={state.loading}
        error={state.error}
        onRetry={state.reload}
      />
      {state.data ? (
        <PlatformTable
          headers={["Action", "Actor", "Role", "Resource", "Changes", "Time"]}
          minWidth="920px"
        >
          {state.data.logs.map((log) => (
            <tr key={log._id}>
              <td className={cell}>
                <strong className="text-on-surface">
                  {log.action.replaceAll("_", " ")}
                </strong>
              </td>
              <td className={cell}>{log.actorEmail}</td>
              <td className={cell}>
                <StatusPill value={log.actorRole} />
              </td>
              <td className={cell}>
                {log.resourceType}
                <p className="max-w-44 truncate text-xs">{log.resourceId}</p>
              </td>
              <td className={cell}>
                <code
                  className="block max-w-64 truncate text-xs"
                  title={JSON.stringify(log.changes)}
                >
                  {JSON.stringify(log.changes)}
                </code>
              </td>
              <td className={cell}>
                {new Date(log.createdAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </PlatformTable>
      ) : null}
    </DashboardPage>
  );
}
