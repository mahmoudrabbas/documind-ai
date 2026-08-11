import type { QueryLanguageValue } from "./intentQuery.types.js";
import {
  containsArabic,
  containsLatin,
  detectLanguage,
  normalizeArabic,
} from "./intentQuery.languageDetector.js";

export interface PreprocessedIntentText {
  /** Exact caller-supplied value. Never normalized or mutated. */
  readonly originalText: string;
  /** Classification-only Unicode/Arabic normalized and punctuation-free form. */
  readonly normalizedText: string;
  /** Classification-only form with expressive 3+ character runs collapsed. */
  readonly elongationReducedText: string;
  readonly normalizedTokens: readonly string[];
  readonly language: QueryLanguageValue;
  readonly scripts: {
    readonly arabic: boolean;
    readonly latin: boolean;
  };
  readonly hasEmojiOrSymbol: boolean;
}

/**
 * Collapse expressive elongation only. Double letters are retained because
 * they are frequently lexical (English "good", Arabic typo boundaries), while
 * runs of three or more identical letters are conversational emphasis.
 */
export function reduceCharacterElongation(text: string): string {
  return text.replace(/([\p{L}])\1{2,}/gu, "$1");
}

/**
 * Build a request-local classification representation. This intentionally
 * never becomes the persisted message and must not be used to rewrite exact
 * entities, identifiers, titles, dates, or numbers.
 */
export function preprocessIntentText(originalText: string): PreprocessedIntentText {
  const unicodeNormalized = String(originalText ?? "").normalize("NFKC");
  const scripts = {
    arabic: containsArabic(unicodeNormalized),
    latin: containsLatin(unicodeNormalized),
  } as const;
  const hasEmojiOrSymbol = /\p{S}/u.test(unicodeNormalized);

  let classificationText = unicodeNormalized.toLowerCase();
  classificationText = classificationText.replace(/['\u2018\u2019\u201A\u201B]/gu, "");
  classificationText = normalizeArabic(classificationText);
  classificationText = classificationText
    .replace(/\u200D|\uFE0E|\uFE0F/gu, "")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  const elongationReducedText = reduceCharacterElongation(classificationText)
    .replace(/\s+/gu, " ")
    .trim();

  return Object.freeze({
    originalText,
    normalizedText: classificationText,
    elongationReducedText,
    normalizedTokens: Object.freeze(
      elongationReducedText.split(/\s+/u).filter(Boolean),
    ),
    language: detectLanguage(unicodeNormalized),
    scripts,
    hasEmojiOrSymbol,
  });
}
