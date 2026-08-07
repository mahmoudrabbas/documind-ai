/**
 * Content-direction detection for chat messages.
 *
 * The application locale sets the page-level direction via `<html dir="...">`,
 * but individual chat messages must render according to the direction of their
 * *content* — an Arabic reply must read RTL even when the UI locale is English,
 * and an English reply must read LTR even when the UI locale is Arabic.
 *
 * Detection is therefore performed per-message using a simple, deterministic
 * rule: if the message text contains any Arabic-script character, it is
 * treated as RTL/Arabic; otherwise it falls back to LTR/English. This keeps
 * the decision local, dependency-free, and independent of the UI locale.
 *
 * The Arabic-script range covers the main Arabic block (U+0600–U+06FF) plus
 * the Arabic Supplement block (U+0750–U+077F), which together account for all
 * standard Arabic letters, hamzas, and presentation forms used in prose.
 */

import type { Direction, Locale } from "./i18n.types";

const ARABIC_SCRIPT_RANGE = /[\u0600-\u06FF\u0750-\u077F]/;

export interface ContentDirection {
  dir: Direction;
  lang: Locale;
}

/**
 * Determine the text direction and language for a piece of chat content.
 *
 * Rule:
 *   - contains an Arabic-script character  -> rtl / ar
 *   - otherwise                             -> ltr / en
 *
 * Returns a stable object so callers can destructure `dir` and `lang`
 * directly onto a rendered element.
 */
export function getContentDirection(content: unknown): ContentDirection {
  if (typeof content !== "string" || content.length === 0) {
    return { dir: "ltr", lang: "en" };
  }
  return ARABIC_SCRIPT_RANGE.test(content)
    ? { dir: "rtl", lang: "ar" }
    : { dir: "ltr", lang: "en" };
}

export default getContentDirection;

