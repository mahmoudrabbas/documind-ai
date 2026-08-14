"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ApiError, apiClient } from "@/lib/api-client";
import { listRoles } from "@/services/roles.service";
import { listTaxonomy } from "@/services/document-policy.service";
import {
  inviteUserWithRole,
  resendInvitation,
  retryInvitationRoleAssignment,
  revokeInvitation,
  updateUser,
  updateUserWithRole,
} from "@/services/users.service";
import type { RoleView, UserView } from "@/types/api/users.types";
import type { TaxonomyView } from "@/types/api/document-policy.types";
import { useAuth } from "@/providers/auth-provider";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";
import { usePermissions } from "@/providers/permission-provider";
import { Permission } from "@/types/api/permissions.types";
import { DashboardPage, DashboardPageHeader, DashboardPanel } from "@/components/ui/DashboardPage";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { BulkImportModal } from "@/components/users/BulkImportModal";

type Pagination = { page: number; pageSize: number; totalPages: number; totalRecords: number };
type ConfirmAction =
  | { type: "delete" | "revoke"; userId: string; userName: string }
  | null;
type EditState = {
  user: UserView;
  role: string;
  departmentId: string;
  status: UserView["status"];
  saving: boolean;
  error: string | null;
};

const STATUS_OPTIONS: UserView["status"][] = [
  "active",
  "pending_email_verification",
  "disabled",
];
const ROLE_OPTIONS = [
  { value: "EMPLOYEE", labelKey: "dashboard.userRole.employee" },
  { value: "COMPANY_ADMIN", labelKey: "dashboard.userRole.company_admin" },
];
const DEFAULT_PAGE_SIZE = 10;

function roleValue(user: UserView) {
  return user.customRoleId ? `custom:${user.customRoleId}` : user.role;
}

