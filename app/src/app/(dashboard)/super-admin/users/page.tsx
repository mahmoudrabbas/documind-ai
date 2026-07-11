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
export default function PlatformUsersPage() {
  const state = usePlatformData(listPlatformUsers);
  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Platform Users"
        description="Review users across companies without crossing tenant-scoped mutation boundaries."
      />
      <PlatformState
        loading={state.loading}
        error={state.error}
        onRetry={state.reload}
      />
      {state.data ? (
        <PlatformTable
          headers={["User", "Company", "Role", "Status", "Verified", "Created"]}
          minWidth="820px"
        >
          {state.data.users.map((user) => (
            <tr key={user._id}>
              <td className={cell}>
                <strong className="text-on-surface">{user.name}</strong>
                <p className="text-xs">{user.email}</p>
              </td>
              <td className={cell}>{user.tenantId?.name ?? "Unknown"}</td>
              <td className={cell}>{user.role.replaceAll("_", " ")}</td>
              <td className={cell}>
                <StatusPill value={user.status} />
              </td>
              <td className={cell}>{user.emailVerified ? "Yes" : "No"}</td>
              <td className={cell}>
                {new Date(user.createdAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </PlatformTable>
      ) : null}
    </DashboardPage>
  );
}
