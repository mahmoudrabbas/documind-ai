/**
 * API-side i18n helpers — kept minimal to avoid coupling to the frontend's
 * translation dictionaries. The frontend owns the full EN/AR translation
 * surface; the backend only needs direction for Guide Mode.
 */

export function getDirection(locale: string): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function getSupportedLocales(): readonly string[] {
  return ["en", "ar"] as const;
}