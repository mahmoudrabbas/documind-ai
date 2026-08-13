/**
 * Pure helpers shared by the notification UI (bell dropdown + history page).
 * No JSX, no I/O — unit-testable alongside the component tests.
 */

import type { Locale } from "@/lib/i18n/i18n.types";
import type {
  LocalizedText,
  UnreadCountByPriority,
} from "@/types/api/notifications.types";

/** Pick the localized text for the active locale (en is the canonical fallback). */
export function localizeNotification(
  text: LocalizedText,
  locale: Locale,
): string {
  return text[locale] || text.en || "";
}

/**
 * Display text for real-time payloads: socket events carry plain strings,
 * REST notifications carry LocalizedText — accept both.
 */
export function toNotificationText(
  text: LocalizedText | string,
  locale: Locale,
): string {
  if (typeof text === "string") return text;
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
