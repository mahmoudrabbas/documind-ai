import type { QueryLanguageValue } from "./intentQuery.types.js";

/**
 * Detects the query language based on character set analysis.
 * Returns:
 * - "ar" if it contains Arabic characters and no Latin letters.
 * - "en" if it contains Latin letters and no Arabic characters.
 * - "mixed" if it contains both.
 * - "en" (default) if neither or empty.
 */
export function detectLanguage(text: string): QueryLanguageValue {
  const hasAr = containsArabic(text);
  const hasLa = containsLatin(text);

  if (hasAr && hasLa) {
    return "mixed";
  }
  if (hasAr) {
    return "ar";
  }
  return "en";
}

/**
 * Checks if a string contains Arabic characters.
 */
export function containsArabic(text: string): boolean {
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  return arabicRegex.test(text);
}

/**
 * Checks if a string contains Latin letters.
 */
export function containsLatin(text: string): boolean {
  const latinRegex = /[a-zA-Z]/;
  return latinRegex.test(text);
}

/**
 * Normalizes Arabic text for consistent matching/comparison:
 * - Removes diacritics (harakat: fatha, damma, kasra, sukun, shadda, tanween)
 * - Normalizes Alif (إ, أ, آ -> ا)
 * - Normalizes Taa Marbuta (ة -> ه)
 * - Normalizes Ya (ى -> ي)
 * - Removes Tatweel/Kashida (ـ)
 */
export function normalizeArabic(text: string): string {
  if (!text) return "";
  
  let normalized = text;

  // 1. Remove Kashida / Tatweel
  normalized = normalized.replace(/\u0640/g, "");

  // 2. Remove Harakat (diacritics)
  // Range of Arabic diacritics: U+064B to U+0652, U+0653 to U+065F (some rare ones)
  normalized = normalized.replace(/[\u064B-\u0652]/g, "");

  // 3. Normalize Alifs
  normalized = normalized.replace(/[\u0622\u0623\u0625]/g, "\u0627");

  // 4. Normalize Taa Marbuta (ة to ه)
  normalized = normalized.replace(/\u0629/g, "\u0647");

  // 5. Normalize Ya / Alif Maqsoora (ى to ي)
  normalized = normalized.replace(/\u0649/g, "\u064A");

  return normalized.trim();
}
