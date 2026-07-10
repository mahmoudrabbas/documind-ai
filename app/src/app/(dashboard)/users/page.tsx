"use client";

import { useState, type FormEvent } from "react";
import { ApiError, apiClient } from "@/lib/api-client";

export default function UsersPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("EMPLOYEE");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      <div className="max-w-2xl">
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
      </div>
    </main>
  );
}
