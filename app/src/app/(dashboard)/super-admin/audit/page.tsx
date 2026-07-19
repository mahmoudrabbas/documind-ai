"use client";
import { useState, useCallback, useEffect } from "react";
import { DashboardPage, DashboardPageHeader } from "@/components/ui/DashboardPage";
import { PlatformTable, StatusPill, cell } from "@/components/super-admin/platform-ui";
import { listPlatformAudit } from "@/services/super-admin.service";
import type { PlatformAuditLog } from "@/types/api/super-admin.types";
import { useI18n } from "@/providers/i18n-provider";

export default function AuditPage() {
  const { t } = useI18n();
  const [logs, setLogs] = useState<PlatformAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listPlatformAudit();
      setLogs(data.data.logs);
    } catch {
      setError(t("audit.fetchError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

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
              <td className={cell}>{log.actorEmail ?? "Unauthenticated"}</td>
              <td className={cell}>
                <StatusPill value={log.actorRole ?? "N/A"} />
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