export default function UsersPage() {
  const { t, tPlural, dir } = useI18n();
  const intlLocale = useIntlLocale();
  const auth = useAuth();
  const permissions = usePermissions();
  const canCreate = permissions.can(Permission.USERS_CREATE);
  const canUpdate = permissions.can(Permission.USERS_UPDATE);
  const canDelete = permissions.can(Permission.USERS_DELETE);
  const canAssignBaseRole = permissions.can(Permission.USERS_ASSIGN_ROLE);
  const canAssignCustomRole = canAssignBaseRole && canUpdate && permissions.can(Permission.ROLES_READ);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("EMPLOYEE");
  const [departmentId, setDepartmentId] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingAssignment, setPendingAssignment] = useState<{ userId: string; role: RoleView } | null>(null);

  const [users, setUsers] = useState<UserView[]>([]);
  const [roles, setRoles] = useState<RoleView[]>([]);
  const [departments, setDepartments] = useState<TaxonomyView[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingDepartments, setLoadingDepartments] = useState(true);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [departmentError, setDepartmentError] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 10, totalPages: 1, totalRecords: 0 });
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [filtersKey, setFiltersKey] = useState(0);
  const filtersInitialized = useRef(false);

  const [edit, setEdit] = useState<EditState | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);

  const loadOptions = useCallback(async () => {
    setLoadingDepartments(true);
    setDepartmentError(null);
    const rolePromise = canAssignCustomRole ? listRoles() : Promise.resolve(null);
    setLoadingRoles(canAssignCustomRole);
    setRoleError(null);
    const [departmentResult, roleResult] = await Promise.allSettled([
      listTaxonomy("departments", { page: 1, pageSize: 100, status: "active" }),
      rolePromise,
    ]);
    if (departmentResult.status === "fulfilled") {
      setDepartments(departmentResult.value.data.departments ?? []);
    } else {
      setDepartments([]);
      setDepartmentError(t("dashboard.users.departmentLoadError"));
    }
    if (roleResult.status === "fulfilled") {
      setRoles(roleResult.value?.data.roles ?? []);
    } else {
      setRoles([]);
      setRoleError(t("dashboard.users.roleLoadError"));
    }
    setLoadingDepartments(false);
    setLoadingRoles(false);
  }, [canAssignCustomRole, t]);

  useEffect(() => { void loadOptions(); }, [loadOptions]);

  const loadUsers = useCallback(async (requestedPage: number) => {
    setLoadingUsers(true);
    setDirectoryError(null);
    try {
      const params = new URLSearchParams({ page: String(requestedPage), pageSize: String(DEFAULT_PAGE_SIZE) });
      if (search.trim()) params.set("search", search.trim());
      if (roleFilter) params.set("role", roleFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (departmentFilter) params.set("departmentId", departmentFilter);
      const response = await apiClient<{ success: true; data: { users: UserView[]; pagination: Pagination } }>(
        `/users?${params.toString()}`,
        { method: "GET" },
      );
      setUsers(response.data.users);
      setPagination(response.data.pagination);
    } catch (error) {
      setDirectoryError(error instanceof ApiError ? error.message : t("dashboard.users.loadError"));
    } finally {
      setLoadingUsers(false);
    }
  }, [departmentFilter, roleFilter, search, statusFilter, t]);

  useEffect(() => { void loadUsers(page); }, [filtersKey, loadUsers, page]);
  useEffect(() => {
    if (!filtersInitialized.current) { filtersInitialized.current = true; return; }
    const timer = window.setTimeout(() => {
      setPage(1);
      setFiltersKey((value) => value + 1);
    }, search ? 350 : 0);
    return () => window.clearTimeout(timer);
  }, [departmentFilter, roleFilter, search, statusFilter]);

  const roleOptions = () => {
    const base = (canAssignBaseRole ? ROLE_OPTIONS : ROLE_OPTIONS.filter((item) => item.value === "EMPLOYEE"))
      .map((item) => ({ value: item.value, label: t(item.labelKey) }));
    const custom = roles.filter((item) => item.status === "active")
      .map((item) => ({ value: `custom:${item.id}`, label: item.name }));
    return custom.length ? [...base, { value: "role-divider", label: t("dashboard.users.dividerCustomRoles"), disabled: true }, ...custom] : base;
  };
  const departmentOptions = [
    { value: "", label: t("dashboard.users.noDepartment") },
    ...departments.map((item) => ({ value: item.id, label: item.name })),
  ];
  const statusOptions = STATUS_OPTIONS.map((value) => ({ value, label: codeLabel(t, "dashboard.userStatus", value) }));

  function selectedRole(value: string): "COMPANY_ADMIN" | "EMPLOYEE" | RoleView | null {
    if (value.startsWith("custom:")) return roles.find((item) => item.id === value.slice(7)) ?? null;
    return value === "COMPANY_ADMIN" || value === "EMPLOYEE" ? value : null;
  }

  function getRoleLabel(user: UserView) {
    if (user.customRoleName) return user.customRoleName;
    return user.role === "COMPANY_ADMIN" ? t("dashboard.userRole.company_admin") : t("dashboard.userRole.employee");
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate || submitting) return;
    setSubmitting(true);
    setInviteError(null);
    setInviteMessage(null);
    try {
      const chosenRole = selectedRole(role);
      if (!chosenRole) throw new Error(t("dashboard.users.selectedRoleUnavailable"));
      const result = await inviteUserWithRole({ name, email, role: chosenRole, departmentId: departmentId || null });
      const emailFailed = result.emailDelivery?.sent === false;
      if (result.status === "assignment-failed") {
        setPendingAssignment({ userId: result.user.id, role: result.role });
        setInviteMessage(t("dashboard.users.invitedCustomRoleFailed"));
        setInviteError(t("dashboard.users.retryRoleAssignmentHelp"));
      } else {
        setPendingAssignment(null);
        setInviteMessage(emailFailed ? t("dashboard.users.invitedEmailFailed") : t("dashboard.users.invitedSuccess"));
      }
      setName(""); setEmail(""); setRole("EMPLOYEE"); setDepartmentId("");
      await loadUsers(page);
    } catch (error) {
      setInviteError(error instanceof ApiError ? error.message : t("dashboard.users.genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  async function retryAssignment() {
    if (!pendingAssignment || !canAssignCustomRole) return;
    setInviteError(null);
    try {
      const response = await listRoles();
      const current = response.data.roles.find((item) => item.id === pendingAssignment.role.id && item.status === "active");
      if (!current) throw new Error("unavailable");
      await retryInvitationRoleAssignment(pendingAssignment.userId, current);
      setPendingAssignment(null);
      setInviteMessage(t("dashboard.users.customRoleAssignedSuccess"));
      await loadUsers(page);
    } catch (error) {
      setInviteError(error instanceof ApiError ? error.message : t("dashboard.users.customRoleRetryFailed"));
    }
  }

  function openEditor(user: UserView) {
    setEdit({ user, role: roleValue(user), departmentId: user.departmentId ?? "", status: user.status, saving: false, error: null });
  }

  async function saveEditor() {
    if (!edit || edit.saving || !canUpdate) return;
    const roleChanged = edit.role !== roleValue(edit.user);
    const departmentChanged = edit.departmentId !== (edit.user.departmentId ?? "");
    const statusChanged = edit.status !== edit.user.status;
    if (!roleChanged && !departmentChanged && !statusChanged) { setEdit(null); return; }
    if (roleChanged && !canAssignBaseRole) return;
    setEdit({ ...edit, saving: true, error: null });
    try {
      let updated: UserView;
      if (roleChanged) {
        const chosenRole = selectedRole(edit.role);
        if (!chosenRole) throw new Error(t("dashboard.users.selectedRoleUnavailable"));
        updated = await updateUserWithRole({
          user: edit.user,
          selectedRole: chosenRole,
          status: edit.status,
          departmentId: edit.departmentId || null,
        });
      } else {
        updated = (await updateUser(edit.user.id, {
          ...(statusChanged ? { status: edit.status } : {}),
          ...(departmentChanged ? { departmentId: edit.departmentId || null } : {}),
        })).data.user;
      }
      setUsers((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
      setSuccessMessage(t("dashboard.users.updatedSuccess"));
      setEdit(null);
      if (auth.status === "authenticated" && auth.user.id === updated.id) await permissions.refreshPermissions();
    } catch (error) {
      setEdit((current) => current ? { ...current, saving: false, error: error instanceof ApiError ? error.message : t("dashboard.users.updateFailed") } : null);
    }
  }

  async function runDeleteOrRevoke() {
    if (!confirmAction) return;
    const action = confirmAction;
    setBusyIds((current) => ({ ...current, [action.userId]: true }));
    setDirectoryError(null);
    try {
      if (action.type === "delete") {
        const response = await apiClient<{ success: true; message: string }>(`/users/${action.userId}`, { method: "DELETE" });
        setSuccessMessage(response.message ?? t("dashboard.users.deletedSuccess"));
      } else {
        const response = await revokeInvitation(action.userId);
        setSuccessMessage(response.message ?? t("dashboard.users.revokedSuccess"));
      }
      setConfirmAction(null);
      await loadUsers(page);
    } catch (error) {
      setDirectoryError(error instanceof ApiError ? error.message : action.type === "delete" ? t("dashboard.users.deleteFailed") : t("dashboard.users.revokeFailed"));
    } finally {
      setBusyIds((current) => ({ ...current, [action.userId]: false }));
    }
  }

  async function handleResend(userId: string) {
    setBusyIds((current) => ({ ...current, [userId]: true }));
    setDirectoryError(null);
    try {
      const response = await resendInvitation(userId);
      setSuccessMessage(response.message ?? t("dashboard.users.inviteResentSuccess"));
    } catch (error) {
      setDirectoryError(error instanceof ApiError ? error.message : t("dashboard.users.resendFailed"));
    } finally {
      setBusyIds((current) => ({ ...current, [userId]: false }));
    }
  }

  const userActions = (user: UserView) => (
    <div className="flex flex-wrap items-center gap-2">
      {canUpdate ? <button type="button" onClick={() => openEditor(user)} className="rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/10" data-guide-id="users-edit-button">{t("dashboard.users.editUser")}</button> : null}
      {user.status === "pending_email_verification" && canCreate ? <button type="button" disabled={busyIds[user.id]} onClick={() => void handleResend(user.id)} className="rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-bold hover:bg-surface-container-low" data-guide-id="users-resend-button">{t("dashboard.users.actionResend")}</button> : null}
      {user.status === "pending_email_verification" && canDelete ? <button type="button" disabled={busyIds[user.id]} onClick={() => setConfirmAction({ type: "revoke", userId: user.id, userName: user.name })} className="rounded-lg px-3 py-1.5 text-xs font-bold text-warning hover:bg-warning/10" data-guide-id="users-revoke-button">{t("dashboard.users.actionRevoke")}</button> : null}
      {canDelete ? <button type="button" disabled={busyIds[user.id]} onClick={() => setConfirmAction({ type: "delete", userId: user.id, userName: user.name })} className="rounded-lg px-3 py-1.5 text-xs font-bold text-error hover:bg-error-container" data-guide-id="users-delete-button">{t("dashboard.users.actionDelete")}</button> : null}
    </div>
  );

  return (
    <DashboardPage dir={dir}>
      <DashboardPageHeader
        guideId="page-heading-users"
        eyebrow={<div className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary"><span className="material-symbols-outlined text-[16px]">group</span>{t("dashboard.users.teamAccessEyebrow")}</div>}
        title={t("dashboard.users.teamManagementTitle")}
        description={t("dashboard.users.teamManagementDesc")}
      />

      {canCreate ? <DashboardPanel className="mb-6">
        <div className="mb-5"><h2 className="text-title-lg font-bold text-primary" data-guide-id="users-invite-button">{t("dashboard.users.inviteNewUser")}</h2><p className="mt-1 text-sm text-on-surface-variant">{t("dashboard.users.inviteNewUserDesc")}</p></div>
        <form id="invite" onSubmit={handleInvite} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-label-md font-bold text-on-surface-variant">{t("dashboard.users.name")}<input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} placeholder={t("dashboard.users.inviteeNamePlaceholder")} className="mt-2 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 outline-none focus:ring-2 focus:ring-primary" data-guide-id="users-invite-form-name" /></label>
          <label className="text-label-md font-bold text-on-surface-variant">{t("dashboard.users.email")}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder={t("dashboard.users.emailPlaceholder")} className="mt-2 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 outline-none focus:ring-2 focus:ring-primary" data-guide-id="users-invite-form-email" /></label>
          <Select label={t("dashboard.users.role")} value={role} onChange={(event) => setRole(event.target.value)} options={roleOptions()} disabled={loadingRoles} helperText={roleError ?? undefined} data-guide-id="users-invite-form-role" />
          <Select label={t("dashboard.users.department")} value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} options={departmentOptions} disabled={loadingDepartments || Boolean(departmentError)} helperText={loadingDepartments ? t("dashboard.users.loadingDepartments") : departmentError ?? (departments.length === 0 ? t("dashboard.users.noDepartmentsAvailable") : undefined)} data-guide-id="users-invite-form-department" />
          <div className="md:col-span-2 xl:col-span-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div aria-live="polite">{inviteMessage ? <p className="text-sm text-emerald-700">{inviteMessage}</p> : null}{inviteError ? <p className="text-sm text-error">{inviteError}</p> : null}{pendingAssignment ? <button type="button" onClick={() => void retryAssignment()} className="mt-2 text-sm font-bold text-primary">{t("dashboard.users.retryRoleAssignmentBtn")}</button> : null}</div>
            <button type="submit" disabled={submitting || loadingDepartments || Boolean(departmentError)} className="inline-flex min-w-40 items-center justify-center rounded-lg bg-primary px-5 py-2.5 font-bold text-on-primary disabled:opacity-50">{submitting ? t("dashboard.users.sendingInvite") : t("dashboard.users.sendInvitation")}</button>
          </div>
        </form>
      </DashboardPanel> : null}

      <DashboardPanel>
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div><h2 className="text-title-lg font-bold text-on-surface">{t("dashboard.users.title")}</h2><p className="mt-1 text-sm text-on-surface-variant">{t("dashboard.users.directoryDesc")}</p></div>
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[220px] flex-1"><span className="material-symbols-outlined pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[18px] text-outline">search</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("dashboard.users.searchPlaceholder")} className="w-full rounded-lg border border-outline-variant bg-surface py-2 ps-9 pe-3 text-sm outline-none focus:ring-2 focus:ring-primary" data-guide-id="users-search-input" /></div>
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm" data-guide-id="users-role-filter"><option value="">{t("dashboard.users.allRoles")}</option><option value="EMPLOYEE">{t("dashboard.userRole.employee")}</option><option value="COMPANY_ADMIN">{t("dashboard.userRole.company_admin")}</option></select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm"><option value="">{t("dashboard.users.allStatuses")}</option>{statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
            <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} disabled={loadingDepartments || Boolean(departmentError)} className="rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm disabled:opacity-50"><option value="">{t("dashboard.users.allDepartments")}</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <button type="button" onClick={() => setIsBulkImportOpen(true)} className="rounded-lg border border-outline-variant px-3 py-2 text-sm font-bold" data-guide-id="users-import-button">{t("dashboard.users.bulkImport")}</button>
            <Link href="/dashboard/users/import/history" className="rounded-lg border border-outline-variant px-3 py-2 text-sm font-bold">{t("dashboard.users.importHistory")}</Link>
          </div>
        </div>

        {directoryError ? <div role="alert" className="mb-4 rounded-xl border border-error/30 bg-error/10 p-4 text-sm text-error">{directoryError}</div> : null}
        {successMessage ? <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{successMessage}</div> : null}
        {loadingUsers ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-on-surface-variant"><span className="material-symbols-outlined animate-spin">progress_activity</span>{t("dashboard.users.loadingDirectory")}</div> : <>
          <div className="hidden overflow-x-auto rounded-xl border border-outline-variant/30 lg:block">
            <table className="w-full min-w-[980px] divide-y divide-outline-variant/30 text-start text-sm">
              <thead className="bg-surface-container-low"><tr>{["user", "department", "role", "status", "verified", "created", "actions"].map((key) => <th key={key} className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">{t(`dashboard.users.${key}`)}</th>)}</tr></thead>
              <tbody className="divide-y divide-outline-variant/30">{users.map((user) => <tr key={user.id} className="hover:bg-surface-container-low/50">
                <td className="px-4 py-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary-container font-bold text-on-secondary-container">{user.name.charAt(0).toUpperCase()}</div><div><p className="font-bold text-on-surface">{user.name}</p><p className="text-xs text-on-surface-variant">{user.email}</p></div></div></td>
                <td className="px-4 py-4 text-on-surface-variant">{user.departmentName ?? t("dashboard.users.noDepartment")}</td>
                <td className="px-4 py-4"><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{getRoleLabel(user)}</span></td>
                <td className="px-4 py-4"><span className="rounded-full bg-surface-container px-2.5 py-1 text-xs font-bold">{codeLabel(t, "dashboard.userStatus", user.status)}</span></td>
                <td className="px-4 py-4">{user.emailVerified ? t("dashboard.users.yes") : t("dashboard.users.no")}</td>
                <td className="whitespace-nowrap px-4 py-4 text-on-surface-variant">{new Date(user.createdAt).toLocaleDateString(intlLocale)}</td>
                <td className="px-4 py-4">{userActions(user)}</td>
              </tr>)}{users.length === 0 ? <tr><td colSpan={7} className="px-4 py-12 text-center text-on-surface-variant">{search || roleFilter || statusFilter || departmentFilter ? t("dashboard.users.noMatchingUsers") : t("dashboard.users.noTenantUsers")}</td></tr> : null}</tbody>
            </table>
          </div>
          <div className="grid gap-3 lg:hidden">{users.map((user) => <article key={user.id} className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary-container font-bold">{user.name.charAt(0).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="font-bold text-on-surface">{user.name}</p><p className="truncate text-sm text-on-surface-variant">{user.email}</p></div><span className="rounded-full bg-surface-container px-2 py-1 text-xs font-bold">{codeLabel(t, "dashboard.userStatus", user.status)}</span></div><dl className="my-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-outline">{t("dashboard.users.department")}</dt><dd>{user.departmentName ?? t("dashboard.users.noDepartment")}</dd></div><div><dt className="text-xs text-outline">{t("dashboard.users.role")}</dt><dd>{getRoleLabel(user)}</dd></div><div><dt className="text-xs text-outline">{t("dashboard.users.verified")}</dt><dd>{user.emailVerified ? t("dashboard.users.yes") : t("dashboard.users.no")}</dd></div><div><dt className="text-xs text-outline">{t("dashboard.users.created")}</dt><dd>{new Date(user.createdAt).toLocaleDateString(intlLocale)}</dd></div></dl>{userActions(user)}</article>)}{users.length === 0 ? <div className="py-12 text-center text-on-surface-variant">{t("dashboard.users.noTenantUsers")}</div> : null}</div>
        </>}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" data-guide-id="users-pagination"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-outline-variant px-4 py-2 font-bold disabled:opacity-50">{t("dashboard.users.previous")}</button><p className="text-sm text-on-surface-variant">{tPlural("dashboard.users.showingUsers", pagination.totalRecords, { count: String(users.length), total: String(pagination.totalRecords) })}</p><button type="button" disabled={page >= pagination.totalPages} onClick={() => setPage((value) => Math.min(pagination.totalPages, value + 1))} className="rounded-lg bg-primary px-4 py-2 font-bold text-on-primary disabled:opacity-50">{t("dashboard.users.next")}</button></div>
      </DashboardPanel>

      <Modal open={edit !== null} onClose={() => { if (!edit?.saving) setEdit(null); }} title={t("dashboard.users.editUser")} maxWidth="max-w-xl" footer={<div className="flex justify-end gap-3"><button type="button" disabled={edit?.saving} onClick={() => setEdit(null)} className="rounded-lg px-4 py-2 font-bold text-on-surface-variant">{t("common.cancel")}</button><button type="button" disabled={edit?.saving || loadingDepartments} onClick={() => void saveEditor()} className="rounded-lg bg-primary px-5 py-2 font-bold text-on-primary disabled:opacity-50">{edit?.saving ? t("dashboard.users.saving") : t("dashboard.users.saveChanges")}</button></div>}>
        {edit ? <div className="space-y-5"><div className="rounded-xl bg-surface-container-low p-4"><p className="font-bold">{edit.user.name}</p><p className="text-sm text-on-surface-variant">{edit.user.email}</p><p className="mt-2 text-xs text-outline">{t("dashboard.users.verified")}: {edit.user.emailVerified ? t("dashboard.users.yes") : t("dashboard.users.no")} · {t("dashboard.users.created")}: {new Date(edit.user.createdAt).toLocaleDateString(intlLocale)}</p></div><Select label={t("dashboard.users.role")} value={edit.role} onChange={(event) => setEdit({ ...edit, role: event.target.value })} options={roleOptions()} disabled={!canAssignBaseRole || loadingRoles} helperText={roleError ?? undefined} /><Select label={t("dashboard.users.department")} value={edit.departmentId} onChange={(event) => setEdit({ ...edit, departmentId: event.target.value })} options={departmentOptions} disabled={loadingDepartments || Boolean(departmentError)} helperText={departmentError ?? undefined} /><Select label={t("dashboard.users.status")} value={edit.status} onChange={(event) => setEdit({ ...edit, status: event.target.value as UserView["status"] })} options={statusOptions} />{edit.error ? <div role="alert" className="rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error">{edit.error}</div> : null}</div> : null}
      </Modal>
      <ConfirmDialog open={confirmAction !== null} title={confirmAction?.type === "revoke" ? t("dashboard.users.revokeDialogTitle") : t("dashboard.users.deleteDialogTitle")} description={confirmAction?.type === "revoke" ? t("dashboard.users.revokeDialogDesc", { name: confirmAction.userName }) : t("dashboard.users.deleteDialogDesc", { name: confirmAction?.userName ?? t("dashboard.users.thisUser") })} confirmLabel={confirmAction?.type === "revoke" ? t("dashboard.users.actionRevoke") : t("dashboard.users.actionDeleteUser")} variant="danger" isLoading={confirmAction ? busyIds[confirmAction.userId] : false} error={directoryError} onCancel={() => setConfirmAction(null)} onConfirm={() => void runDeleteOrRevoke()} />
      <BulkImportModal isOpen={isBulkImportOpen} onClose={() => setIsBulkImportOpen(false)} onImportSuccess={() => void loadUsers(page)} />
    </DashboardPage>
  );
}
