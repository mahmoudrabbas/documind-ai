"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import {
  ASK_AI_HREF,
  isKnownRole,
  SETTINGS_HREF_BY_ROLE,
  TOPBAR_LINKS,
} from "@/constants/routes";

export function TopNavBar() {
  const auth = useAuth();
  const { user } = auth;
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setMenuOpen(false);
    try {
      await auth.logout();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  const role = user?.role && isKnownRole(user.role) ? user.role : null;
  const topLinks = role ? TOPBAR_LINKS[role] : [];
  const settingsHref = role ? SETTINGS_HREF_BY_ROLE[role] : undefined;

  return (
    <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-outline-variant bg-surface-bright/80 px-lg shadow-sm backdrop-blur-md">
      <div className="flex items-center gap-lg">
        <div className="relative hidden w-96 md:block">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant">
            search
          </span>
          <input
            className="w-full rounded-full border-none bg-surface-container-low py-2 pl-10 pr-4 text-label-md outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
            placeholder="Search knowledge base..."
            type="text"
          />
        </div>

        {topLinks.length > 0 && (
          <nav className="hidden items-center gap-md lg:flex">
            {topLinks.map(({ label, href }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={
                    isActive
                      ? "border-b-2 border-tertiary-container pb-1 text-label-md font-bold text-primary"
                      : "text-label-md text-on-surface-variant transition-opacity hover:text-on-surface"
                  }
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        )}
      </div>

      <div className="flex items-center gap-md">
        <div className="mr-md flex items-center gap-xs">
          <button
            aria-label="Notifications"
            className="relative rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high"
          >
            <span
              className="material-symbols-outlined"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              notifications
            </span>
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-error" />
          </button>

          {settingsHref && (
            <Link
              href={settingsHref}
              aria-label="Settings"
              className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high"
            >
              <span className="material-symbols-outlined">settings</span>
            </Link>
          )}
        </div>

        <Link
          href={ASK_AI_HREF}
          className="rounded-lg bg-primary px-4 py-2 text-label-md text-on-primary transition-opacity hover:opacity-80"
        >
          Ask AI
        </Link>

        {/* User Profile */}
        <div
          className="relative border-l border-outline-variant pl-md"
          ref={menuRef}
        >
          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-3 rounded-lg py-1 pr-2 transition-colors hover:bg-surface-container-high"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary-container font-bold text-on-secondary-container shadow-sm">
              {user?.name?.charAt(0).toUpperCase() || "A"}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-label-md font-bold text-on-surface">
                {user?.name || "Admin User"}
              </p>
              <p className="text-label-sm text-on-surface-variant">
                {user?.role === "COMPANY_ADMIN" ? "Company Admin" : "User"}
              </p>
            </div>
            <span
              className={`material-symbols-outlined text-on-surface-variant transition-transform ${
                menuOpen ? "rotate-180" : ""
              }`}
            >
              expand_more
            </span>
          </button>

          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-outline-variant bg-surface-bright shadow-lg"
            >
              <div className="border-b border-outline-variant px-4 py-3">
                <p className="truncate text-label-md font-bold text-on-surface">
                  {user?.name || "Admin User"}
                </p>
                <p className="truncate text-label-sm text-on-surface-variant">
                  {user?.email}
                </p>
              </div>

              {settingsHref ? (
                <Link
                  href={settingsHref}
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2.5 text-label-md text-on-surface hover:bg-surface-container-high"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    settings
                  </span>
                  Settings
                </Link>
              ) : null}

              <Link
                href="#"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-label-md text-on-surface hover:bg-surface-container-high"
              >
                <span className="material-symbols-outlined text-[20px]">
                  help
                </span>
                Help Center
              </Link>

              <button
                type="button"
                role="menuitem"
                disabled={loggingOut}
                onClick={() => void handleLogout()}
                className="flex w-full items-center gap-2 border-t border-outline-variant px-4 py-2.5 text-left text-label-md text-error hover:bg-error-container hover:text-on-error-container disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[20px]">
                  logout
                </span>
                {loggingOut ? "Logging out..." : "Logout"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
