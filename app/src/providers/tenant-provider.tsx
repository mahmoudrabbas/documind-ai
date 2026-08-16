"use client";

/**
 * TenantProvider — central, reactive source of truth for tenant settings.
 *
 * Fetches `/settings` once the authenticated user is in the tenant context
 * with the `COMPANY_SETTINGS_READ` permission, exposes the result via
 * `useTenantSettings()`, and keeps the active i18n locale in sync with the
 * tenant `defaultLanguage` so the header, sidebar, and active page update
 * immediately when settings change — no full page refresh required.
 *
 * Consumers should call `applyUpdated(...)` right after a successful
 * settings save so the whole tree re-renders with the new values.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/providers/auth-provider";
import { usePermissions } from "@/providers/permission-provider";
import { useI18n } from "@/providers/i18n-provider";
import { getAppContext, isKnownRole } from "@/constants/routes";
import { Permission } from "@/types/api/permissions.types";
import { isValidLocale, hasExplicitLocalePreference } from "@/lib/i18n";
import { getTenantSettings } from "@/services/settings.service";
import type {
  GetTenantSettingsResult,
  TenantSettings,
} from "@/types/api/settings.types";

/* ── State & context types ──────────────────────────────────────── */

export type TenantSettingsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      settings: TenantSettings;
      settingsVersion: number;
      settingsUpdatedAt: string | null;
    };

type TenantContextValue = TenantSettingsState & {
  canReadSettings: boolean;
  refresh: (options?: { background?: boolean }) => Promise<GetTenantSettingsResult | null>;
  applyUpdated: (result: GetTenantSettingsResult) => void;
};

const TenantContext = createContext<TenantContextValue | null>(null);

/* ── Provider ───────────────────────────────────────────────────── */

export function TenantProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const permissions = usePermissions();
  const { setLocale } = useI18n();

  const [state, setState] = useState<TenantSettingsState>({ status: "idle" });
  const mountedRef = useRef(true);
  const reqGenRef = useRef(0);
  /** The tenant `defaultLanguage` last seen from the API, so that a settings
      save can tell a genuine language change from an unrelated edit. */
  const tenantLanguageRef = useRef<string | null>(null);

  const canReadSettings =
    permissions.status === "ready" &&
    permissions.can(Permission.COMPANY_SETTINGS_READ);

  const appContext =
    auth.status === "authenticated" && isKnownRole(auth.user.role)
      ? getAppContext(auth.user.role)
      : null;

  const refresh = useCallback(
    async (options?: { background?: boolean }) => {
      const gen = ++reqGenRef.current;
      if (!options?.background) {
        setState({ status: "loading" });
      }
      try {
        const response = await getTenantSettings();
        if (!mountedRef.current || gen !== reqGenRef.current) return null;
        const result: GetTenantSettingsResult = {
          settings: response.data.settings,
          settingsVersion: response.data.settingsVersion,
          settingsUpdatedAt: response.data.settingsUpdatedAt,
        };
        tenantLanguageRef.current = result.settings.defaultLanguage;
        setState({ status: "ready", ...result });
        return result;
      } catch (error) {
        if (!mountedRef.current || gen !== reqGenRef.current) return null;
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to load tenant settings",
        });
        return null;
      }
    },
    [],
  );

  const applyUpdated = useCallback(
    (result: GetTenantSettingsResult) => {
      ++reqGenRef.current; // invalidate any in-flight refresh
      setState({ status: "ready", ...result });

      const next = result.settings.defaultLanguage;
      const languageChanged = tenantLanguageRef.current !== next;
      tenantLanguageRef.current = next;

      /* Only a real change to the tenant default moves the active locale.
         Re-applying it on every save meant an admin editing something
         unrelated — a timezone, a logo — had their own chosen language
         silently replaced by the tenant's. Applied non-explicitly so it
         stays a default rather than masquerading as their choice. */
      if (languageChanged && isValidLocale(next)) {
        setLocale(next, { explicit: false });
      }
    },
    [setLocale],
  );

  /* Load once per authenticated tenant identity / permission availability. */
  useEffect(() => {
    mountedRef.current = true;
    if (appContext !== "tenant" || !canReadSettings) {
      ++reqGenRef.current;
      setState({ status: "idle" });
    } else {
      void refresh();
    }
    return () => {
      mountedRef.current = false;
    };
  }, [appContext, canReadSettings, refresh]);

  /* Bind the tenant defaultLanguage to the active locale (drives dir), unless
     the user has chosen a language for themselves. Applied non-explicitly, so
     that a later change to the tenant default still reaches everyone who
     never made a choice — writing it as an explicit preference would pin each
     user to whichever default was current on their first visit. */
  useEffect(() => {
    if (state.status !== "ready") return;
    if (hasExplicitLocalePreference()) return;
    if (!isValidLocale(state.settings.defaultLanguage)) return;
    setLocale(state.settings.defaultLanguage, { explicit: false });
  }, [state, setLocale]);

  const value = useMemo<TenantContextValue>(
    () => ({ ...state, canReadSettings, refresh, applyUpdated }),
    [state, canReadSettings, refresh, applyUpdated],
  );

  return <TenantContext value={value}>{children}</TenantContext>;
}

/* ── Hook ────────────────────────────────────────────────────────── */

export function useTenantSettings(): TenantContextValue {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error(
      "useTenantSettings must be used within a TenantProvider.",
    );
  }
  return context;
}
