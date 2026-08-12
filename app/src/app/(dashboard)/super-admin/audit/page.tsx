"use client";
import { useState } from "react";
import { DashboardPage, DashboardPageHeader } from "@/components/ui/DashboardPage";
import { PlatformTable, StatusPill, cell } from "@/components/super-admin/platform-ui";
import { usePlatformQuery } from "@/components/super-admin/use-platform-query";
import { listPlatformAudit } from "@/services/super-admin.service";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";
import { actionLabel, resourceLabel, describeChanges } from "@/lib/audit-formatters";

const loadAudit = (
  params: { page: number; pageSize: number },
  signal?: AbortSignal,
) => listPlatformAudit(params, signal);

export default function AuditPage() {
  const { t, tPlural } = useI18n();
  const intlLocale = useIntlLocale();
  const [page, setPage] = useState(1);
  const state = usePlatformQuery(loadAudit, { page, pageSize: 20 });

  return (
    <DashboardPage>
      <DashboardPageHeader
        title={t("audit.title")}
        description={t("audit.description")}
      />

      {state.error && (
        <div className="mb-4 p-4 rounded bg-red-50 text-red-700 text-sm">
          {state.error}
        </div>
      )}

      {state.loading ? (
        <div className="p-8 text-center text-sm text-on-surface-variant">Loading...</div>
      ) : state.data && state.data.logs.length === 0 ? (
        <div className="p-8 text-center text-sm text-on-surface-variant">No audit logs found.</div>
      ) : state.data ? (
        <>
          <PlatformTable
            headers={["Action", "Actor", "Role", "Resource", "Details", "Time"]}
            minWidth="920px"
          >
            {state.data.logs.map((log) => {
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
                      <span className="text-xs text-on-surface-variant italic">No changes</span>
                    )}
                  </td>
                  <td className={cell}>
                    {new Date(log.createdAt).toLocaleString(intlLocale)}
                  </td>
                </tr>
              );
            })}
          </PlatformTable>
          <div className="mt-4 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
              className="rounded border px-3 py-2 disabled:opacity-50"
            >
              {t("audit.previous")}
            </button>
            <span>{t("audit.pageOf", { page: String(page), total: String(state.data.pagination.totalPages) })}</span>
            <button
              type="button"
              disabled={page >= state.data.pagination.totalPages}
              onClick={() => setPage((value) => value + 1)}
              className="rounded border px-3 py-2 disabled:opacity-50"
            >
              {t("audit.next")}
            </button>
          </div>
        </>
      ) : null}
    </DashboardPage>
  );
}
