"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { ASK_AI_HREF, isKnownRole, SIDEBAR_LINKS } from "@/constants/routes";

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

  // Falls back to an empty nav for an unrecognized role rather than
  // guessing — surfaces the gap instead of silently rendering nothing
  // useful or the wrong links.
  const links = isKnownRole(auth.user.role)
    ? SIDEBAR_LINKS[auth.user.role]
    : [];

  return (
    <aside className="fixed left-0 top-0 z-50 flex h-screen w-full max-w-[280px] flex-col border-r border-outline-variant bg-surface md:w-[280px]">
      <div className="flex items-center gap-3 p-lg">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
          <span
            className="material-symbols-outlined text-on-primary"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            psychology
          </span>
        </div>
        <div>
          <h1 className="text-headline-md font-bold text-primary">
            DocuMind AI
          </h1>
          <p className="text-label-sm text-on-surface-variant">
            Enterprise Knowledge
          </p>
        </div>
      </div>
      <nav className="mt-md flex-1 space-y-1 px-md">
        {links.map(({ label, href, icon, comingSoon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                isActive
                  ? "border-l-4 border-tertiary-container bg-secondary-container/10 font-bold text-primary hover:bg-surface-container-high"
                  : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined">{icon}</span>
              <span className="text-body-md">{label}</span>
              {comingSoon && (
                <span className="ml-auto rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] uppercase tracking-wider text-on-surface-variant">
                  Soon
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-outline-variant p-md">
        <Link
          href={ASK_AI_HREF}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-tertiary py-3 text-label-md font-medium text-on-tertiary transition-all hover:opacity-90 active:scale-[0.99]"
        >
          <span
            className="material-symbols-outlined"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            auto_awesome
          </span>
          Ask DocuMind
        </Link>
        <div className="space-y-1">
          <Link
            href="#"
            className="flex items-center gap-3 px-4 py-2 text-on-surface-variant hover:text-on-surface"
          >
            <span className="material-symbols-outlined">help</span>
            <span className="text-body-sm">Help Center</span>
          </Link>
          <button
            onClick={() => void handleLogout()}
            disabled={loggingOut}
            className="flex w-full items-center gap-3 px-4 py-2 text-error hover:text-on-surface disabled:opacity-60"
          >
            <span className="material-symbols-outlined">logout</span>
            <span className="text-body-sm">
              {loggingOut ? "Logging out..." : "Logout"}
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
}
