"use client";
import { useEffect, useState } from "react";
import { DashboardPage, DashboardPageHeader } from "@/components/ui/DashboardPage";
import { PlatformTable, StatusPill, cell } from "@/components/super-admin/platform-ui";
import { getAuditLogs, type AuditLog, type AuditQueryFilter } from "@/services/audit.service";
import { useI18n } from "@/providers/i18n-provider";

export default function TenantAuditPage() {
  const { t } = useI18n();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AuditQueryFilter>({ page: 1, pageSize: 50 });
  const [totalPages, setTotalPages] = useState(1);

  const loadLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAuditLogs(filter);
      setLogs(data.logs);
      setTotalPages(data.pagination.totalPages);
    } catch (err) {
      setError(t("audit.fetchError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [filter]);

  return (
    <DashboardPage>
      <DashboardPageHeader
        title={t("audit.title")}
        description={t("audit.description")}
      />
      
      {error && (
        <div className="mb-4 p-4 rounded bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-sm text-on-surface-variant">Loading...</div>
      ) : logs.length === 0 ? (
        <div className="p-8 text-center text-sm text-on-surface-variant">No audit logs found.</div>
      ) : (
        <PlatformTable
          headers={["Action", "Actor", "Role", "Resource", "Changes", "Time"]}
          minWidth="920px"
        >
          {logs.map((log) => (
            <tr key={log._id}>
              <td className={cell}>
                <strong className="text-on-surface">
                  {log.action.replaceAll("_", " ")}
                </strong>
                {log.outcome !== "SUCCESS" && (
                  <span className="ml-2 text-xs text-red-500">[{log.outcome}]</span>
                )}
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
      )}
    </DashboardPage>
  );
}
