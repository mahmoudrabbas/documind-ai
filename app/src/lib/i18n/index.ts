/**
 * i18n public API barrel.
 *
 * Everything a consumer needs from `@/lib/i18n`:
 *
 *   import { DEFAULT_LOCALE, isValidLocale, t } from "@/lib/i18n";
 */

/* ── types ────────────────────────────────────────────────────────── */
export type {
  Locale,
  Direction,
  LocaleConfig,
  TranslationDictionary,
  I18nContextValue,
} from "./i18n.types";

/* ── config ───────────────────────────────────────────────────────── */
export {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  LOCALE_COOKIE_NAME,
  LOCALE_CONFIGS,
  getDirection,
  isValidLocale,
} from "./i18n.config";

/* ── utils ────────────────────────────────────────────────────────── */
export { t, getLocaleFromCookie, setLocaleCookie } from "./i18n.utils";

/* ── translations ─────────────────────────────────────────────────── */
export { default as dictionaries } from "./translations";
