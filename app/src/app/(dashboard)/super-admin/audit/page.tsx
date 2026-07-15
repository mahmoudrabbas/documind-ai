"use client";
import { useState, useCallback, useEffect } from "react";
import { DashboardPage, DashboardPageHeader } from "@/components/ui/DashboardPage";
import { PlatformTable, StatusPill, cell } from "@/components/super-admin/platform-ui";
import { getAuditLogs, exportAuditLogs, type AuditLog, type AuditQueryFilter } from "@/services/audit.service";
import { useI18n } from "@/providers/i18n-provider";

export default function AuditPage() {
  const { t } = useI18n();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
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

  const handleExport = async () => {
    setExporting(true);
    try {
      // Must bound export by date to prevent OOM
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 30);
      const data = await exportAuditLogs({ ...filter, dateFrom: dateFrom.toISOString() });
      
      const csv = [
        ["Action", "Actor", "Role", "Resource", "Changes", "Time"].join(","),
        ...data.logs.map(log => [
          log.action,
          log.actorEmail,
          log.actorRole,
          `${log.resourceType}:${log.resourceId}`,
          JSON.stringify(log.changes).replace(/"/g, '""'),
          log.createdAt
        ].map(cell => `"${cell}"`).join(","))
      ].join("\n");
      
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-export-${new Date().toISOString()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      setError(t("audit.exportError"));
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <DashboardPage>
      <div className="flex justify-between items-start">
        <DashboardPageHeader
          title={t("audit.title")}
          description={t("audit.description")}
        />
        <button
          onClick={handleExport}
          disabled={exporting}
          className="bg-primary text-on-primary px-4 py-2 rounded-md hover:opacity-90 disabled:opacity-50"
        >
          {exporting ? t("audit.exporting") : t("audit.export")}
        </button>
      </div>

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
