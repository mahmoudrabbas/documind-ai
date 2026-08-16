/**
 * i18n type definitions.
 *
 * Shared types consumed by the i18n config, utilities, provider, and
 * any component that interacts with the translation system.
 */

/** Supported locale codes. */
export type Locale = "en" | "ar";

/** Text direction derived from the active locale. */
export type Direction = "ltr" | "rtl";

/** Metadata for a single supported locale. */
export interface LocaleConfig {
  /** Text direction for this locale. */
  direction: Direction;
  /** Label in the locale's own script (e.g. "العربية"). */
  nativeLabel: string;
  /** English label for accessibility / admin UIs. */
  englishLabel: string;
}

/**
 * A flat translation dictionary mapping dot-namespaced keys to translated
 * strings.  Values may contain `{{param}}` placeholders for interpolation.
 *
 * @example
 * { "common.welcome": "Welcome, {{name}}!" }
 */
export type TranslationDictionary = Record<string, string>;

/** Shape of the React context value exposed by I18nProvider. */
export interface I18nContextValue {
  /** The currently active locale. */
  locale: Locale;
  /** The text direction for the current locale. */
  dir: Direction;
  /**
   * Look up a translation key, optionally interpolating `{{param}}`
   * placeholders.  Returns the key itself when no translation is found.
   */
  t: (key: string, params?: Record<string, string>) => string;
  /**
   * Look up a count-sensitive translation, resolving `<key>.<category>`
   * via `Intl.PluralRules` for the active locale. `{{count}}` is
   * interpolated automatically.
   */
  tPlural: (
    key: string,
    count: number,
    params?: Record<string, string>,
  ) => string;
  /**
   * Switch the active locale (persists to cookie).
   *
   * `explicit` defaults to `true`, meaning the user chose this language
   * themselves and nothing should override it. Pass `false` when the locale
   * is derived from configuration — a tenant's `defaultLanguage`, say — so
   * that later changes to that configuration can still move the user.
   */
  setLocale: (locale: Locale, options?: { explicit?: boolean }) => void;
}
