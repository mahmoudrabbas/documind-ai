"use client";
import { useCallback, useEffect, useState } from "react";
import { DashboardPage, DashboardPageHeader } from "@/components/ui/DashboardPage";
import { PlatformTable, StatusPill, cell } from "@/components/super-admin/platform-ui";
import { getAuditLogs, type AuditLog, type AuditQueryFilter } from "@/services/audit.service";
import { useI18n } from "@/providers/i18n-provider";
import { actionLabel, resourceLabel, describeChanges } from "@/lib/audit-formatters";

export default function TenantAuditPage() {
  const { t } = useI18n();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter] = useState<AuditQueryFilter>({ page: 1, pageSize: 50 });

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAuditLogs(filter);
      setLogs(data.logs);
    } catch {
      setError(t("audit.fetchError"));
    } finally {
      setLoading(false);
    }
  }, [filter, t]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

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
          headers={["Action", "Actor", "Role", "Resource", "Details", "Time"]}
          minWidth="920px"
        >
          {logs.map((log) => {
            const changeDesc = describeChanges(log.action, log.changes);
            return (
              <tr key={log._id}>
                <td className={cell}>
                  <strong className="text-on-surface">
                    {actionLabel(log.action)}
                  </strong>
                  {log.outcome !== "SUCCESS" && (
                    <span className="ml-2 text-xs text-red-500">[{log.outcome}]</span>
                  )}
                </td>
                <td className={cell}>{log.actorEmail ?? "Unauthenticated"}</td>
                <td className={cell}>
                  <StatusPill value={log.actorRole ?? "N/A"} />
                </td>
                <td className={cell}>
                  <span className="text-on-surface">{resourceLabel(log.resourceType)}</span>
                  <p className="max-w-44 truncate text-xs text-on-surface-variant">{log.resourceId}</p>
                </td>
                <td className={cell}>
                  {changeDesc ? (
                    <span className="text-xs">{changeDesc}</span>
                  ) : (
                    <span className="text-xs text-on-surface-variant italic">No changes</span>
                  )}
                </td>
                <td className={cell}>
                  {new Date(log.createdAt).toLocaleString()}
                </td>
              </tr>
            );
          })}
        </PlatformTable>
      )}
    </DashboardPage>
  );
}
