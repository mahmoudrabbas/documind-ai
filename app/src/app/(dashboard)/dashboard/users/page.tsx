"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ApiError, apiClient } from "@/lib/api-client";
import { listRoles } from "@/services/roles.service";
import {
  inviteUserWithRole,
  resendInvitation,
  retryInvitationRoleAssignment,
  revokeInvitation,
  updateUser,
  updateUserWithRole,
} from "@/services/users.service";
import type { RoleView, UserView } from "@/types/api/users.types";
import { useAuth } from "@/providers/auth-provider";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";
import { usePermissions } from "@/providers/permission-provider";
import { Permission } from "@/types/api/permissions.types";
import {
  DashboardPage,
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui/DashboardPage";
import { ConfirmDialog } from "@/components/ui/Modal";
import { BulkImportModal } from "@/components/users/BulkImportModal";

type Pagination = {
  page: number;
  pageSize: number;
  totalPages: number;
  totalRecords: number;
};

type UserUpdateState = {
  role: string;
  status: string;
  isSaving: boolean;
  error?: string | null;
};

type RowUpdates = Record<string, UserUpdateState>;
type DeletingUserIds = Record<string, boolean>;
type ResendingIds = Record<string, boolean>;
type RevokingIds = Record<string, boolean>;

type ConfirmAction =
  | { type: "delete"; userId: string; userName: string }
  | { type: "revoke"; userId: string; userName: string }
  | null;

/* Values are the API's machine codes and stay untranslated; the visible
   text is resolved per-render via codeLabel so it follows the locale. */
const STATUS_OPTIONS = [
  { value: "active" },
  { value: "pending_email_verification" },
  { value: "disabled" },
];

const ROLE_OPTIONS = [
  { value: "EMPLOYEE", labelKey: "dashboard.userRole.employee" },
  { value: "COMPANY_ADMIN", labelKey: "dashboard.userRole.company_admin" },
];

const DEFAULT_PAGE_SIZE = 10;

export default function UsersPage() {
  const { t, tPlural, dir } = useI18n();
  const intlLocale = useIntlLocale();
  const auth = useAuth();
  const permissionContext = usePermissions();
  const canCreateUsers = permissionContext.can(Permission.USERS_CREATE);
  const canUpdateUsers = permissionContext.can(Permission.USERS_UPDATE);
  const canDeleteUsers = permissionContext.can(Permission.USERS_DELETE);
  const canAssignBaseRole = permissionContext.can(
    Permission.USERS_ASSIGN_ROLE,
  );
  const canAssignCustomRole =
    canAssignBaseRole &&
    canUpdateUsers &&
    permissionContext.can(Permission.ROLES_READ);
  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [role, setRole] = useState<string>("EMPLOYEE");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [pendingAssignment, setPendingAssignment] = useState<{
    userId: string;
    role: RoleView;
  } | null>(null);

  const [users, setUsers] = useState<UserView[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [rowUpdates, setRowUpdates] = useState<RowUpdates>({});
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [deletingUserIds, setDeletingUserIds] = useState<DeletingUserIds>({});
  const [resendingIds, setResendingIds] = useState<ResendingIds>({});
  const [revokingIds, setRevokingIds] = useState<RevokingIds>({});
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    totalPages: 1,
    totalRecords: 0,
  });

  const [search, setSearch] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [filtersKey, setFiltersKey] = useState<number>(0);
  const filtersInitializedRef = useRef(false);

  const [customRoles, setCustomRoles] = useState<RoleView[]>([]);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState<boolean>(false);

  const loadRoles = useCallback(async () => {
    if (!canAssignCustomRole) {
      setCustomRoles([]);
      return;
    }
    try {
      const response = await listRoles();
      setCustomRoles(response.data.roles);
    } catch {
      // Roles are optional for the users page
    }
  }, [canAssignCustomRole]);

  useEffect(() => {
    (async () => {
      await loadRoles();
    })();
  }, [loadRoles]);

  function getRoleDropdownOptions() {
    const baseOptions = canAssignBaseRole
      ? ROLE_OPTIONS.map((opt) => ({ value: opt.value, label: t(opt.labelKey) }))
      : ROLE_OPTIONS.filter((option) => option.value === "EMPLOYEE").map((opt) => ({
          value: opt.value,
          label: t(opt.labelKey),
        }));
    if (customRoles.length === 0) return baseOptions;
    return [
      ...baseOptions,
      { value: "---divider---", label: t("dashboard.users.dividerCustomRoles"), disabled: true },
      ...customRoles
        .filter((item) => item.status === "active")
        .map((r) => ({ value: `custom:${r.id}`, label: r.name })),
    ];
  }

  function getRoleLabel(user: UserView) {
    if (user.customRoleName) return user.customRoleName;
    return user.role === "COMPANY_ADMIN"
      ? t("dashboard.userRole.company_admin")
      : user.role === "EMPLOYEE"
        ? t("dashboard.userRole.employee")
        : user.role;
  }

  const loadUsers = useCallback(
    async (pageToLoad: number) => {
      setFetchError(null);
      setLoadingUsers(true);

      try {
        const params = new URLSearchParams({
          page: String(pageToLoad),
          pageSize: String(DEFAULT_PAGE_SIZE),
        });
        if (search.trim()) params.set("search", search.trim());
        if (roleFilter) params.set("role", roleFilter);

        const response = await apiClient<{
          success: boolean;
          data: { users: UserView[]; pagination: Pagination };
        }>(`/users?${params.toString()}`, {
          method: "GET",
        });

        setUsers(response.data.users);
        setPagination(response.data.pagination);
        setRowUpdates(
          response.data.users.reduce<RowUpdates>((acc, user) => {
            acc[user.id] = {
              role: user.customRoleId
                ? `custom:${user.customRoleId}`
                : user.role,
              status: user.status,
              isSaving: false,
              error: null,
            };
            return acc;
          }, {}),
        );
        setDeletingUserIds({});
      } catch (err) {
        if (err instanceof ApiError) {
          setFetchError(err.message);
        } else {
          setFetchError(t("dashboard.users.loadError"));
        }
      } finally {
        setLoadingUsers(false);
      }
    },
    [search, roleFilter, t],
  );

  useEffect(() => {
    (async () => {
      await loadUsers(page);
    })();
  }, [page, filtersKey, loadUsers]);

  useEffect(() => {
    if (!filtersInitializedRef.current) {
      filtersInitializedRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      setPage(1);
      setFiltersKey((key) => key + 1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search, roleFilter]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreateUsers) return;
    setStatus(null);
    setError(null);
    setIsSubmitting(true);

    try {
      const selectedRole = role.startsWith("custom:")
        ? customRoles.find((item) => item.id === role.slice("custom:".length))
        : (role as "COMPANY_ADMIN" | "EMPLOYEE");
      if (!selectedRole)
        throw new Error(t("dashboard.users.selectedRoleUnavailable"));
      const result = await inviteUserWithRole({
        name,
        email,
        role: selectedRole,
      });
      const emailFailed = result.emailDelivery && !result.emailDelivery.sent;
      if (result.status === "assignment-failed") {
        setPendingAssignment({ userId: result.user.id, role: result.role });
        setStatus(t("dashboard.users.invitedCustomRoleFailed"));
        setError(t("dashboard.users.retryRoleAssignmentHelp"));
      } else if (emailFailed) {
        setPendingAssignment(null);
        setStatus(t("dashboard.users.invitedEmailFailed"));
      } else {
        setPendingAssignment(null);
        setStatus(t("dashboard.users.invitedSuccess"));
      }
      setName("");
      setEmail("");
      setRole("EMPLOYEE");
      void loadUsers(page);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t("dashboard.users.genericError"));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function retryPendingAssignment() {
    if (!pendingAssignment || !canAssignCustomRole) return;
    setError(null);
    try {
      const rolesResponse = await listRoles();
      setCustomRoles(rolesResponse.data.roles);
      const currentRole = rolesResponse.data.roles.find((item) => item.id === pendingAssignment.role.id);
      if (!currentRole || currentRole.status !== "active") {
        throw new Error(t("dashboard.users.customRoleNotAssignable"));
      }
      await retryInvitationRoleAssignment(pendingAssignment.userId, currentRole);
      setPendingAssignment(null);
      setStatus(t("dashboard.users.customRoleAssignedSuccess"));
      void loadUsers(page);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : t("dashboard.users.customRoleRetryFailed"),
      );
    }
  }

  async function handleUserUpdate(userId: string) {
    if (!canUpdateUsers) return;
    const update = rowUpdates[userId];
    if (!update) return;

    const user = users.find((item) => item.id === userId);
    if (!user) return;
    const currentRole = user.customRoleId
      ? `custom:${user.customRoleId}`
      : user.role;
    const roleChanged = update.role !== currentRole;
    if (roleChanged && !canAssignBaseRole) return;

    if (update.role === user.role && update.status === user.status) {
      return;
    }

    setRowUpdates((prev: RowUpdates): RowUpdates => ({
      ...prev,
      [userId]: { ...prev[userId], isSaving: true, error: null },
    }));
    setUpdateMessage(null);

    try {
      const updatedUser = roleChanged
        ? await (async () => {
            const selectedRole = update.role.startsWith("custom:")
              ? customRoles.find(
                  (item) => item.id === update.role.slice("custom:".length),
                )
              : (update.role as "COMPANY_ADMIN" | "EMPLOYEE");
            if (!selectedRole) {
              throw new Error(t("dashboard.users.selectedRoleUnavailable"));
            }
            return updateUserWithRole({
              user,
              selectedRole,
              status: update.status as UserView["status"],
            });
          })()
        : (
            await updateUser(user.id, {
              status: update.status as UserView["status"],
            })
          ).data.user;

      setUsers((current: UserView[]): UserView[] =>
        current.map((item) =>
          item.id === userId ? { ...item, ...updatedUser } : item,
        ),
      );
      setRowUpdates((prev: RowUpdates): RowUpdates => ({
        ...prev,
        [userId]: {
          role: updatedUser.customRoleId ? `custom:${updatedUser.customRoleId}` : updatedUser.role,
          status: updatedUser.status,
          isSaving: false,
          error: null,
        },
      }));
      setUpdateMessage(t("dashboard.users.updatedSuccess"));
      if (auth.status === "authenticated" && auth.user.id === userId) {
        await permissionContext.refreshPermissions();
      }
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : t("dashboard.users.updateFailed");

      setRowUpdates((prev: RowUpdates): RowUpdates => ({
        ...prev,
        [userId]: {
          ...prev[userId],
          isSaving: false,
          error: message,
        },
      }));
    }
  }

  async function handleUserDelete(userId: string) {
    if (!canDeleteUsers) return;
    setDeletingUserIds((prev: DeletingUserIds): DeletingUserIds => ({
      ...prev,
      [userId]: true,
    }));
    setFetchError(null);
    setUpdateMessage(null);

    try {
      const response = await apiClient<{ success: boolean; message: string }>(
        `/users/${userId}`,
        {
          method: "DELETE",
        },
      );

      setUpdateMessage(response.message ?? t("dashboard.users.deletedSuccess"));
      void loadUsers(page);
    } catch (err) {
      if (err instanceof ApiError) {
        setFetchError(err.message);
      } else {
        setFetchError(t("dashboard.users.deleteFailed"));
      }
    } finally {
      setDeletingUserIds((prev: DeletingUserIds): DeletingUserIds => ({
        ...prev,
        [userId]: false,
      }));
      setConfirmAction(null);
    }
  }

  async function handleResendInvitation(userId: string) {
    setResendingIds((prev: ResendingIds): ResendingIds => ({
      ...prev,
      [userId]: true,
    }));
    setFetchError(null);
    setUpdateMessage(null);

    try {
      const response = await resendInvitation(userId);
      const deliveryFailed =
        response.data.emailDelivery && !response.data.emailDelivery.sent;
      setUpdateMessage(
        deliveryFailed
          ? t("dashboard.users.inviteEmailQueued")
          : response.message ?? t("dashboard.users.inviteResentSuccess"),
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setFetchError(err.message);
      } else {
        setFetchError(t("dashboard.users.resendFailed"));
      }
    } finally {
      setResendingIds((prev: ResendingIds): ResendingIds => ({
        ...prev,
        [userId]: false,
      }));
    }
  }

  async function handleRevokeInvitation(userId: string) {
    setRevokingIds((prev: RevokingIds): RevokingIds => ({
      ...prev,
      [userId]: true,
    }));
    setFetchError(null);
    setUpdateMessage(null);

    try {
      const response = await revokeInvitation(userId);
      setUpdateMessage(response.message ?? t("dashboard.users.revokedSuccess"));
      void loadUsers(page);
    } catch (err) {
      if (err instanceof ApiError) {
        setFetchError(err.message);
      } else {
        setFetchError(t("dashboard.users.revokeFailed"));
      }
    } finally {
      setRevokingIds((prev: RevokingIds): RevokingIds => ({
        ...prev,
        [userId]: false,
      }));
      setConfirmAction(null);
    }
  }

  function handleRowChange(
    userId: string,
    field: keyof Omit<UserUpdateState, "isSaving" | "error">,
    value: string,
  ) {
    setRowUpdates((prev: RowUpdates): RowUpdates => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        [field]: value,
      },
    }));
  }

  return (
    <DashboardPage dir={dir}>
      <DashboardPageHeader
        guideId="page-heading-users"
        eyebrow={
          <div className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
            <span className="material-symbols-outlined text-[16px]">group</span>
            {t("dashboard.users.teamAccessEyebrow")}
          </div>
        }
        title={t("dashboard.users.teamManagementTitle")}
        description={t("dashboard.users.teamManagementDesc")}
        actions={
          <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-3 text-sm shadow-sm">
            <p className="font-semibold text-on-surface">
              {t("dashboard.users.manageAccessQuickly")}
            </p>
            <p className="mt-1 max-w-xs text-on-surface-variant">
              {t("dashboard.users.keepTeamAligned")}
            </p>
          </div>
        }
      />

      {canCreateUsers ? (
      <div className="mb-6 grid auto-rows-auto items-start gap-3 sm:gap-4 xl:grid-cols-[1.05fr_0.95fr] xl:gap-5">
        <DashboardPanel>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2
                className="text-title-lg font-bold text-primary"
                data-guide-id="users-invite-button"
              >
                {t("dashboard.users.inviteNewUser")}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                {t("dashboard.users.inviteNewUserDesc")}
              </p>
            </div>
            <div className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              {t("dashboard.users.newInviteBadge")}
            </div>
          </div>

          <form id="invite" className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-2 block text-label-md font-bold text-on-surface-variant">
                {t("dashboard.users.name")}
              </label>
              <input
                className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                data-guide-id="users-invite-form-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("dashboard.users.inviteeNamePlaceholder")}
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-label-md font-bold text-on-surface-variant">
                {t("dashboard.users.email")}
              </label>
              <input
                type="email"
                className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                data-guide-id="users-invite-form-email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t("dashboard.users.emailPlaceholder")}
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-label-md font-bold text-on-surface-variant">
                {t("dashboard.users.role")}
              </label>
              <select
                className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                data-guide-id="users-invite-form-role"
                value={role}
                onChange={(event) => setRole(event.target.value)}
              >
                {getRoleDropdownOptions().map((opt) =>
                  "disabled" in opt && opt.disabled ? (
                    <option key={opt.value} disabled>
                      {opt.label}
                    </option>
                  ) : (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ),
                )}
              </select>
            </div>

            {status ? (
              <div
                role="status"
                className="rounded-lg border border-emerald-200 bg-emerald-50 p-sm text-label-md text-emerald-900"
              >
                {status}
              </div>
            ) : null}

            {error ? (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 p-sm text-label-md text-red-900"
              >
                {error}
                {pendingAssignment ? (
                  <button
                    type="button"
                    className="ms-2 underline hover:text-red-950"
                    onClick={() => void retryPendingAssignment()}
                  >
                    {t("dashboard.users.retryRoleAssignmentBtn")}
                  </button>
                ) : null}
              </div>
            ) : null}

            <button
              type="submit"
              data-guide-id="users-invite-form-submit"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-lg py-sm text-label-lg font-bold text-on-primary shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? t("dashboard.users.sendingInvite")
                : t("dashboard.users.sendInvitation")}
            </button>
          </form>
        </DashboardPanel>

        <DashboardPanel className="h-full">
          <h3 className="text-title-md font-bold text-primary">
            {t("dashboard.users.whatYouCanControl")}
          </h3>
          <ul className="mt-5 space-y-4 text-sm leading-relaxed text-on-surface-variant">
            <li className="flex gap-3">
              <span className="mt-0.5 shrink-0 text-primary">•</span>
              <span>{t("dashboard.users.controlPoint1")}</span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 shrink-0 text-primary">•</span>
              <span>{t("dashboard.users.controlPoint2")}</span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 shrink-0 text-primary">•</span>
              <span>{t("dashboard.users.controlPoint3")}</span>
            </li>
          </ul>

          <div className="mt-5 rounded-2xl border border-outline-variant/30 bg-surface px-4 py-3 text-sm leading-relaxed text-on-surface-variant">
            {t("dashboard.users.customRolesTip")}
          </div>
        </DashboardPanel>
      </div>
      ) : null}

      <DashboardPanel>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-title-lg font-bold text-primary">
              {t("dashboard.users.title")}
            </h2>
            <p className="mt-1 text-body-sm leading-relaxed text-on-surface-variant">
              {t("dashboard.users.directoryDesc")}
            </p>
          </div>
          <div className="shrink-0 rounded-full bg-surface-container-low px-3 py-1 text-label-sm font-bold text-on-surface-variant">
            {t("dashboard.users.pageInfo", {
              page: String(pagination.page),
              totalPages: String(pagination.totalPages),
            })}
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-3 border-b border-outline-variant/30 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 min-[480px]:flex-row min-[480px]:items-center">
            <div className="relative min-[480px]:w-64">
              <span className="material-symbols-outlined pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">
                search
              </span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("dashboard.users.searchPlaceholder")}
                data-guide-id="users-search-input"
                className="w-full rounded-lg border border-outline-variant bg-surface py-2 ps-9 pe-3 text-sm transition-all outline-none placeholder:text-outline focus:border-transparent focus:ring-2 focus:ring-primary"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              data-guide-id="users-role-filter"
              className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary min-[480px]:w-48"
            >
              <option value="">{t("dashboard.users.allRoles")}</option>
              <option value="EMPLOYEE">
                {t("dashboard.userRole.employee")}
              </option>
              <option value="COMPANY_ADMIN">
                {t("dashboard.userRole.company_admin")}
              </option>
            </select>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              data-guide-id="users-import-button"
              onClick={() => setIsBulkImportOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 py-2 text-label-md font-bold text-on-surface shadow-sm transition-colors hover:bg-surface-container-low"
            >
              <span className="material-symbols-outlined text-[18px]">
                upload_file
              </span>
              {t("dashboard.users.bulkImport")}
            </button>
            <Link
              href="/dashboard/users/import/history"
              className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 py-2 text-label-md font-bold text-on-surface shadow-sm transition-colors hover:bg-surface-container-low"
            >
              <span className="material-symbols-outlined text-[18px]">
                history
              </span>
              {t("dashboard.users.importHistory")}
            </Link>
          </div>
        </div>

        {fetchError ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            {fetchError}
          </div>
        ) : null}

        {updateMessage ? (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            {updateMessage}
          </div>
        ) : null}

        {loadingUsers ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-on-surface-variant">
            <span className="material-symbols-outlined animate-spin">
              progress_activity
            </span>
            {t("dashboard.users.loadingDirectory")}
          </div>
        ) : (
          <div className="max-w-full overflow-x-auto rounded-xl border border-outline-variant/30">
            <table className="w-full min-w-[940px] divide-y divide-outline-variant/30 text-start text-sm">
              <thead className="bg-surface-container-low">
                <tr>
                  <th className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                    {t("dashboard.users.name")}
                  </th>
                  <th className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                    {t("dashboard.users.email")}
                  </th>
                  <th className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                    {t("dashboard.users.role")}
                  </th>
                  <th className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                    {t("dashboard.users.status")}
                  </th>
                  <th className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                    {t("dashboard.users.verified")}
                  </th>
                  <th className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                    {t("dashboard.users.created")}
                  </th>
                  <th className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                    {t("dashboard.users.actions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30 bg-surface-container-lowest">
                {users.length > 0 ? (
                  users.map((user) => {
                    const update = rowUpdates[user.id] ?? {
                      role: user.role,
                      status: user.status,
                      isSaving: false,
                    };
                    const currentRoleValue = user.customRoleId
                      ? `custom:${user.customRoleId}`
                      : user.role;
                    const isChanged =
                      update.role !== currentRoleValue ||
                      update.status !== user.status;
                    const isDeleting = deletingUserIds[user.id] === true;
                    const isPending =
                      user.status === "pending_email_verification";
                    const isResending = resendingIds[user.id] === true;
                    const isRevoking = revokingIds[user.id] === true;

                    return (
                      <tr
                        key={user.id}
                        className="transition-colors hover:bg-surface-container-low/50"
                      >
                        <td className="px-4 py-4 font-medium text-on-surface">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary-container text-xs font-bold text-on-secondary-container">
                              {user.name.charAt(0).toUpperCase()}
                            </div>
                            {user.name}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-on-surface-variant">
                          {user.email}
                        </td>
                        <td className="px-4 py-4 text-on-surface-variant">
                          {canUpdateUsers &&
                          canAssignBaseRole &&
                          (!user.customRoleId || canAssignCustomRole) ? (
                            <select
                              className="w-full rounded-md border border-outline-variant bg-surface px-2 py-1.5 text-sm text-on-surface shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                              value={update.role}
                              onChange={(event) =>
                                handleRowChange(
                                  user.id,
                                  "role",
                                  event.target.value,
                                )
                              }
                            >
                              {getRoleDropdownOptions().map((opt) =>
                                "disabled" in opt && opt.disabled ? (
                                  <option key={opt.value} disabled>
                                    {opt.label}
                                  </option>
                                ) : (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ),
                              )}
                            </select>
                          ) : (
                            <span>{getRoleLabel(user)}</span>
                          )}
                          {user.customRoleName ? (
                            <p className="mt-1 text-[11px] font-medium text-outline">
                              {getRoleLabel(user)}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-4 text-on-surface-variant">
                          {canUpdateUsers ? (
                            <select
                              className="w-full rounded-md border border-outline-variant bg-surface px-2 py-1.5 text-sm text-on-surface shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                              value={update.status}
                              onChange={(event) =>
                                handleRowChange(
                                  user.id,
                                  "status",
                                  event.target.value,
                                )
                              }
                            >
                              {STATUS_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {codeLabel(
                                    t,
                                    "dashboard.userStatus",
                                    option.value,
                                  )}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span>
                              {codeLabel(t, "dashboard.userStatus", user.status)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-on-surface-variant">
                          {user.emailVerified ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-tertiary-container/30 px-2 py-0.5 text-xs font-bold text-tertiary-fixed-dim">
                              <span className="material-symbols-outlined text-[14px]">
                                verified
                              </span>{" "}
                              {t("dashboard.users.yes")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-surface-container px-2 py-0.5 text-xs font-medium text-on-surface-variant">
                              {t("dashboard.users.no")}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-sm text-on-surface-variant">
                          {new Date(user.createdAt).toLocaleDateString(
                            intlLocale,
                          )}
                        </td>
                        <td className="px-4 py-4 text-on-surface-variant">
                          <div className="flex flex-col gap-2 sm:flex-row">
                            {canUpdateUsers ? (
                              <button
                                type="button"
                                className="inline-flex items-center justify-center rounded-md bg-secondary px-3 py-1.5 text-xs font-bold text-on-secondary shadow-sm transition-colors hover:bg-secondary-container hover:text-on-secondary-container disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={
                                  !isChanged || update.isSaving || isDeleting
                                }
                                onClick={() => void handleUserUpdate(user.id)}
                              >
                                {update.isSaving
                                  ? t("dashboard.users.saving")
                                  : t("dashboard.users.actionUpdate")}
                              </button>
                            ) : null}
                            {isPending && canCreateUsers ? (
                              <button
                                type="button"
                                className="inline-flex items-center justify-center rounded-md border border-outline-variant bg-surface px-3 py-1.5 text-xs font-bold text-on-surface shadow-sm transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={isResending || isDeleting}
                                onClick={() =>
                                  void handleResendInvitation(user.id)
                                }
                                data-guide-id="users-resend-button"
                              >
                                {isResending
                                  ? t("dashboard.users.resending")
                                  : t("dashboard.users.actionResend")}
                              </button>
                            ) : null}
                            {isPending && canDeleteUsers ? (
                              <button
                                type="button"
                                className="inline-flex items-center justify-center rounded-md border border-warning/40 bg-surface px-3 py-1.5 text-xs font-bold text-warning shadow-sm transition-colors hover:bg-warning/10 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={isRevoking || isDeleting}
                                onClick={() =>
                                  setConfirmAction({
                                    type: "revoke",
                                    userId: user.id,
                                    userName: user.name,
                                  })
                                }
                                data-guide-id="users-revoke-button"
                              >
                                {isRevoking
                                  ? t("dashboard.users.revoking")
                                  : t("dashboard.users.actionRevoke")}
                              </button>
                            ) : null}
                            {canDeleteUsers ? (
                              <button
                                type="button"
                                className="inline-flex items-center justify-center rounded-md border border-error/30 bg-surface px-3 py-1.5 text-xs font-bold text-error shadow-sm transition-colors hover:bg-error-container hover:text-on-error-container disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={isDeleting}
                                onClick={() =>
                                  setConfirmAction({
                                    type: "delete",
                                    userId: user.id,
                                    userName: user.name,
                                  })
                                }
                                data-guide-id="users-delete-button"
                              >
                                {isDeleting
                                  ? t("dashboard.users.deleting")
                                  : t("dashboard.users.actionDelete")}
                              </button>
                            ) : null}
                          </div>
                          {update.error ? (
                            <p className="mt-2 text-[11px] text-error">
                              {update.error}
                            </p>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-sm text-on-surface-variant"
                    >
                      {search.trim() || roleFilter
                        ? t("dashboard.users.noMatchingUsers")
                        : t("dashboard.users.noTenantUsers")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3 min-[390px]:flex-row min-[390px]:items-center min-[390px]:justify-between" data-guide-id="users-pagination">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 py-2 text-label-md font-bold text-on-surface shadow-sm transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-50"
            disabled={page <= 1}
            onClick={() =>
              setPage((current: number): number => Math.max(1, current - 1))
            }
          >
            <span className="material-symbols-outlined text-[18px] rtl:rotate-180">
              chevron_left
            </span>
            {t("dashboard.users.previous")}
          </button>
          <div className="text-label-sm font-medium text-on-surface-variant">
            {tPlural("dashboard.users.showingUsers", pagination.totalRecords, {
              count: String(users.length),
              total: String(pagination.totalRecords),
            })}
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-label-md font-bold text-on-primary shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={page >= pagination.totalPages}
            onClick={() =>
              setPage((current: number): number =>
                Math.min(pagination.totalPages, current + 1),
              )
            }
          >
            {t("dashboard.users.next")}
            <span className="material-symbols-outlined text-[18px] rtl:rotate-180">
              chevron_right
            </span>
          </button>
        </div>
      </DashboardPanel>

      <ConfirmDialog
        open={confirmAction !== null}
        title={
          confirmAction?.type === "revoke"
            ? t("dashboard.users.revokeDialogTitle")
            : t("dashboard.users.deleteDialogTitle")
        }
        description={
          confirmAction?.type === "revoke"
            ? t("dashboard.users.revokeDialogDesc", {
                name: confirmAction.userName,
              })
            : t("dashboard.users.deleteDialogDesc", {
                name: confirmAction?.userName ?? t("dashboard.users.thisUser"),
              })
        }
        confirmLabel={
          confirmAction?.type === "revoke"
            ? t("dashboard.users.actionRevoke")
            : t("dashboard.users.actionDeleteUser")
        }
        variant="danger"
        isLoading={
          confirmAction
            ? confirmAction.type === "delete"
              ? deletingUserIds[confirmAction.userId] === true
              : revokingIds[confirmAction.userId] === true
            : false
        }
        error={fetchError}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction) return;
          if (confirmAction.type === "delete") {
            void handleUserDelete(confirmAction.userId);
          } else {
            void handleRevokeInvitation(confirmAction.userId);
          }
        }}
      />
      <BulkImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        onImportSuccess={() => {
          void loadUsers(page);
        }}
      />
    </DashboardPage>
  );
}
