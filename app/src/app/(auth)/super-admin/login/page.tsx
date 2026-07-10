"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiClient } from "@/lib/api-client";
import { useAuth, type AuthTenant, type AuthUser } from "@/providers/auth-provider";

type Response = { success: true; data: { user: AuthUser; tenant: AuthTenant; tokens: { accessToken: string } } };

export default function SuperAdminLoginPage() {
  const router = useRouter(); const auth = useAuth(); const pending = useRef(false);
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending.current) return; setError(""); pending.current = true; setSubmitting(true);
    try {
      const response = await apiClient<Response>("/auth/super-admin/login", { method: "POST", auth: false, credentials: "include", body: { email: email.trim().toLowerCase(), password } });
      auth.establishSession(response.data.tokens.accessToken, { user: response.data.user, tenant: response.data.tenant });
      router.replace("/super-admin/tenants"); router.refresh();
    } catch (caught) { setError(caught instanceof ApiError && caught.status === 401 ? "Invalid email or password." : "Unable to sign in. Please try again."); }
    finally { pending.current = false; setSubmitting(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4"><section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-8"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-700 font-bold text-white">DM</div><p className="mt-6 text-sm font-semibold text-blue-700">Platform administration</p><h1 className="mt-1 text-3xl font-bold text-slate-950">Super Admin sign in</h1><p className="mt-2 text-sm text-slate-600">Use your platform administrator credentials.</p><form className="mt-7 space-y-5" onSubmit={submit} noValidate><label className="block text-sm font-semibold text-slate-700">Email<input name="email" type="email" autoComplete="email" value={email} disabled={submitting} onChange={(event) => setEmail(event.target.value)} required className="mt-1 block h-11 w-full rounded-xl border border-slate-300 px-3 focus:ring-2 focus:ring-blue-500" /></label><label className="block text-sm font-semibold text-slate-700">Password<input name="password" type="password" autoComplete="current-password" value={password} disabled={submitting} onChange={(event) => setPassword(event.target.value)} required className="mt-1 block h-11 w-full rounded-xl border border-slate-300 px-3 focus:ring-2 focus:ring-blue-500" /></label><div aria-live="polite" className="min-h-5 text-sm text-red-700">{error}</div><button disabled={submitting} aria-busy={submitting || undefined} className="h-11 w-full rounded-xl bg-blue-700 font-semibold text-white hover:bg-blue-800 disabled:opacity-60">{submitting ? "Signing in…" : "Sign in"}</button></form></section></main>;
}
