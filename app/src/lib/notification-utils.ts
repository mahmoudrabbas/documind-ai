/**
 * Pure helpers shared by the notification UI (bell dropdown + history page).
 * No JSX, no I/O — unit-testable alongside the component tests.
 */

import type { Locale } from "@/lib/i18n/i18n.types";
import type {
  LocalizedText,
  UnreadCountByPriority,
} from "@/types/api/notifications.types";

/**
 * The five entities the API's notification factory produced while it
 * HTML-escaped plain-text `title`/`body`. That escaping is gone at the source
 * (api notifications/factory/sanitize.ts) — notification text is now stored
 * exactly as the user wrote it — but rows persisted before the fix live on
 * until the 90-day notification TTL expires them, so the reader still has to
 * undo precisely that escaping.
 *
 * Deliberately NOT listed: `&apos;`, `&#x27;`, `&#x2F;`, `&#x60;` and arbitrary
 * numeric references. The old escaper never emitted them, so any occurrence is
 * a literal the user typed and decoding it would corrupt their words.
 */
const LEGACY_ESCAPED_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

/**
 * Undo the legacy notification escaping so pre-fix rows read as the user wrote
 * them (`company&#39;s` → `company's`). A no-op for text stored after the fix.
 *
 * Single pass by construction: `&amp;lt;` decodes to the literal `&lt;` the
 * user typed, never on to `<`. Arabic text is untouched — the old escaper only
 * ever rewrote the five ASCII characters above. Output is rendered as a React
 * text node, so decoding can never introduce live markup.
 */
export function decodeHtmlEntities(text: string): string {
  return text.replace(
    /&(?:amp|lt|gt|quot|#39);/g,
    (entity) => LEGACY_ESCAPED_ENTITIES[entity] ?? entity,
  );
}

/** Pick the localized text for the active locale (en is the canonical fallback). */
export function localizeNotification(
  text: LocalizedText,
  locale: Locale,
): string {
  return decodeHtmlEntities(text[locale] || text.en || "");
}

/**
 * Display text for real-time payloads: socket events carry plain strings,
 * REST notifications carry LocalizedText — accept both.
 */
export function toNotificationText(
  text: LocalizedText | string,
  locale: Locale,
): string {
  if (typeof text === "string") return decodeHtmlEntities(text);
  return localizeNotification(text, locale);
}

/**
 * Notification actions carry an API route (e.g. `/documents/:id/ocr/retry`).
 * They are rendered as plain client-side links to the same permission-checked
 * frontend routes the direct UI uses — never server-side dispatches.
 */
export function resolveNotificationActionHref(url: string): string {
  if (url.startsWith("/documents/")) {
    if (url.includes("/retry")) return "/dashboard/processing-failed";
    return "/dashboard/documents";
  }
  return url;
}

/**
 * Map the highest unread priority to the badge color token:
 * critical → red, high → orange, normal → blue, low → gray.
 * Returns null when there is nothing unread (badge is hidden).
 */
export function notificationsBadgeColor(
  byPriority: UnreadCountByPriority,
): string | null {
  if (byPriority.critical > 0) return "bg-error";
  if (byPriority.high > 0) return "bg-warning";
  if (byPriority.normal > 0) return "bg-info";
  if (byPriority.low > 0) return "bg-on-surface-variant";
  return null;
}
