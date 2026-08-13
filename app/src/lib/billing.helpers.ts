/**
 * Shared billing helper functions.
 *
 * Pure utility module — no React, no hooks, no side effects.
 *
 * @module billing.helpers
 */

/* ── Subscription status ──────────────────────────────────────────────── */

/**
 * Convert an API subscription-status string to a human-readable label.
 *
 *   "ACTIVE"              → "Active"
 *   "TRIALING"            → "Trial"
 *   "INCOMPLETE"          → "Incomplete"
 *   "PAST_DUE"            → "Past Due"
 *   "PAUSED"              → "Paused"
 *   "CANCEL_AT_PERIOD_END" → "Cancel At Period End"
 *   "CANCELED"            → "Canceled"
 *   "EXPIRED"             → "Expired"
 *   "UNPAID"              → "Unpaid"
 *   "foo_bar"             → "Foo Bar" (fallback)
 */
export function formatSubscriptionStatus(status: string): string {
  return status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ── Price formatting ─────────────────────────────────────────────────── */

/**
 * Format a numeric price for display.
 *
 * - Zero or negative prices → `"Free"`
 * - Otherwise → currency-formatted with `Intl.NumberFormat` (no decimals).
 *
 * `locale` is defaulted so existing callers are unaffected; pass
 * `useIntlLocale()` to follow the active language.
 */
export function formatPrice(
  price: number,
  currency: string,
  locale: string = "en-US",
): string {
  if (price <= 0) return "Free";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

/* ── Pluralisation ────────────────────────────────────────────────────── */

/**
 * Return a human-friendly count + noun string, e.g. `"1 employee"`, `"3 employees"`.
 *
 * @param count   The number of items.
 * @param singular The singular noun (e.g. `"employee"`).
 * @param plural   Optional explicit plural form; defaults to `singular + "s"`.
 */
export function pluralize(
  count: number,
  singular: string,
  plural?: string,
): string {
  return `${count} ${count === 1 ? singular : plural ?? `${singular}s`}`;
}

/* ── Days remaining ───────────────────────────────────────────────────── */

/**
 * Calculate the number of whole days between **now** and a future/past date.
 *
 * Returns `null` when `dateStr` is falsy (no date available).
 * A positive number means days remaining; a negative number means days past.
 */
export function getDaysRemaining(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const now = new Date();
  return Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/* ── Nullable date formatting ─────────────────────────────────────────── */

/**
 * Format a date string for display, or return `"—"` when none is provided.
 *
 * Output format: `"MMM D, YYYY"` (e.g. `"Jan 5, 2026"`).
 *
 * `locale` is defaulted so existing callers are unaffected; pass
 * `useIntlLocale()` to follow the active language.
 */
export function formatNullableDate(
  dateStr: string | null,
  locale: string = "en-US",
): string {
  if (!dateStr) return "\u2014";
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(dateStr));
}
