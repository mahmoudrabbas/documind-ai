"use client";
import { useCallback, useEffect, useState } from "react";
import { DashboardPage, DashboardPageHeader } from "@/components/ui/DashboardPage";
import { PlatformTable, StatusPill, cell } from "@/components/super-admin/platform-ui";
import { getAuditLogs, type AuditLog, type AuditQueryFilter } from "@/services/audit.service";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";
import { actionLabel, resourceLabel, describeChanges } from "@/lib/audit-formatters";

export default function TenantAuditPage() {
  const { t, tPlural, dir } = useI18n();
  const intlLocale = useIntlLocale();
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
    <DashboardPage dir={dir}>
      <DashboardPageHeader
        guideId="page-heading-audit"
        title={t("audit.title")}
        description={t("audit.description")}
      />

      {error && (
        <div className="mb-4 p-4 rounded bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-sm text-on-surface-variant">{t("common.loading")}</div>
      ) : logs.length === 0 ? (
        <div className="p-8 text-center text-sm text-on-surface-variant">{t("audit.noLogs")}</div>
      ) : (
        <div data-guide-id="audit-table">
        <PlatformTable
          headers={[
            t("audit.tableAction"),
            t("audit.tableActor"),
            t("audit.tableRole"),
            t("audit.tableResource"),
            t("audit.tableDetails"),
            t("audit.tableTime"),
          ]}
          minWidth="920px"
        >
          {logs.map((log) => {
            const changeDesc = describeChanges(log.action, log.changes, { t, tPlural });
            return (
              <tr key={log._id}>
                <td className={cell}>
                  <strong className="text-on-surface">
                    {actionLabel(log.action, t)}
                  </strong>
                  {log.outcome !== "SUCCESS" && (
                    <span className="ms-2 text-xs text-red-500">[{log.outcome}]</span>
                  )}
                </td>
                <td className={cell}>{log.actorEmail ?? t("audit.unauthenticated")}</td>
                <td className={cell}>
                  <StatusPill
                    value={log.actorRole ?? "unknown"}
                    label={codeLabel(t, "audit.actorRole", log.actorRole ?? "unknown")}
                  />
                </td>
                <td className={cell}>
                  <span className="text-on-surface">{resourceLabel(log.resourceType, t)}</span>
                  <p className="max-w-44 truncate text-xs text-on-surface-variant">{log.resourceId}</p>
                </td>
                <td className={cell}>
                  {changeDesc ? (
                    <span className="text-xs">{changeDesc}</span>
                  ) : (
                    <span className="text-xs text-on-surface-variant italic">{t("audit.noChanges")}</span>
                  )}
                </td>
                <td className={cell}>
                  {new Date(log.createdAt).toLocaleString(intlLocale)}
                </td>
              </tr>
            );
          })}
        </PlatformTable>
        </div>
      )}
    </DashboardPage>
  );
}
