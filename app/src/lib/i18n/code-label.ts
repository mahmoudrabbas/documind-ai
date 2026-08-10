/**
 * Display labels for machine status codes.
 *
 * The API returns stable SCREAMING_SNAKE codes (`"PAST_DUE"`, `"COMPLETED"`)
 * that several screens used to render by string-munging into English
 * ("Past Due"). That is untranslatable by construction, so this module
 * routes those codes through the translation dictionary instead.
 *
 * The codes themselves are untouched — they stay the machine identifier
 * used for comparisons, colour lookup, and API payloads. Only the text
 * shown to the user changes.
 *
 * Pure module — no React, no hooks, safe to unit-test directly.
 *
 * @module code-label
 */

/**
 * Convert a status code to title-cased English, e.g. `"PAST_DUE"` → `"Past Due"`.
 *
 * This reproduces the string-munging the UI did before translations
 * existed, and survives as the fallback for codes the dictionaries have
 * not caught up with yet.
 */
export function humanizeCode(code: string): string {
  return code
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Resolve the display label for `code` from `<namespace>.<code>`.
 *
 * `t()` returns the key itself when a translation is missing, so that
 * case is detected and falls back to {@link humanizeCode}. An unmapped
 * code therefore renders exactly the English it rendered before — never
 * blank, and never a raw dotted key leaking into the UI.
 *
 * @param t         The `t` function from `useI18n()`.
 * @param namespace Dictionary namespace, e.g. `"billing.subscriptionStatus"`.
 * @param code      The machine code, e.g. `"PAST_DUE"`.
 */
export function codeLabel(
  t: (key: string) => string,
  namespace: string,
  code: string,
): string {
  const normalized = code.trim().toLowerCase().replaceAll(" ", "_");
  const key = `${namespace}.${normalized}`;
  const value = t(key);
  if (value !== key) return value;

  const rawKey = `${namespace}.${code.toLowerCase()}`;
  const rawValue = t(rawKey);
  if (rawValue !== rawKey) return rawValue;

  return humanizeCode(code);
}
