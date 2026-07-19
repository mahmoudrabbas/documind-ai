"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { usePermissions } from "@/providers/permission-provider";
import {
  getAppContext,
  filterNavigationLinks,
  isKnownRole,
  PLATFORM_SIDEBAR_LINKS,
  TENANT_SIDEBAR_LINKS,
} from "@/constants/routes";

type AppNavigationProps = {
  open: boolean;
  onClose: () => void;
};

export function AppNavigation({ open, onClose }: AppNavigationProps) {
  const auth = useAuth();
  const permissions = usePermissions();
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const logoutPending = useRef(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, onClose]);

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

  const appContext = isKnownRole(auth.user.role)
    ? getAppContext(auth.user.role)
    : null;
  const candidateLinks =
    appContext === "platform"
      ? PLATFORM_SIDEBAR_LINKS
      : appContext === "tenant"
        ? TENANT_SIDEBAR_LINKS
        : [];
  const links = filterNavigationLinks(
    candidateLinks,
    permissions.status,
    permissions.can,
  );

  return (
    <>
      <button
        type="button"
        aria-label="Close navigation"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-primary/35 transition-opacity md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        aria-label="Primary navigation"
        className={`fixed inset-y-0 start-0 z-50 flex w-[min(280px,calc(100vw-2rem))] flex-col border-e border-outline-variant bg-surface transition-transform duration-200 md:w-[280px] ${
          open
            ? "translate-x-0"
            : "max-md:ltr:-translate-x-full max-md:rtl:translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 p-lg">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <span
              className="material-symbols-outlined text-on-primary"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              psychology
            </span>
          </div>
          <div className="min-w-0">
            <h1 className="text-headline-md font-bold text-primary">
              DocuMind AI
            </h1>
            <p className="text-label-sm text-on-surface-variant">
              Enterprise Knowledge
            </p>
          </div>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={onClose}
            className="ms-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high md:hidden"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <nav className="mt-md flex-1 space-y-1 px-md">
          {links.map(({ label, href, icon }) => {
            const isActive =
              pathname === href ||
              (href !== "/super-admin" && pathname.startsWith(`${href}/`));
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                  isActive
                    ? "border-s-4 border-tertiary-container bg-secondary-container/10 font-bold text-primary hover:bg-surface-container-high"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                }`}
              >
                <span className="material-symbols-outlined">{icon}</span>
                <span className="text-body-md">{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-outline-variant p-md">
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
                {loggingOut ? "Logging out…" : "Logout"}
              </span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
