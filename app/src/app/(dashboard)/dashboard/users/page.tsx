"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, apiClient } from "@/lib/api-client";
import { listRoles } from "@/services/roles.service";
import type { RoleView } from "@/types/api/users.types";

type UserView = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: string;
  customRoleId?: string;
  customRoleName?: string;
  status: string;
  emailVerified: boolean;
  createdAt: string;
};

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

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "pending_email_verification", label: "Pending verification" },
  { value: "disabled", label: "Disabled" },
];

const ROLE_OPTIONS = [
  { value: "EMPLOYEE", label: "Employee" },
  { value: "COMPANY_ADMIN", label: "Company Admin" },
];

const DEFAULT_PAGE_SIZE = 10;

export default function UsersPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("EMPLOYEE");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [users, setUsers] = useState<UserView[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [rowUpdates, setRowUpdates] = useState<Record<string, UserUpdateState>>(
    {},
  );
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [deletingUserIds, setDeletingUserIds] = useState<
    Record<string, boolean>
  >({});
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    totalPages: 1,
    totalRecords: 0,
  });

  const [customRoles, setCustomRoles] = useState<RoleView[]>([]);

  const loadRoles = useCallback(async () => {
    try {
      const response = await listRoles();
      setCustomRoles(response.data.roles);
    } catch {
      // Roles are optional for the users page
    }
  }, []);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  function getRoleDropdownOptions() {
    if (customRoles.length === 0) return ROLE_OPTIONS;
    return [
      ...ROLE_OPTIONS,
      { value: "---divider---", label: "─── Custom Roles ───", disabled: true },
      ...customRoles.map((r) => ({ value: `custom:${r.id}`, label: r.name })),
    ];
  }

  function getRoleLabel(role: UserView) {
    if (role.customRoleName) return role.customRoleName;
    return role.role === "COMPANY_ADMIN" ? "Company Admin" : role.role === "EMPLOYEE" ? "Employee" : role.role;
  }

  async function loadUsers(pageToLoad: number) {
    setFetchError(null);
    setLoadingUsers(true);

    try {
      const response = await apiClient<{
        success: boolean;
        data: { users: UserView[]; pagination: Pagination };
      }>(`/users?page=${pageToLoad}&pageSize=${DEFAULT_PAGE_SIZE}`, {
        method: "GET",
      });

      setUsers(response.data.users);
      setPagination(response.data.pagination);
      setRowUpdates(
        response.data.users.reduce(
          (acc, user) => {
            acc[user.id] = {
              role: user.role,
              status: user.status,
              isSaving: false,
              error: null,
            };
            return acc;
          },
          {} as Record<string, UserUpdateState>,
        ),
      );
      setDeletingUserIds({});
    } catch (err) {
      if (err instanceof ApiError) {
        setFetchError(err.message);
      } else {
        setFetchError("Unable to load users. Please try again.");
      }
    } finally {
      setLoadingUsers(false);
    }
  }

  useEffect(() => {
    void loadUsers(page);
  }, [page]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setError(null);
    setIsSubmitting(true);

    try {
      const body: Record<string, unknown> = { name, email };
      if (role.startsWith("custom:")) {
        body.customRoleId = role.slice("custom:".length);
      } else {
        body.role = role;
      }

      const response = await apiClient<{ success: boolean; message: string }>(
        "/users",
        {
          method: "POST",
          body,
        },
      );

      setStatus(response.message ?? "Invitation sent successfully.");
      setName("");
      setEmail("");
      setRole("EMPLOYEE");
      void loadUsers(page);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUserUpdate(userId: string) {
    const update = rowUpdates[userId];
    if (!update) return;

    const user = users.find((item) => item.id === userId);
    if (!user) return;

    if (update.role === user.role && update.status === user.status) {
      return;
    }

    setRowUpdates((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], isSaving: true, error: null },
    }));
    setUpdateMessage(null);

    try {
      const body: Record<string, unknown> = {};
      if (update.role.startsWith("custom:")) {
        body.customRoleId = update.role.slice("custom:".length);
      } else {
        body.role = update.role;
      }
      body.status = update.status;

      const response = await apiClient<{
        success: boolean;
        data: { user: UserView };
      }>(`/users/${userId}`, {
        method: "PATCH",
        body,
      });

      setUsers((current) =>
        current.map((item) =>
          item.id === userId ? { ...item, ...response.data.user } : item,
        ),
      );
      setRowUpdates((prev) => ({
        ...prev,
        [userId]: {
          role: response.data.user.role,
          status: response.data.user.status,
          isSaving: false,
          error: null,
        },
      }));
      setUpdateMessage("User updated successfully.");
    } catch (err) {
      setRowUpdates((prev) => ({
        ...prev,
        [userId]: {
          ...prev[userId],
          isSaving: false,
          error:
            err instanceof ApiError ? err.message : "Failed to update user.",
        },
      }));
    }
  }

  async function handleUserDelete(userId: string) {
    setDeletingUserIds((prev) => ({ ...prev, [userId]: true }));
    setFetchError(null);
    setUpdateMessage(null);

    try {
      const response = await apiClient<{ success: boolean; message: string }>(
        `/users/${userId}`,
        {
          method: "DELETE",
        },
      );

      setUpdateMessage(response.message ?? "User deleted successfully.");
      void loadUsers(page);
    } catch (err) {
      if (err instanceof ApiError) {
        setFetchError(err.message);
      } else {
        setFetchError("Unable to delete user. Please try again.");
      }
    } finally {
      setDeletingUserIds((prev) => ({ ...prev, [userId]: false }));
    }
  }

  function handleRowChange(
    userId: string,
    field: keyof Omit<UserUpdateState, "isSaving" | "error">,
    value: string,
  ) {
    setRowUpdates((prev) => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        [field]: value,
      } as UserUpdateState,
    }));
  }

  return (
    <main className="p-lg max-w-[1600px] mx-auto w-full flex-1">
      <div className="mb-xl mt-6">
        <h1 className="text-headline-lg font-bold text-primary">Team Management</h1>
        <p className="mt-2 text-body-md text-on-surface-variant">
          Invite teammates and manage user access for your company.
        </p>
      </div>

      <div className="bg-surface-container-lowest p-lg md:p-xl rounded-3xl shadow-sm border border-outline-variant/30 mb-xl max-w-2xl">
        <h2 className="text-title-lg font-bold text-primary mb-6">Invite New User</h2>
        <form id="invite" className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <label className="block text-label-md font-bold text-on-surface-variant mb-2">
              Name
            </label>
            <input
              className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Invitee name"
              required
            />
          </div>

          <div>
            <label className="block text-label-md font-bold text-on-surface-variant mb-2">
              Email
            </label>
            <input
              type="email"
              className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="invitee@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-label-md font-bold text-on-surface-variant mb-2">
              Role
            </label>
            <select
              className="w-full rounded-lg border border-outline-variant bg-surface px-md py-sm transition-all outline-none focus:border-transparent focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              {getRoleDropdownOptions().map((opt) =>
                "disabled" in opt && opt.disabled ? (
                  <option key={opt.value} disabled>{opt.label}</option>
                ) : (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                )
              )}
            </select>
          </div>

          {status ? (
            <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900 border border-emerald-200">
              {status}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl bg-red-50 p-4 text-sm text-red-900 border border-red-200">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-label-md font-bold text-on-primary shadow-sm hover:bg-secondary-container hover:text-on-secondary-container transition-all disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-[18px]">person_add</span>
            )}
            {isSubmitting ? "Sending invitation..." : "Send invite"}
          </button>
        </form>
      </div>

        <section className="rounded-3xl border border-outline-variant/30 bg-surface-container-lowest p-lg shadow-sm">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-title-lg font-bold text-primary">User Directory</h2>
              <p className="mt-1 text-body-sm text-on-surface-variant">
                Browse tenant users and review access status.
              </p>
            </div>
            <div className="text-label-sm font-bold text-on-surface-variant bg-surface-container-low px-3 py-1 rounded-full">
              Page {pagination.page} of {pagination.totalPages}
            </div>
          </div>

          {fetchError ? (
            <div className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-900 border border-red-200">
              {fetchError}
            </div>
          ) : null}

          {updateMessage ? (
            <div className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900 border border-emerald-200">
              {updateMessage}
            </div>
          ) : null}

          {loadingUsers ? (
            <div className="flex items-center gap-2 text-sm text-on-surface-variant py-8 justify-center">
              <span className="material-symbols-outlined animate-spin">progress_activity</span>
              Loading directory...
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-outline-variant/30">
              <table className="min-w-full divide-y divide-outline-variant/30 text-left text-sm">
                <thead className="bg-surface-container-low">
                  <tr>
                    <th className="px-4 py-3 font-bold text-on-surface-variant text-label-sm uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-4 py-3 font-bold text-on-surface-variant text-label-sm uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-4 py-3 font-bold text-on-surface-variant text-label-sm uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-4 py-3 font-bold text-on-surface-variant text-label-sm uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 font-bold text-on-surface-variant text-label-sm uppercase tracking-wider">
                      Verified
                    </th>
                    <th className="px-4 py-3 font-bold text-on-surface-variant text-label-sm uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-4 py-3 font-bold text-on-surface-variant text-label-sm uppercase tracking-wider">
                      Actions
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
                      const isChanged =
                        update.role !== user.role ||
                        update.status !== user.status;
                      const isDeleting = deletingUserIds[user.id] === true;

                      return (
                        <tr key={user.id} className="hover:bg-surface-container-low/50 transition-colors">
                          <td className="px-4 py-4 text-on-surface font-medium">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold text-xs shrink-0">
                                {user.name.charAt(0).toUpperCase()}
                              </div>
                              {user.name}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-on-surface-variant">
                            {user.email}
                          </td>
                          <td className="px-4 py-4 text-on-surface-variant">
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
                                  <option key={opt.value} disabled>{opt.label}</option>
                                ) : (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                )
                              )}
                            </select>
                            {user.customRoleName ? (
                              <p className="mt-1 text-[11px] text-outline font-medium">{getRoleLabel(user)}</p>
                            ) : null}
                          </td>
                          <td className="px-4 py-4 text-on-surface-variant">
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
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-4 text-on-surface-variant">
                            {user.emailVerified ? (
                              <span className="inline-flex items-center gap-1 text-tertiary-fixed-dim bg-tertiary-container/30 px-2 py-0.5 rounded-full text-xs font-bold">
                                <span className="material-symbols-outlined text-[14px]">verified</span> Yes
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full text-xs font-medium">
                                No
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-on-surface-variant text-sm whitespace-nowrap">
                            {new Date(user.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-4 text-on-surface-variant">
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <button
                                type="button"
                                className="inline-flex items-center justify-center rounded-md bg-secondary text-on-secondary px-3 py-1.5 text-xs font-bold shadow-sm hover:bg-secondary-container hover:text-on-secondary-container transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={
                                  !isChanged || update.isSaving || isDeleting
                                }
                                onClick={() => void handleUserUpdate(user.id)}
                              >
                                {update.isSaving ? "Saving..." : "Update"}
                              </button>
                              <button
                                type="button"
                                className="inline-flex items-center justify-center rounded-md border border-error/30 bg-surface px-3 py-1.5 text-xs font-bold text-error shadow-sm hover:bg-error-container hover:text-on-error-container transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={isDeleting}
                                onClick={() => void handleUserDelete(user.id)}
                              >
                                {isDeleting ? "Deleting..." : "Delete"}
                              </button>
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
                        No users found for this tenant.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 py-2 text-label-md font-bold text-on-surface shadow-sm hover:bg-surface-container-low transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
              Previous
            </button>
            <div className="text-label-sm text-on-surface-variant font-medium">
              Showing {users.length} of {pagination.totalRecords} users
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-label-md font-bold text-on-primary shadow-sm hover:opacity-90 transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              disabled={page >= pagination.totalPages}
              onClick={() =>
                setPage((current) =>
                  Math.min(pagination.totalPages, current + 1),
                )
              }
            >
              Next
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </button>
          </div>
        </section>
    </main>
  );
}
