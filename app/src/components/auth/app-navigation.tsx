"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/providers/auth-provider";
import { usePermissions } from "@/providers/permission-provider";
import { useTenantSettings } from "@/providers/tenant-provider";
import { DocuMindLogo } from "@/components/brand/DocuMindLogo";
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
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { useI18n } from "@/providers/i18n-provider";
import { getNavGuideTargetId } from "@/lib/copilot/guide-targets";
import { cn } from "@/lib/utils";

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
  labelKey,
  icon,
  isActive,
  onClose,
}: {
  href: string;
  label: string;
  labelKey?: string;
  icon: string;
  isActive: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <Link
      href={href}
      onClick={onClose}
      data-guide-id={getNavGuideTargetId(href)}
      title={label}
      aria-label={label}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 transition-colors md:justify-center md:px-0 xl:justify-start xl:px-3",
        isActive
          ? "bg-secondary-container/20 font-semibold text-primary hover:bg-secondary-container/30"
          : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface",
      )}
    >
      <span
        className="material-symbols-outlined shrink-0 text-[20px]"
        style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
      >
        {icon}
      </span>
      <span className="min-w-0 truncate text-body-md md:hidden xl:inline">
        {labelKey ? t(labelKey) : label}
      </span>
    </Link>
  );
}

export function AppNavigation({ open, onClose }: AppNavigationProps) {
  const auth = useAuth();
  const permissions = usePermissions();
  const tenant = useTenantSettings();
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const logoutPending = useRef(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [groupsHydrated, setGroupsHydrated] = useState(false);
  const pathnameRef = useRef(pathname);
  // Post-commit ref sync (react-hooks/refs); only read by the
  // `[appContext]` effect below, which runs after this one.
  useEffect(() => {
    pathnameRef.current = pathname;
  });
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

  const tenantLinks = filterNavigationLinks(
    TENANT_SIDEBAR_LINKS,
    permissions.status,
    permissions.can,
    auth.user?.role,
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

  const secondaryLinkClassName = (tone: "muted" | "error") =>
    `flex items-center gap-3 px-4 py-2 transition-colors md:justify-center md:px-0 xl:justify-start xl:px-4 ${
      tone === "error"
        ? "text-error hover:text-on-surface disabled:opacity-60"
        : "text-on-surface-variant hover:text-on-surface"
    }`;
  const helpCenterHref = "/dashboard/help-center";
  const isHelpCenterActive =
    pathname === helpCenterHref ||
    pathname.startsWith(`${helpCenterHref}/`);

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
    const permissionStatusTitle =
      permissions.status === "denied"
        ? t("permissions.deniedTitle")
        : permissions.status === "maintenance"
          ? t("permissions.maintenanceTitle")
          : t("permissions.failedTitle");
    navContent = (
      <div
        role="alert"
        className="mx-md rounded-xl border border-error/20 bg-error-container p-4 text-on-error-container"
      >
        <p className="text-body-sm">{permissionStatusTitle}</p>
        <button
          type="button"
          onClick={() => void permissions.refreshPermissions()}
          className="mt-3 min-h-10 rounded-lg bg-error px-4 py-2 font-bold text-on-error"
        >
          {t("common.retry")}
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
                    className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant hover:bg-surface-container-high md:justify-center md:px-0 xl:justify-start xl:px-3"
                  >
                    {group.icon ? (
                      <span className="material-symbols-outlined text-[18px]">
                        {group.icon}
                      </span>
                    ) : null}
                    <span className="min-w-0 flex-1 truncate text-start md:hidden xl:inline">
                      {group.labelKey ? t(group.labelKey) : group.label}
                    </span>
                    <span
                      className={`material-symbols-outlined text-[18px] transition-transform md:hidden xl:inline ${collapsed ? "" : "rotate-180"}`}
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
                        labelKey={item.labelKey}
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
          {tenantLinks.map(({ href, label, labelKey, icon }) => (
            <NavItem
              key={href}
              href={href}
              label={label}
              labelKey={labelKey}
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
        aria-label={t("shell.closeNavigation")}
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-primary/35 transition-opacity md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        aria-label={t("shell.primaryNavigation")}
        className={`fixed inset-y-0 start-0 z-50 flex w-[min(280px,calc(100vw-2rem))] flex-col overflow-hidden border-e border-outline-variant bg-surface transition-transform duration-200 md:w-[72px] xl:w-[280px] ${
          open
            ? "translate-x-0"
            : "max-md:ltr:-translate-x-full max-md:rtl:translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 p-lg md:justify-center md:px-0 xl:justify-start xl:px-lg">
          <div
            data-testid="app-nav-brand-icon"
            className="hidden shrink-0 md:flex xl:hidden"
          >
            <DocuMindLogo variant="icon" />
          </div>
          <div
            data-testid="app-nav-brand-full"
            className="min-w-0 flex-1 md:hidden xl:block"
          >
            <DocuMindLogo variant="full" className="max-w-full" />
            <p className="text-label-sm text-on-surface-variant">
              {companyName || t("shell.enterpriseKnowledge")}
            </p>
          </div>
          <button
            type="button"
            aria-label={t("shell.closeNavigation")}
            onClick={onClose}
            className="ms-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high md:hidden"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <nav className="mt-md min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-md md:px-0 xl:px-md scrollbar-hide">
          {navContent}
        </nav>
        <div className="mt-auto border-t border-outline-variant p-md md:px-0 xl:px-md">
          <div className="space-y-1">
            {/* The top bar's switcher is hidden below `sm`, so the drawer
                carries the only language control on small screens. */}
            <div className="px-4 pb-2 sm:hidden">
              <LanguageSwitcher className="w-full justify-center" />
            </div>
            <Link
              href={helpCenterHref}
              onClick={onClose}
              aria-current={isHelpCenterActive ? "page" : undefined}
              className={`${secondaryLinkClassName("muted")} rounded-lg ${
                isHelpCenterActive
                  ? "border border-outline-variant/40 border-s-4 border-s-primary bg-secondary-container/20 font-semibold text-on-surface shadow-sm hover:bg-secondary-container/30"
                  : "hover:bg-surface-container-high"
              }`}
            >
              <span
                className="material-symbols-outlined text-[20px]"
                aria-hidden="true"
                style={
                  isHelpCenterActive
                    ? { fontVariationSettings: "'FILL' 1" }
                    : undefined
                }
              >
                help
              </span>
              <span className="text-body-sm font-medium md:hidden xl:inline">
                {t("shell.helpCenter")}
              </span>
            </Link>
            <button
              onClick={() => void handleLogout()}
              disabled={loggingOut}
              title={loggingOut ? "Logging out…" : "Logout"}
              aria-label={loggingOut ? "Logging out…" : "Logout"}
              className={`w-full ${secondaryLinkClassName("error")}`}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                logout
              </span>
              <span className="text-body-sm md:hidden xl:inline">
                {loggingOut ? t("shell.loggingOut") : t("shell.logout")}
              </span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
