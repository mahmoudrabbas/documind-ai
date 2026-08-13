"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { usePermissions } from "@/providers/permission-provider";
import { useTenantSettings } from "@/providers/tenant-provider";
import {
  getAppContext,
  filterNavigationLinks,
  isKnownRole,
  PLATFORM_TOPBAR_LINKS,
  TENANT_TOPBAR_LINKS,
} from "@/constants/routes";
import { Permission } from "@/types/api/permissions.types";
import { useCopilot } from "@/providers/copilot-provider";
import { COPILOT_ENABLED } from "@/config/public-env";
import { NotificationsBell } from "./NotificationsBell";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useI18n } from "@/providers/i18n-provider";

export function TopNavBar({
  onNavigationOpen,
}: {
  onNavigationOpen: () => void;
}) {
  const auth = useAuth();
  const permissions = usePermissions();
  const tenant = useTenantSettings();
  const { t } = useI18n();
  const { setOpen: setCopilotOpen } = useCopilot();
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
  const appContext = role ? getAppContext(role) : null;
  const candidateLinks =
    appContext === "platform"
      ? PLATFORM_TOPBAR_LINKS
      : appContext === "tenant"
        ? TENANT_TOPBAR_LINKS
        : [];
  const topLinks = filterNavigationLinks(
    candidateLinks,
    permissions.status,
    permissions.can,
    user?.role,
  );
  const settingsHref =
    permissions.status === "ready" &&
    permissions.can(Permission.COMPANY_SETTINGS_READ)
      ? appContext === "platform"
        ? "/super-admin/settings"
        : appContext === "tenant"
          ? "/dashboard/settings"
          : undefined
      : undefined;

  const companyName =
    tenant.status === "ready" && tenant.settings.profile.companyName
      ? tenant.settings.profile.companyName
      : appContext === "tenant"
        ? (auth.tenant?.name ?? null)
        : null;
  const logoUrl =
    tenant.status === "ready" ? tenant.settings.profile.logoUrl : null;

  return (
    <header className="sticky top-0 z-30 flex min-h-16 w-full min-w-0 items-center justify-between gap-2 border-b border-outline-variant bg-surface-bright/80 px-4 shadow-sm backdrop-blur-md sm:px-5 lg:px-6">
      <div className="flex min-w-0 items-center gap-3 lg:gap-lg">
        <button
          type="button"
          onClick={onNavigationOpen}
          aria-label={t("shell.openNavigation")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high md:hidden"
        >
          <span className="material-symbols-outlined">menu</span>
        </button>
        <div className="relative hidden w-64 xl:block 2xl:w-96">
          <span className="material-symbols-outlined absolute start-3 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant">
            search
          </span>
          <input
            className="w-full rounded-full border-none bg-surface-container-low py-2 ps-10 pe-4 text-label-md outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
            placeholder={t("shell.searchPlaceholder")}
            type="text"
          />
        </div>

        {topLinks.length > 0 && (
          <nav className="hidden items-center gap-md lg:flex">
            {topLinks.map(({ label, labelKey, href }) => {
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
                  {labelKey ? t(labelKey) : label}
                </Link>
              );
            })}
          </nav>
        )}
      </div>

      <div className="flex min-w-0 items-center gap-1 sm:gap-md">
        <div className="hidden items-center gap-xs sm:flex lg:me-md">
          <LanguageSwitcher />
          <NotificationsBell />

          {settingsHref && (
            <Link
              href={settingsHref}
              aria-label={t("shell.settings")}
              className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high"
            >
              <span className="material-symbols-outlined">settings</span>
            </Link>
          )}
        </div>

        {/* User Profile */}
        <div
          className="relative min-w-0 border-s border-outline-variant ps-2 sm:ps-md"
          ref={menuRef}
        >
          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex min-w-0 items-center gap-2 rounded-lg py-1 pe-1 transition-colors hover:bg-surface-container-high sm:gap-3 sm:pe-2"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary-container font-bold text-on-secondary-container shadow-sm">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt={companyName ?? t("shell.companyLogo")}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span>{user?.name?.charAt(0).toUpperCase() || "A"}</span>
              )}
            </div>
            <div className="hidden min-w-0 text-start sm:block">
              <p className="max-w-32 truncate text-label-md font-bold text-on-surface xl:max-w-48">
                {user?.name || t("shell.defaultUserName")}
              </p>
              <p className="max-w-32 truncate text-label-sm text-on-surface-variant xl:max-w-48">
                {appContext === "tenant" && companyName
                  ? companyName
                  : user?.role === "COMPANY_ADMIN"
                    ? t("shell.roleCompanyAdmin")
                    : t("shell.roleUser")}
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
              className="absolute end-0 top-full z-50 mt-2 w-[min(14rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-outline-variant bg-surface-bright shadow-lg"
            >
              <div className="border-b border-outline-variant px-4 py-3">
                <p className="truncate text-label-md font-bold text-on-surface">
                  {user?.name || t("shell.defaultUserName")}
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
                  {t("shell.settings")}
                </Link>
              ) : null}

              {COPILOT_ENABLED ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setCopilotOpen(true);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-label-md text-on-surface hover:bg-surface-container-high"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    help
                  </span>
                  {t("shell.helpCenter")}
                </button>
              ) : (
                <Link
                  href="#"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2.5 text-label-md text-on-surface hover:bg-surface-container-high"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    help
                  </span>
                  {t("shell.helpCenter")}
                </Link>
              )}

              <button
                type="button"
                role="menuitem"
                disabled={loggingOut}
                onClick={() => void handleLogout()}
                className="flex w-full items-center gap-2 border-t border-outline-variant px-4 py-2.5 text-start text-label-md text-error hover:bg-error-container hover:text-on-error-container disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[20px]">
                  logout
                </span>
                {loggingOut ? t("shell.loggingOut") : t("shell.logout")}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
