"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { inviteUser, listUsers } from "@/services/users.service";
import type { UserView, UsersPagination } from "@/types/api/users.types";
import { useAuth } from "@/providers/auth-provider";

<<<<<<< HEAD:app/src/app/(dashboard)/users/page.tsx
const PAGE_SIZE = 10;
const pretty = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
=======
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
>>>>>>> 296b449ba5680daa5dd9285b9a33440851157a84:app/src/app/(dashboard)/dashboard/users/page.tsx

export default function UsersPage() {
  const auth = useAuth();
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [role, setRole] = useState<"EMPLOYEE" | "COMPANY_ADMIN">("EMPLOYEE");
  const [notice, setNotice] = useState(""); const [formError, setFormError] = useState(""); const [submitting, setSubmitting] = useState(false); const submissionPending = useRef(false);
  const [users, setUsers] = useState<UserView[]>([]); const [fetchError, setFetchError] = useState(""); const [loading, setLoading] = useState(true); const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<UsersPagination>({ page: 1, pageSize: PAGE_SIZE, totalPages: 1, totalRecords: 0 });

<<<<<<< HEAD:app/src/app/(dashboard)/users/page.tsx
  const load = useCallback(async (pageToLoad: number, signal?: AbortSignal) => {
    setLoading(true); setFetchError("");
    try { const response = await listUsers(pageToLoad, PAGE_SIZE, signal); setUsers(response.data.users); setPagination(response.data.pagination); }
    catch { if (!signal?.aborted) setFetchError("Unable to load the team directory. Please try again."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); setTimeout(() => void load(page, controller.signal), 0); return () => controller.abort(); }, [page, load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submissionPending.current) return;
    const cleanName = name.trim(); const cleanEmail = email.trim().toLowerCase(); setNotice(""); setFormError("");
    if (cleanName.length < 2) { setFormError("Enter a full name with at least two characters."); return; }
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) { setFormError("Enter a valid email address."); return; }
    submissionPending.current = true; setSubmitting(true);
    try { const response = await inviteUser({ name: cleanName, email: cleanEmail, role }); setNotice(response.message || "Invitation sent successfully."); setName(""); setEmail(""); setRole("EMPLOYEE"); setPage(1); await load(1); }
    catch { setFormError("Unable to send the invitation. Check the details and try again."); }
    finally { submissionPending.current = false; setSubmitting(false); }
  }

  const isAdmin = auth.status === "authenticated" && auth.user.role === "COMPANY_ADMIN";
  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-8 lg:p-10">
      <header><p className="text-sm font-semibold text-blue-700">{auth.status === "authenticated" ? auth.tenant.name : "Workspace"}</p><h1 className="mt-1 text-3xl font-bold text-slate-950">Team & users</h1><p className="mt-2 text-sm text-slate-600">Invite teammates and review workspace access.</p></header>
      {isAdmin ? <section id="invite" className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6"><h2 className="text-xl font-bold">Invite an employee</h2><p className="mt-1 text-sm text-slate-600">An email will guide the new team member through account setup.</p><form onSubmit={submit} noValidate className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr_220px_auto] lg:items-end"><label className="text-sm font-semibold text-slate-700">Full name<input name="name" value={name} disabled={submitting} onChange={(event) => setName(event.target.value)} className="mt-1 block h-11 w-full rounded-xl border border-slate-300 bg-white px-3 focus:ring-2 focus:ring-blue-500" placeholder="Employee name" /></label><label className="text-sm font-semibold text-slate-700">Email<input name="email" type="email" value={email} disabled={submitting} onChange={(event) => setEmail(event.target.value)} className="mt-1 block h-11 w-full rounded-xl border border-slate-300 bg-white px-3 focus:ring-2 focus:ring-blue-500" placeholder="employee@company.com" /></label><label className="text-sm font-semibold text-slate-700">Role<select name="role" value={role} disabled={submitting} onChange={(event) => setRole(event.target.value as typeof role)} className="mt-1 block h-11 w-full rounded-xl border border-slate-300 bg-white px-3 focus:ring-2 focus:ring-blue-500"><option value="EMPLOYEE">Employee</option><option value="COMPANY_ADMIN">Company Admin</option></select></label><button disabled={submitting} aria-busy={submitting || undefined} className="h-11 rounded-xl bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800 disabled:opacity-60">{submitting ? "Sending…" : "Send invite"}</button></form><div aria-live="polite" className="mt-4 min-h-5 text-sm">{notice ? <p className="text-emerald-800">{notice}</p> : null}{formError ? <p role="alert" className="text-red-800">{formError}</p> : null}</div></section> : null}
      <section className="mt-8"><div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-bold">User directory</h2><p className="mt-1 text-sm text-slate-600">{pagination.totalRecords} workspace member{pagination.totalRecords === 1 ? "" : "s"}</p></div><p className="text-sm text-slate-500">Page {pagination.page} of {Math.max(1, pagination.totalPages)}</p></div>
        {fetchError ? <div role="alert" className="mt-4 rounded-xl bg-red-50 p-5 text-red-800"><p>{fetchError}</p><button onClick={() => void load(page)} className="mt-3 rounded-lg bg-red-700 px-4 py-2 font-semibold text-white">Retry</button></div> : loading ? <div role="status" className="mt-4 space-y-3">{[1,2,3].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}<span className="sr-only">Loading users</span></div> : users.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-600">No users found for this workspace.</div> : <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50"><tr>{["Name","Email","Role","Status","Email verified","Created"].map((heading) => <th key={heading} scope="col" className="px-4 py-3 font-semibold text-slate-700">{heading}</th>)}</tr></thead><tbody>{users.map((user) => <tr key={user.id} className="border-t border-slate-200"><td className="max-w-56 px-4 py-4 font-semibold text-slate-950"><span className="block truncate">{user.name}</span></td><td className="max-w-64 px-4 py-4 text-slate-600"><span className="block truncate" title={user.email}>{user.email}</span></td><td className="px-4 py-4 text-slate-600">{pretty(user.role)}</td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${user.status === "active" ? "bg-emerald-50 text-emerald-800" : user.status === "disabled" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>{pretty(user.status)}</span></td><td className="px-4 py-4 text-slate-600">{user.emailVerified ? "Verified" : "Not verified"}</td><td className="whitespace-nowrap px-4 py-4 text-slate-600">{new Date(user.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>}
        {!loading && !fetchError && pagination.totalRecords > 0 ? <nav aria-label="User pagination" className="mt-5 flex items-center justify-between gap-3"><button disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-lg border px-4 py-2 font-semibold disabled:opacity-40">Previous</button><span className="text-sm text-slate-600">Showing {users.length} of {pagination.totalRecords}</span><button disabled={page >= pagination.totalPages} onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))} className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-40">Next</button></nav> : null}
      </section>
=======
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

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
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
>>>>>>> 296b449ba5680daa5dd9285b9a33440851157a84:app/src/app/(dashboard)/dashboard/users/page.tsx
    </main>
  );
}
