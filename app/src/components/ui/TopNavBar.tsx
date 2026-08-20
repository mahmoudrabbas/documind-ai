"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { usePermissions } from "@/providers/permission-provider";
import { useTenantSettings } from "@/providers/tenant-provider";
import { getAppContext, isKnownRole } from "@/constants/routes";
import { Permission } from "@/types/api/permissions.types";
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
  const { user } = auth;
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
    <header className="sticky top-0 z-30 flex min-h-14 w-full min-w-0 items-center justify-between gap-2 border-b border-outline-variant bg-surface-bright px-4 py-2.5 sm:px-5 lg:px-6">
      <div className="flex min-w-0 items-center gap-3 lg:gap-lg">
        <button
          type="button"
          onClick={onNavigationOpen}
          aria-label={t("shell.openNavigation")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high md:hidden"
        >
          <span className="material-symbols-outlined">menu</span>
        </button>
      </div>

      <div className="flex min-w-0 items-center gap-1 sm:gap-md">
        <div className="hidden items-center gap-sm sm:flex lg:me-lg">
          <LanguageSwitcher />
          <NotificationsBell />
        </div>

        {/* User Profile */}
        <div
          className="relative min-w-0 border-s border-outline-variant ps-3 sm:ps-lg"
          ref={menuRef}
        >
          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex min-w-0 items-center gap-2.5 rounded-lg py-1.5 pe-2 transition-colors hover:bg-surface-container-high sm:gap-3 sm:pe-3"
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
              <p className="max-w-48 truncate text-label-lg font-semibold text-on-surface sm:max-w-56 xl:max-w-64">
                {user?.name || t("shell.defaultUserName")}
              </p>
              <p className="max-w-48 truncate text-label-sm text-on-surface-variant sm:max-w-56 xl:max-w-64">
                {appContext === "tenant" && companyName
                  ? companyName
                  : user?.role === "SUPER_ADMIN"
                    ? t("shell.roleSuperAdmin")
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
                  <span
                    className="material-symbols-outlined text-[20px]"
                    aria-hidden="true"
                  >
                    settings
                  </span>
                  {t("shell.settings")}
                </Link>
              ) : null}

              <button
                type="button"
                role="menuitem"
                disabled={loggingOut}
                onClick={() => void handleLogout()}
                className="flex w-full items-center gap-2 border-t border-outline-variant px-4 py-2.5 text-start text-label-md text-error hover:bg-error-container hover:text-on-error-container disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span
                  className="material-symbols-outlined text-[20px]"
                  aria-hidden="true"
                >
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
