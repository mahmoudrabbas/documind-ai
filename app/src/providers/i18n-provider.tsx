"use client";

/**
 * I18nProvider — React context provider for internationalisation.
 *
 * Wraps the application to provide `locale`, `dir`, `t()`, and
 * `setLocale()` to all descendant components via `useI18n()`.
 *
 * The root layout resolves the locale from the `documind-locale` cookie
 * on the server and passes it as `initialLocale`, so the first render
 * already matches the persisted preference. On locale change the
 * `<html>` attributes and cookie are updated client-side.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { Direction, I18nContextValue, Locale } from "@/lib/i18n/i18n.types";
import { getDirection, INTL_LOCALES } from "@/lib/i18n/i18n.config";
import {
  t as translateKey,
  tPlural as pluralizeKey,
  getLocaleFromCookie,
  setLocaleCookie,
} from "@/lib/i18n/i18n.utils";
import dictionaries from "@/lib/i18n/translations";

/* ── Context ─────────────────────────────────────────────────────── */

const I18nContext = createContext<I18nContextValue | null>(null);

/* ── Provider ────────────────────────────────────────────────────── */

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  /**
   * Locale resolved from the cookie on the server. Seeding state with it
   * keeps the first client render identical to the server HTML; without
   * it the cookie is only read after mount, which flashes the wrong
   * direction. Falls back to reading the cookie directly when absent.
   */
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(
    () => initialLocale ?? getLocaleFromCookie(),
  );
  const dir: Direction = getDirection(locale);

  /* Sync <html> attributes whenever locale changes. The server already
     set these for the initial locale, so this is a no-op on first paint
     and only does work when the user actually switches language. */
  useEffect(() => {
    const html = document.documentElement;
    html.lang = locale;
    html.dir = dir;
  }, [locale, dir]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    setLocaleCookie(next);
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string>) =>
      translateKey(dictionaries[locale], key, params),
    [locale],
  );

  const tPlural = useCallback(
    (key: string, count: number, params?: Record<string, string>) =>
      pluralizeKey(dictionaries[locale], locale, key, count, params),
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, dir, t, tPlural, setLocale }),
    [locale, dir, t, tPlural, setLocale],
  );

  return <I18nContext value={value}>{children}</I18nContext>;
}

/* ── Hooks ────────────────────────────────────────────────────────── */

/**
 * Access the full i18n context (`locale`, `dir`, `t()`, `setLocale()`).
 * Must be called inside an `<I18nProvider>`.
 */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);

  if (!ctx) {
    throw new Error("useI18n must be used within an <I18nProvider>.");
  }

  return ctx;
}

/** Convenience hook returning only the current text direction. */
export function useDirection(): Direction {
  return useI18n().dir;
}

/**
 * BCP-47 tag for the active locale, for use with `Intl` APIs and
 * `toLocaleDateString` / `toLocaleString`.
 *
 * Pass this wherever a date or number is formatted so output follows the
 * selected language rather than the browser's own locale.
 */
export function useIntlLocale(): string {
  return INTL_LOCALES[useI18n().locale];
}
