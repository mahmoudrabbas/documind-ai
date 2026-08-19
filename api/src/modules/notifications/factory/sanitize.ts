/**
 * Sanitization + validation helpers for the notification factory (T4).
 *
 * Responsibilities:
 *  - T1 locale fallback rule (both keys populated; missing locale falls back
 *    to the other, en canonical; both missing = factory error).
 *  - Size caps: title 256 / body 2048 / metadata 4KB (guardrail 5).
 *  - Action URL allowlist — the ONLY endpoints notification actions may point
 *    at (verified in the codebase; see ACTION_URL_TEMPLATES).
 *  - dedupEventId resolution (the T1 business-entity dedup key).
 *
 * Every failure is a typed `NotificationFactoryError` with a machine-readable
 * `code`. PURE — no I/O, no mongoose, no express.
 */
import type { LocalizedText } from "../../../db/models/notification.model.js";

export const MAX_TITLE_LENGTH = 256;
export const MAX_BODY_LENGTH = 2048;
export const MAX_METADATA_BYTES = 4096;
export const MAX_ACTIONS = 4;
export const MAX_ID_SEGMENT_LENGTH = 128;

export type NotificationFactoryErrorCode =
  | "UNKNOWN_TYPE"
  | "LOCALE_FALLBACK"
  | "SIZE_LIMIT"
  | "URL_NOT_ALLOWED"
  | "INVALID_ID_SEGMENT"
  | "MISSING_DEDUP_EVENT_ID";

export class NotificationFactoryError extends Error {
  readonly code: NotificationFactoryErrorCode;

  constructor(code: NotificationFactoryErrorCode, message: string) {
    super(message);
    this.name = "NotificationFactoryError";
    this.code = code;
  }
}

/**
 * `title` and `body` are PLAIN TEXT fields (LocalizedText on the notification
 * model) served over the JSON API and rendered as text nodes by the frontend,
 * which escapes at that point. HTML escaping therefore belongs to whichever
 * boundary actually emits HTML — the email templates do exactly that
 * (email-templates/templateRegistry.ts escapes every interpolated value) — and
 * NOT to this factory: escaping here stored `company&#39;s` in Mongo and forced
 * every reader to apply an inverse transform to show the user their own words.
 * Segments are kept verbatim; only whitespace is trimmed.
 */

/** Partial bilingual segment a producer may pass in the event envelope. */
export interface LocalizedSource {
  en?: string | null;
  ar?: string | null;
}

/**
 * T1 locale fallback rule: both keys MUST be populated. A missing locale
 * falls back to the other (en canonical). A source object with BOTH keys
 * missing/blank is a factory error.
 */
export function resolveLocalized(
  source: LocalizedSource | null | undefined,
  fallback: LocalizedText,
): LocalizedText {
  if (source == null) return fallback;
  const en =
    typeof source.en === "string" && source.en.trim() !== ""
      ? source.en.trim()
      : undefined;
  const ar =
    typeof source.ar === "string" && source.ar.trim() !== ""
      ? source.ar.trim()
      : undefined;
  if (en !== undefined && ar !== undefined) return { en, ar };
  if (en !== undefined) return { en, ar: en };
  if (ar !== undefined) return { en: ar, ar };
  throw new NotificationFactoryError(
    "LOCALE_FALLBACK",
    "localized segment has neither 'en' nor 'ar' — both locales missing",
  );
}

export function assertTitleLength(title: LocalizedText): void {
  if (title.en.length > MAX_TITLE_LENGTH || title.ar.length > MAX_TITLE_LENGTH) {
    throw new NotificationFactoryError(
      "SIZE_LIMIT",
      `title exceeds ${MAX_TITLE_LENGTH} characters (en: ${title.en.length}, ar: ${title.ar.length})`,
    );
  }
}

export function assertBodyLength(body: LocalizedText): void {
  if (body.en.length > MAX_BODY_LENGTH || body.ar.length > MAX_BODY_LENGTH) {
    throw new NotificationFactoryError(
      "SIZE_LIMIT",
      `body exceeds ${MAX_BODY_LENGTH} characters (en: ${body.en.length}, ar: ${body.ar.length})`,
    );
  }
}

export function assertMetadataSize(metadata: unknown): void {
  let bytes: number;
  try {
    bytes = Buffer.byteLength(JSON.stringify(metadata ?? {}), "utf8");
  } catch {
    throw new NotificationFactoryError("SIZE_LIMIT", "metadata is not JSON-serializable");
  }
  if (bytes > MAX_METADATA_BYTES) {
    throw new NotificationFactoryError(
      "SIZE_LIMIT",
      `metadata exceeds ${MAX_METADATA_BYTES} bytes (${bytes})`,
    );
  }
}

/**
 * Action URL allowlist — the ONLY action destinations any notification may
 * carry. Every template was verified against the real route files:
 *  - POST /documents/:id/ocr/retry   → processing.routes.ts:94, mounted under
 *    /documents (app.ts:184)
 *  - POST /documents/:id/index/retry → indexing.routes.ts:33 (router.use'd by
 *    processing.routes.ts:32 → same /documents mount)
 *  - GET  /documents/:id             → documents.routes.ts (view document)
 */
export const ACTION_URL_TEMPLATES = [
  "/documents/:id/ocr/retry",
  "/documents/:id/index/retry",
  "/documents/:id",
] as const;

function templateToRegex(template: string): RegExp {
  const escaped = template.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(":id", "[^/]+")}$`);
}

export function isActionUrlAllowed(url: string): boolean {
  return ACTION_URL_TEMPLATES.some((template) => templateToRegex(template).test(url));
}

export function assertActionUrlAllowed(url: string): void {
  if (!isActionUrlAllowed(url)) {
    throw new NotificationFactoryError("URL_NOT_ALLOWED", `action url '${url}' is not allowlisted`);
  }
}

/**
 * Build a concrete action URL from an allowlisted template and a business id.
 * The id is validated to be a single safe path segment (no `/`, `?`, `#`,
 * whitespace) and percent-encoded, so it can never escape the template shape.
 */
export function buildActionUrl(template: string, id: string): string {
  if (!(ACTION_URL_TEMPLATES as readonly string[]).includes(template)) {
    throw new NotificationFactoryError(
      "URL_NOT_ALLOWED",
      `action url template '${template}' is not allowlisted`,
    );
  }
  if (id.length === 0 || id.length > MAX_ID_SEGMENT_LENGTH || /[/?#\s]/.test(id)) {
    throw new NotificationFactoryError(
      "INVALID_ID_SEGMENT",
      `'${id}' is not a safe single path segment`,
    );
  }
  const url = template.replace(":id", encodeURIComponent(id));
  assertActionUrlAllowed(url);
  return url;
}

/**
 * Resolve the draft's dedupEventId (T1: the business-entity id backing the
 * sliding-window dedup range query). Prefers the event's own value, then a
 * per-type metadata fallback; missing both is a factory error.
 */
export function resolveDedupEventId(
  event: { dedupEventId?: string | null },
  fallback?: string,
): string {
  const value = event.dedupEventId?.trim() || fallback?.trim();
  if (!value) {
    throw new NotificationFactoryError(
      "MISSING_DEDUP_EVENT_ID",
      "dedupEventId is required for this notification type",
    );
  }
  return value;
}
