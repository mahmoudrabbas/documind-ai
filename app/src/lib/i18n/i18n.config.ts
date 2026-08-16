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

/**
 * Companion marker recording that the active locale was chosen by the user
 * rather than derived from configuration.
 *
 * `LOCALE_COOKIE_NAME` is written in both cases — the server reads it to
 * render the right direction on first paint — so its presence cannot
 * distinguish the two. Keeping the source in a second cookie is what lets a
 * tenant's `defaultLanguage` keep reaching users who never picked a
 * language, while never overriding those who did.
 */
export const LOCALE_EXPLICIT_COOKIE_NAME = "documind-locale-explicit";

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
 * BCP-47 tags used for `Intl` date and number formatting.
 *
 * Arabic requests the Latin numbering system (`-u-nu-latn`) so months
 * and date order are Arabic while digits stay Western. This dashboard
 * shows invoice amounts, quotas and IDs alongside Latin text throughout,
 * where Arabic-Indic numerals hurt more than they help.
 */
export const INTL_LOCALES: Record<Locale, string> = {
  en: "en-US",
  ar: "ar-EG-u-nu-latn",
};

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
