"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useAuth } from "@/providers/auth-provider";

const companyLinks = [
  ["Dashboard", "/dashboard", false],
  ["Team", "/dashboard/users", false],
  ["Roles", "/dashboard/roles", false],
  ["Documents", "/dashboard/documents", false],
  ["Chat", "/chat", true],
  ["Analytics", "/dashboard/analytics", false],
  ["Knowledge Gaps", "/dashboard/knowledge-gaps", false],
  ["Settings", "/dashboard/settings", false],
] as const;

export function AppNavigation() {
  const auth = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const logoutPending = useRef(false);
  if (auth.status !== "authenticated") return null;

  async function handleLogout() {
    if (logoutPending.current) return;
    logoutPending.current = true;
    setLoggingOut(true);
    try {
      await auth.logout();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  const links =
    auth.user.role === "SUPER_ADMIN"
      ? [["Tenant Management", "/platform/tenants", false] as const]
      : auth.user.role === "COMPANY_ADMIN"
        ? companyLinks
        : ([
            ["Dashboard", "/dashboard", false],
            ["Documents", "/documents", true],
            ["Chat", "/chat", true],
          ] as const);
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
      <div className="mx-auto flex max-w-7xl items-center gap-3 py-3">
        <Link
          className="shrink-0 font-bold tracking-tight text-slate-950"
          href="/dashboard"
        >
          DocuMind AI
        </Link>
        <nav
          aria-label="Application"
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto px-2 text-sm"
        >
          {links.map(([name, href, comingSoon]) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? "page" : undefined}
              className={`whitespace-nowrap rounded-lg px-3 py-2 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${pathname === href ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}
            >
              {name}
              {comingSoon ? (
                <span className="ml-1 text-[10px] text-slate-400">Soon</span>
              ) : null}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={loggingOut}
          aria-busy={loggingOut || undefined}
          aria-label="Log out"
          className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-60"
        >
          {loggingOut ? "Logging out…" : "Log out"}
        </button>
      </div>
    </header>
  );
}
