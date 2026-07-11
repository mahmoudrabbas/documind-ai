"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from "@/lib/auth-tokens";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: "📊" },
  { href: "/dashboard/documents", label: "Documents", icon: "📄" },
  { href: "/dashboard/users", label: "Users", icon: "👥" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "📈" },
  { href: "/dashboard/knowledge-gaps", label: "Gaps", icon: "🧠" },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙️" },
];

type LoginResponse = {
  success: true;
  data: {
    tokens: {
      accessToken: string;
    };
  };
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    async function requireAuth() {
      if (getAccessToken()) {
        setIsCheckingSession(false);
        return;
      }

      try {
        const response = await apiClient<LoginResponse>("/auth/refresh", {
          method: "POST",
          auth: false,
          redirectOnAuthFailure: false,
        });

        setAccessToken(response.data.tokens.accessToken);
        setIsCheckingSession(false);
      } catch {
        clearAccessToken();
        router.replace("/login");
      }
    }

    requireAuth();
  }, [router]);

  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-[#001524] text-slate-100 flex items-center justify-center">
        <div className="rounded-3xl border border-[#083256] bg-[#061e2d] p-10 text-center shadow-xl shadow-slate-950/20">
          <p className="text-sm text-slate-300">Checking authentication…</p>
        </div>
      </div>
    );
  }

  async function handleLogout() {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    clearAccessToken();

    try {
      await apiClient("/auth/logout", {
        method: "POST",
        auth: false,
        redirectOnAuthFailure: false,
      });
    } catch {
      // ignore errors, still redirect to login
    } finally {
      router.replace("/login");
    }
  }

  return (
    <div className="min-h-screen bg-[#001524] text-slate-100">
      <div className="mx-auto grid min-h-screen max-w-[1700px] grid-cols-1 gap-6 px-4 py-4 sm:px-6 lg:grid-cols-[280px_1fr] lg:px-8">
        <aside className="flex min-h-[calc(100vh-32px)] flex-col rounded-[2rem] border border-[#083256] bg-[#061e2d] p-6 shadow-xl shadow-slate-950/30">
          <div className="mb-10">
            <Link href="/dashboard" className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-3xl bg-blue-600 text-lg font-semibold text-white shadow-lg shadow-blue-500/20">
                D
              </span>
              <div>
                <p className="text-sm font-semibold text-white">DocuMind AI</p>
                <p className="text-xs text-blue-300">Enterprise Knowledge</p>
              </div>
            </Link>
          </div>

          <nav className="space-y-2 text-sm font-medium">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-3xl px-4 py-3 text-slate-200 transition hover:bg-[#0b3650] hover:text-white"
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>

          <div className="mt-auto space-y-4 border-t border-[#083256] pt-6 text-sm text-slate-400">
            <button className="w-full rounded-3xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700">
              Ask DocuMind
            </button>
            <Link
              href="/dashboard/settings"
              className="block rounded-3xl px-4 py-3 text-slate-300 transition hover:bg-[#0b3650] hover:text-white"
            >
              Settings
            </Link>
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="w-full rounded-3xl bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoggingOut ? "Signing out…" : "Logout"}
            </button>
          </div>
        </aside>

        <div>{children}</div>
      </div>
    </div>
  );
}
