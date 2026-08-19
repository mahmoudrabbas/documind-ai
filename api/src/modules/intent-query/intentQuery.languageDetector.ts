import type { QueryLanguageValue } from "./intentQuery.types.js";

/**
 * Common Arabizi tokens (Arabic written with Latin letters/digits). Only
 * distinctive, bounded terms are listed so legitimate English input is never
 * misclassified; a Latin-script message is treated as Arabizi only when it
 * contains at least two of these tokens.
 */
const ARABIZI_TOKENS = new Set<string>([
  "momken", "mumkin", "ezay", "izzay", "imta", "kam", "kaam", "yom", "yoom",
  "3ala", "3la", "3an", "3and", "3nd", "kaman", "bardo", "mafi", "awel",
  "akher", "keda", "kida", "sa3a", "sa3at", "bokra", "awy", "ktir", "keteer",
  "kteer", "katir", "haga", "wayed", "lissa", "gamid", "3ashan", "3shan",
  "zay", "zei", "yalla", "khalas", "khales", "ya3ni", "3ayez", "7aga", "feen",
  "delwa2ti",
]);

/**
 * Best-effort detection of Arabizi (Arabic written with Latin script, often
 * using digits 2/3/7/9 for Arabic letters). Bounded and conservative: requires
 * at least two distinctive Arabizi tokens so English questions containing one
 * transliterated word are not misclassified.
 */
export function isLikelyArabizi(text: string): boolean {
  if (containsArabic(text)) return false;
  if (!containsLatin(text)) return false;
  const tokens = text.toLowerCase().match(/[a-z][a-z0-9]*/gu) ?? [];
  let hits = 0;
  for (const token of tokens) {
    if (ARABIZI_TOKENS.has(token)) {
      hits += 1;
      if (hits >= 2) return true;
    }
  }
  return false;
}

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
  // Arabizi is Arabic written in Latin script: route it as Arabic so the
  // answer language and bilingual retrieval expansions follow the user's
  // actual language.
  if (isLikelyArabizi(text)) {
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
