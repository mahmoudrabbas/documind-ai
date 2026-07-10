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
    const loadPage = async () => {
      setFetchError(null);
      setLoadingUsers(true);

      try {
        const response = await apiClient<{
          success: boolean;
          data: { users: UserView[]; pagination: Pagination };
        }>(`/users?page=${page}&pageSize=${DEFAULT_PAGE_SIZE}`, {
          method: "GET",
        });

        setUsers(response.data.users);
        setPagination(response.data.pagination);
      } catch (err) {
        if (err instanceof ApiError) {
          setFetchError(err.message);
        } else {
          setFetchError("Unable to load users. Please try again.");
        }
      } finally {
        setLoadingUsers(false);
      }
    };

    void loadPage();
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

  return (
    <main className="p-6">
      <div className="max-w-4xl">
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="mt-2 text-sm text-slate-600">Invite teammates and manage user access for your company.</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-slate-700">Name</label>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Invitee name"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Email</label>
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
            <label className="block text-sm font-medium text-slate-700">Role</label>
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
            <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">{status}</div>
          ) : null}

          {error ? (
            <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-900">{error}</div>
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
              <p className="mt-1 text-sm text-slate-600">Browse tenant users and review access status.</p>
            </div>
            <div className="text-sm text-slate-600">
              Page {pagination.page} of {pagination.totalPages}
            </div>
          </div>

          {fetchError ? (
            <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-900">{fetchError}</div>
          ) : null}

          {loadingUsers ? (
            <div className="text-sm text-slate-600">Loading users...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 font-medium text-slate-700">Name</th>
                    <th className="px-4 py-3 font-medium text-slate-700">Email</th>
                    <th className="px-4 py-3 font-medium text-slate-700">Role</th>
                    <th className="px-4 py-3 font-medium text-slate-700">Status</th>
                    <th className="px-4 py-3 font-medium text-slate-700">Verified</th>
                    <th className="px-4 py-3 font-medium text-slate-700">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {users.length > 0 ? (
                    users.map((user) => (
                      <tr key={user.id}>
                        <td className="px-4 py-3 text-slate-900">{user.name}</td>
                        <td className="px-4 py-3 text-slate-600">{user.email}</td>
                        <td className="px-4 py-3 text-slate-600">{user.role}</td>
                        <td className="px-4 py-3 text-slate-600">{user.status}</td>
                        <td className="px-4 py-3 text-slate-600">{user.emailVerified ? "Yes" : "No"}</td>
                        <td className="px-4 py-3 text-slate-600">{new Date(user.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-sm text-slate-500">
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
              onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
            >
              Next
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
