/**
 * i18n configuration — single source of truth for supported locales,
 * default locale, and locale metadata.
 */

import type { Direction, Locale, LocaleConfig } from "./i18n.types";

/** The locale used when no preference has been set. */
export const DEFAULT_LOCALE: Locale = "en";

/** Ordered list of all supported locale codes. */
export const SUPPORTED_LOCALES: readonly Locale[] = ["en", "ar"] as const;

/** Cookie name used to persist the user's locale preference. */
export const LOCALE_COOKIE_NAME = "documind-locale";

/** Per-locale metadata. */
export const LOCALE_CONFIGS: Record<Locale, LocaleConfig> = {
  en: {
    direction: "ltr",
    nativeLabel: "English",
    englishLabel: "English",
  },
  ar: {
    direction: "rtl",
    nativeLabel: "العربية",
    englishLabel: "Arabic",
  },
};

/** Returns the text direction for a given locale. */
export function getDirection(locale: Locale): Direction {
  return LOCALE_CONFIGS[locale].direction;
}

/**
 * Type-guard: returns `true` when `value` is a recognised `Locale`.
 * Useful for validating cookies, query-params, and other untrusted input.
 */
export function isValidLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}
