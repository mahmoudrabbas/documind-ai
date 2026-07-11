"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listAllUsers } from "@/services/users.service";
import type { UserView } from "@/types/api/users.types";
import { useAuth } from "@/providers/auth-provider";

export default function DashboardPage() {
  const auth = useAuth();
  const [users, setUsers] = useState<UserView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (auth.status !== "authenticated" || auth.user.role !== "COMPANY_ADMIN")
      return;
    const controller = new AbortController();
    setTimeout(() => {
      setLoading(true);
      setError("");
      void listAllUsers(controller.signal)
        .then(setUsers)
        .catch(() => {
          if (!controller.signal.aborted)
            setError("Team summary is temporarily unavailable.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 0);
    return () => controller.abort();
  }, [auth]);
  if (auth.status !== "authenticated") return null;
  if (auth.user.role !== "COMPANY_ADMIN")
    return (
      <main className="mx-auto max-w-5xl p-6 sm:p-10">
        <p className="text-sm font-semibold text-blue-600">
          {auth.tenant.name}
        </p>
        <h1 className="mt-2 text-3xl font-bold">Welcome, {auth.user.name}</h1>
        <p className="mt-3 text-slate-600">
          Your DocuMind AI workspace is ready.
        </p>
      </main>
    );

  const pending = users.filter(
    (user) =>
      user.status === "pending" || user.status === "pending_email_verification",
  ).length;
  const cards = [
    ["Total team members", users.length, "Everyone in this workspace"],
    [
      "Active users",
      users.filter((user) => user.status === "active").length,
      "Enabled team accounts",
    ],
    ["Pending invitations", pending, "Awaiting account completion"],
    [
      "Company admins",
      users.filter((user) => user.role === "COMPANY_ADMIN").length,
      "Workspace administrators",
    ],
  ] as const;
  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-8 lg:p-10">
      <header className="rounded-3xl bg-slate-950 p-6 text-white sm:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-blue-300">
              {auth.tenant.name}
            </p>
            <h1 className="mt-2 break-words text-3xl font-bold sm:text-4xl">
              Welcome back, {auth.user.name}
            </h1>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-blue-500/20 px-3 py-1 text-blue-200">
                Company Admin
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1">
                {auth.tenant.plan.toUpperCase()} plan
              </span>
            </div>
          </div>
          <Link
            href="/dashboard/users#invite"
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 px-5 font-semibold text-white hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            Invite employee
          </Link>
        </div>
      </header>
      <section aria-labelledby="team-summary" className="mt-8">
        <div className="flex items-center justify-between">
          <h2 id="team-summary" className="text-xl font-bold text-slate-950">
            Team summary
          </h2>
          <Link
            href="/dashboard/users"
            className="text-sm font-semibold text-blue-700"
          >
            Manage team →
          </Link>
        </div>
        {error ? (
          <div
            role="alert"
            className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800"
          >
            {error}
          </div>
        ) : null}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(([title, count, description]) => (
            <article
              key={title}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <p className="text-sm font-medium text-slate-600">{title}</p>
              <p className="mt-2 text-3xl font-bold text-slate-950">
                {loading ? "—" : count}
              </p>
              <p className="mt-1 text-xs text-slate-500">{description}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <Link
          href="/dashboard/users"
          className="rounded-2xl border border-slate-200 p-5 hover:border-blue-400"
        >
          <h2 className="font-bold">Team & invitations</h2>
          <p className="mt-2 text-sm text-slate-600">
            Invite employees and review access.
          </p>
        </Link>
        {[
          ["Documents", "/dashboard/documents"],
          ["AI workspace", "/chat"],
        ].map(([name, href]) => (
          <Link
            key={href}
            href={href}
            className="rounded-2xl border border-slate-200 p-5 hover:border-blue-400"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-bold">{name}</h2>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">
                Coming soon
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              This workspace area is being prepared.
            </p>
          </Link>
        ))}
      </section>
    </main>
  );
}
