"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiError, apiClient } from "@/lib/api-client";

type UserView = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: string;
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
      const response = await apiClient<{ success: boolean; message: string }>(
        "/users",
        {
          method: "POST",
          body: { name, email, role },
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
      const response = await apiClient<{
        success: boolean;
        data: { user: UserView };
      }>(`/users/${userId}`, {
        method: "PATCH",
        body: {
          role: update.role,
          status: update.status,
        },
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
    <main className="p-6">
      <div className="max-w-4xl">
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="mt-2 text-sm text-slate-600">
          Invite teammates and manage user access for your company.
        </p>

        <form id="invite" className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Name
            </label>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Invitee name"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              type="email"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="invitee@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              Role
            </label>
            <select
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              <option value="EMPLOYEE">Employee</option>
              <option value="COMPANY_ADMIN">Company Admin</option>
            </select>
          </div>

          {status ? (
            <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
              {status}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-900">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Sending invitation..." : "Send invite"}
          </button>
        </form>

        <section className="mt-10 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">User directory</h2>
              <p className="mt-1 text-sm text-slate-600">
                Browse tenant users and review access status.
              </p>
            </div>
            <div className="text-sm text-slate-600">
              Page {pagination.page} of {pagination.totalPages}
            </div>
          </div>

          {fetchError ? (
            <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-900">
              {fetchError}
            </div>
          ) : null}

          {updateMessage ? (
            <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
              {updateMessage}
            </div>
          ) : null}

          {loadingUsers ? (
            <div className="text-sm text-slate-600">Loading users...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 font-medium text-slate-700">
                      Name
                    </th>
                    <th className="px-4 py-3 font-medium text-slate-700">
                      Email
                    </th>
                    <th className="px-4 py-3 font-medium text-slate-700">
                      Role
                    </th>
                    <th className="px-4 py-3 font-medium text-slate-700">
                      Status
                    </th>
                    <th className="px-4 py-3 font-medium text-slate-700">
                      Verified
                    </th>
                    <th className="px-4 py-3 font-medium text-slate-700">
                      Created
                    </th>
                    <th className="px-4 py-3 font-medium text-slate-700">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
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
                        <tr key={user.id}>
                          <td className="px-4 py-3 text-slate-900">
                            {user.name}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {user.email}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <select
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                              value={update.role}
                              onChange={(event) =>
                                handleRowChange(
                                  user.id,
                                  "role",
                                  event.target.value,
                                )
                              }
                            >
                              {ROLE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <select
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
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
                          <td className="px-4 py-3 text-slate-600">
                            {user.emailVerified ? "Yes" : "No"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {new Date(user.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <button
                                type="button"
                                className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={
                                  !isChanged || update.isSaving || isDeleting
                                }
                                onClick={() => void handleUserUpdate(user.id)}
                              >
                                {update.isSaving ? "Updating..." : "Update"}
                              </button>
                              <button
                                type="button"
                                className="inline-flex items-center justify-center rounded-md border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-700 shadow-sm hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={isDeleting}
                                onClick={() => void handleUserDelete(user.id)}
                              >
                                {isDeleting ? "Deleting..." : "Delete"}
                              </button>
                            </div>
                            {update.error ? (
                              <p className="mt-2 text-xs text-rose-600">
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
                        className="px-4 py-6 text-sm text-slate-500"
                      >
                        No users found for this tenant.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </button>
            <div className="text-sm text-slate-600">
              Showing {users.length} of {pagination.totalRecords} users
            </div>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={page >= pagination.totalPages}
              onClick={() =>
                setPage((current) =>
                  Math.min(pagination.totalPages, current + 1),
                )
              }
            >
              Next
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
