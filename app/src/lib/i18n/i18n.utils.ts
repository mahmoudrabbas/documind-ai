/**
 * Pure i18n utility functions.
 *
 * No React, no DOM side-effects — safe to call from tests and server
 * contexts (cookie helpers are guarded with `typeof document` checks).
 */

import type { Locale, TranslationDictionary } from "./i18n.types";
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, isValidLocale } from "./i18n.config";

/**
 * Look up `key` in `dictionary` and optionally interpolate `{{param}}`
 * placeholders.  Returns the raw key when no translation is found so
 * missing strings are obvious in the UI rather than silently blank.
 */
export function t(
  dictionary: TranslationDictionary,
  key: string,
  params?: Record<string, string>,
): string {
  let value = dictionary[key];

  if (value === undefined) {
    return key;
  }

  if (params) {
    for (const [paramKey, paramValue] of Object.entries(params)) {
      value = value.replaceAll(`{{${paramKey}}}`, paramValue);
    }
  }

  return value;
}

/**
 * Pick the plural form of `key` for `count` and interpolate it.
 *
 * English needs only `one`/`other`, but Arabic distinguishes up to six
 * CLDR categories (`zero`, `one`, `two`, `few`, `many`, `other`), so the
 * usual `count === 1 ? x : y` in JSX is wrong for it. `Intl.PluralRules`
 * supplies the correct category per locale at no bundle cost.
 *
 * Looks up `<key>.<category>` and falls back to `<key>.other`, which
 * every locale defines — so a dictionary that omits a rarer category
 * still renders a sensible string instead of a raw key. `count` is
 * exposed to the template as `{{count}}`.
 */
export function tPlural(
  dictionary: TranslationDictionary,
  locale: Locale,
  key: string,
  count: number,
  params?: Record<string, string>,
): string {
  const category = new Intl.PluralRules(locale).select(count);
  const candidate = `${key}.${category}`;
  const resolved = dictionary[candidate] !== undefined ? candidate : `${key}.other`;

  return t(dictionary, resolved, { count: String(count), ...params });
}

/**
 * Read the locale preference from `document.cookie`.
 * Returns `DEFAULT_LOCALE` when the cookie is missing or holds an
 * unrecognised value.
 */
export function getLocaleFromCookie(): Locale {
  if (typeof document === "undefined") {
    return DEFAULT_LOCALE;
  }

  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${LOCALE_COOKIE_NAME}=`));

  if (!match) {
    return DEFAULT_LOCALE;
  }

  const value = match.split("=")[1];
  return isValidLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * Persist `locale` to a first-party cookie with a 1-year expiry.
 * `SameSite=Lax` is used to keep the cookie available on normal
 * navigations while preventing CSRF in cross-origin POST requests.
 */
export function setLocaleCookie(locale: Locale): void {
  if (typeof document === "undefined") {
    return;
  }

  const maxAge = 365 * 24 * 60 * 60; // 1 year in seconds
  document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=${maxAge}; SameSite=Lax`;
}
