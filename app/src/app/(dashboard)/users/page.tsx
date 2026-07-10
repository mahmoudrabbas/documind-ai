"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { inviteUser, listUsers } from "@/services/users.service";
import type { UserView, UsersPagination } from "@/types/api/users.types";
import { useAuth } from "@/providers/auth-provider";

const PAGE_SIZE = 10;
const pretty = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function UsersPage() {
  const auth = useAuth();
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [role, setRole] = useState<"EMPLOYEE" | "COMPANY_ADMIN">("EMPLOYEE");
  const [notice, setNotice] = useState(""); const [formError, setFormError] = useState(""); const [submitting, setSubmitting] = useState(false); const submissionPending = useRef(false);
  const [users, setUsers] = useState<UserView[]>([]); const [fetchError, setFetchError] = useState(""); const [loading, setLoading] = useState(true); const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<UsersPagination>({ page: 1, pageSize: PAGE_SIZE, totalPages: 1, totalRecords: 0 });

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
    </main>
  );
}
