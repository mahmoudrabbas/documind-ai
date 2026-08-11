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
import { listPlatformUsers } from "@/services/super-admin.service";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";

const loadUsers = (
  params: { page: number; pageSize: number },
  signal?: AbortSignal,
) => listPlatformUsers(params, signal);

export default function PlatformUsersPage() {
  const { t } = useI18n();
  const intlLocale = useIntlLocale();
  const [page, setPage] = useState(1);
  const state = usePlatformQuery(loadUsers, { page, pageSize: 20 });
  return (
    <DashboardPage>
      <DashboardPageHeader
        title={t("superAdmin.platformUsersTitle")}
        description={t("superAdmin.platformUsersDesc")}
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
            t("superAdmin.tableUser"),
            t("superAdmin.tableCompany"),
            t("superAdmin.tableRole"),
            t("superAdmin.tableStatus"),
            t("superAdmin.tableVerified"),
            t("superAdmin.tableCreated"),
          ]}
          minWidth="820px"
        >
          {state.data.users.map((user) => (
            <tr key={user._id}>
              <td className={cell}>
                <strong className="text-on-surface">{user.name}</strong>
                <p className="text-xs">{user.email}</p>
              </td>
              <td className={cell}>
                {user.tenantId?.name ?? t("superAdmin.unknownCompany")}
              </td>
              <td className={cell}>
                {codeLabel(t, "superAdmin.userRole", user.role)}
              </td>
              <td className={cell}>
                <StatusPill
                  value={user.status}
                  label={codeLabel(t, "superAdmin.userStatus", user.status)}
                />
              </td>
              <td className={cell}>
                {user.emailVerified
                  ? t("superAdmin.verifiedYes")
                  : t("superAdmin.verifiedNo")}
              </td>
              <td className={cell}>
                {new Date(user.createdAt).toLocaleDateString(intlLocale)}
              </td>
            </tr>
          ))}
        </PlatformTable>
        <div className="mt-4 flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
            className="rounded border px-3 py-2 disabled:opacity-50"
          >
            {t("superAdmin.subsPrevious")}
          </button>
          <span>
            {t("superAdmin.subsPageOf", {
              page: String(page),
              total: String(state.data.pagination.totalPages),
            })}
          </span>
          <button
            type="button"
            disabled={page >= state.data.pagination.totalPages}
            onClick={() => setPage((value) => value + 1)}
            className="rounded border px-3 py-2 disabled:opacity-50"
          >
            {t("superAdmin.subsNext")}
          </button>
        </div>
        </>
      ) : null}
    </DashboardPage>
  );
}
