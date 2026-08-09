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
import { listPlatformUsers } from "@/services/super-admin.service";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";
export default function PlatformUsersPage() {
  const { t } = useI18n();
  const intlLocale = useIntlLocale();
  const state = usePlatformData(listPlatformUsers);
  return (
    <DashboardPage>
      <DashboardPageHeader
        title={t("superAdmin.platformUsersTitle")}
        description={t("superAdmin.platformUsersDesc")}
      />
      <PlatformState
        loading={state.loading}
        error={state.error}
        onRetry={state.reload}
      />
      {state.data ? (
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
      ) : null}
    </DashboardPage>
  );
}
