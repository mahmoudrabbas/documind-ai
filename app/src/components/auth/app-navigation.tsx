"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/providers/auth-provider";
import { usePermissions } from "@/providers/permission-provider";
import { useTenantSettings } from "@/providers/tenant-provider";
import {
  getAppContext,
  filterNavigationLinks,
  isKnownRole,
  TENANT_SIDEBAR_LINKS,
} from "@/constants/routes";
import {
  PLATFORM_NAV_GROUPS,
  type PlatformNavGroup,
} from "@/constants/platform-navigation";

type AppNavigationProps = {
  open: boolean;
  onClose: () => void;
};

function isItemActive(
  pathname: string,
  href: string,
  allHrefs: readonly string[],
): boolean {
  return (
    pathname === href ||
    (href !== "/dashboard" &&
      href !== "/super-admin" &&
      pathname.startsWith(`${href}/`) &&
      !allHrefs.some(
        (other) =>
          other !== href &&
          other.startsWith(`${href}/`) &&
          pathname.startsWith(other),
      ))
  );
}

function NavItem({
  href,
  label,
  icon,
  isActive,
  onClose,
}: {
  href: string;
  label: string;
  icon: string;
  isActive: boolean;
  onClose: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClose}
      aria-current={isActive ? "page" : undefined}
      className={`flex min-w-0 items-center gap-3 px-4 py-3 transition-colors ${
        isActive
          ? "border-s-4 border-tertiary-container bg-secondary-container/10 font-bold text-primary hover:bg-surface-container-high"
          : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
      }`}
    >
      <span className="material-symbols-outlined shrink-0">{icon}</span>
      <span className="min-w-0 truncate text-body-md">{label}</span>
    </Link>
  );
}

