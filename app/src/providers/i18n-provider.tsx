"use client";

/**
 * I18nProvider — React context provider for internationalisation.
 *
 * Wraps the application to provide `locale`, `dir`, `t()`, and
 * `setLocale()` to all descendant components via `useI18n()`.
 *
 * On mount it reads the persisted locale from the `documind-locale`
 * cookie and applies `lang` / `dir` attributes to `<html>`.  On
 * locale change the same attributes and cookie are updated.
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
import { DEFAULT_LOCALE, getDirection } from "@/lib/i18n/i18n.config";
import {
  t as translateKey,
  getLocaleFromCookie,
  setLocaleCookie,
} from "@/lib/i18n/i18n.utils";
import dictionaries from "@/lib/i18n/translations";

/* ── Context ─────────────────────────────────────────────────────── */

const I18nContext = createContext<I18nContextValue | null>(null);

/* ── Provider ────────────────────────────────────────────────────── */

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const persisted = getLocaleFromCookie();
    return persisted;
  });
  const dir: Direction = getDirection(locale);

  /* Sync <html> attributes whenever locale changes. */
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

  const value = useMemo<I18nContextValue>(
    () => ({ locale, dir, t, setLocale }),
    [locale, dir, t, setLocale],
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