export function AppNavigation({ open, onClose }: AppNavigationProps) {
  const auth = useAuth();
  const permissions = usePermissions();
  const tenant = useTenantSettings();
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const logoutPending = useRef(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [groupsHydrated, setGroupsHydrated] = useState(false);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const appContext =
    auth.status === "authenticated" && isKnownRole(auth.user.role)
      ? getAppContext(auth.user.role)
      : null;

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

  useEffect(() => {
    if (appContext !== "platform") return;
    const currentPath = pathnameRef.current;
    const stored: Record<string, boolean> = {};
    for (const group of PLATFORM_NAV_GROUPS) {
      const hasActiveItem = group.items.some(
        (item) =>
          currentPath === item.href || currentPath.startsWith(`${item.href}/`),
      );
      if (hasActiveItem) {
        stored[group.id] = false;
        continue;
      }
      try {
        stored[group.id] =
          window.localStorage.getItem(`platform-nav:${group.id}`) ===
          "collapsed";
      } catch {
        stored[group.id] = false;
      }
    }
    setCollapsedGroups(stored);
    setGroupsHydrated(true);
  }, [appContext]);

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

  const tenantLinks = filterNavigationLinks(
    TENANT_SIDEBAR_LINKS,
    permissions.status,
    permissions.can,
    auth.user.role,
  );

  const visibleGroups = useMemo(() => {
    if (appContext !== "platform") return [];
    return PLATFORM_NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        item.requiredPermissions.every((permission) =>
          permissions.can(permission),
        ),
      ),
    })).filter((group) => group.items.length > 0);
  }, [appContext, permissions.can]);

  const groupedAllHrefs = useMemo(
    () => visibleGroups.flatMap((group) => group.items.map((item) => item.href)),
    [visibleGroups],
  );
  const tenantAllHrefs = useMemo(
    () => tenantLinks.map((link) => link.href),
    [tenantLinks],
  );

  const isGroupCollapsed = (group: PlatformNavGroup): boolean => {
    if (!groupsHydrated) return !group.defaultOpen;
    return collapsedGroups[group.id] ?? !group.defaultOpen;
  };

  const toggleGroup = (id: string) => {
    const group = PLATFORM_NAV_GROUPS.find((entry) => entry.id === id);
    if (!group) return;
    setCollapsedGroups((previous) => {
      const nextCollapsed = !(previous[id] ?? !group.defaultOpen);
      try {
        window.localStorage.setItem(
          `platform-nav:${id}`,
          nextCollapsed ? "collapsed" : "expanded",
        );
      } catch {
        // localStorage unavailable — in-memory state still applies
      }
      return { ...previous, [id]: nextCollapsed };
    });
  };

  const companyName =
    tenant.status === "ready" && tenant.settings.profile.companyName
      ? tenant.settings.profile.companyName
      : appContext === "tenant"
        ? (auth.tenant?.name ?? null)
        : null;

  let navContent: ReactNode;
  if (permissions.status === "loading" || permissions.status === "idle") {
    navContent = (
      <div className="space-y-2 px-md" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((index) => (
          <div
            key={index}
            className="h-12 animate-pulse rounded-lg bg-surface-container-high"
          />
        ))}
      </div>
    );
  } else if (
    permissions.status === "denied" ||
    permissions.status === "error" ||
    permissions.status === "maintenance"
  ) {
    navContent = (
      <div
        role="alert"
        className="mx-md rounded-xl border border-error/20 bg-error-container p-4 text-on-error-container"
      >
        <p className="text-body-sm">Navigation is unavailable right now.</p>
        <button
          type="button"
          onClick={() => void permissions.refreshPermissions()}
          className="mt-3 min-h-10 rounded-lg bg-error px-4 py-2 font-bold text-on-error"
        >
          Retry
        </button>
      </div>
    );
  } else if (appContext === "platform") {
    navContent =
      visibleGroups.length === 0 ? (
        <p className="px-md text-body-sm text-on-surface-variant">
          No navigation items available.
        </p>
      ) : (
        <div className="space-y-1">
          {visibleGroups.map((group) => {
            const collapsed = isGroupCollapsed(group);
            return (
              <div key={group.id}>
                {group.label ? (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    aria-expanded={!collapsed}
                    aria-controls={`nav-group-${group.id}`}
                    className="flex w-full items-center gap-2 px-4 py-2 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant hover:bg-surface-container-high"
                  >
                    {group.icon ? (
                      <span className="material-symbols-outlined text-[18px]">
                        {group.icon}
                      </span>
                    ) : null}
                    <span className="min-w-0 flex-1 truncate text-start">
                      {group.label}
                    </span>
                    <span
                      className={`material-symbols-outlined text-[18px] transition-transform ${collapsed ? "" : "rotate-180"}`}
                    >
                      expand_more
                    </span>
                  </button>
                ) : null}
                {!collapsed ? (
                  <div id={`nav-group-${group.id}`} className="space-y-1">
                    {group.items.map((item) => (
                      <NavItem
                        key={item.href}
                        href={item.href}
                        label={item.label}
                        icon={item.icon}
                        isActive={isItemActive(
                          pathname,
                          item.href,
                          groupedAllHrefs,
                        )}
                        onClose={onClose}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      );
  } else {
    navContent =
      tenantLinks.length === 0 ? (
        <p className="px-md text-body-sm text-on-surface-variant">
          No navigation items available.
        </p>
      ) : (
        <div className="space-y-1">
          {tenantLinks.map(({ href, label, icon }) => (
            <NavItem
              key={href}
              href={href}
              label={label}
              icon={icon}
              isActive={isItemActive(pathname, href, tenantAllHrefs)}
              onClose={onClose}
            />
          ))}
        </div>
      );
  }

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
              {companyName || "Enterprise Knowledge"}
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
        <nav className="mt-md flex-1 space-y-1 overflow-y-auto overscroll-contain px-md">
          {navContent}
        </nav>
        <div className="mt-auto border-t border-outline-variant p-md">
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
      </aside>
    </>
  );
}
