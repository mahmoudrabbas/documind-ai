import type { SemanticQueryType, KeywordQueryType, DetectedEntityType, QueryLanguageValue } from "./intentQuery.types.js";
import { normalizeArabic, containsArabic } from "./intentQuery.languageDetector.js";

// A bidirectional enterprise bilingual dictionary
const BILINGUAL_DICTIONARY: { en: string[]; ar: string[] }[] = [
  { en: ["vacation", "leave", "holiday"], ar: ["اجازه", "اجازات", "عطله"] },
  { en: ["sick leave", "medical leave"], ar: ["اجازه مرضيه", "مرضيه", "مرضى"] },
  { en: ["policy", "regulation", "rule"], ar: ["سياسه", "سياسات", "قاعده", "لوائح", "لائحه"] },
  { en: ["contract", "agreement"], ar: ["عقد", "اتفاقيه"] },
  { en: ["salary", "compensation", "payroll", "pay"], ar: ["راتب", "رواتب", "اجور", "تعويضات"] },
  { en: ["insurance", "health insurance", "medical insurance"], ar: ["تأمين", "تامين", "تأمين صحي", "تامين صحي"] },
  { en: ["employee", "staff", "worker"], ar: ["موظف", "موظفين", "عامل"] },
  { en: ["handbook", "guide", "manual"], ar: ["دليل", "كتيب"] },
  { en: ["onboarding", "induction"], ar: ["تهيئة", "تهيئه", "تعيين"] },
  { en: ["termination", "resignation", "dismissal"], ar: ["انهاء", "إنهاء", "استقاله", "فصل"] },
  { en: ["code of conduct", "ethics"], ar: ["قواعد السلوك", "اخلاقيات", "أخلاقيات العمل"] },
  { en: ["compliance"], ar: ["امتثال", "التزام"] },
  { en: ["work", "job", "employment"], ar: ["عمل", "وظيفة", "توظيف"] },
];

/**
 * Normalizes input string for English (lowercase) and Arabic (normalized letters).
 */
function normalizeWord(word: string): string {
  const lower = word.toLowerCase().trim();
  return normalizeArabic(lower);
}

/**
 * Finds expansions for a single term.
 */
export function getExpansions(term: string): { en: string[]; ar: string[] } {
  const normTerm = normalizeWord(term);
  const enMatches: string[] = [];
  const arMatches: string[] = [];

  for (const entry of BILINGUAL_DICTIONARY) {
    const hasEn = entry.en.some(w => normalizeWord(w) === normTerm || normTerm.includes(normalizeWord(w)));
    const hasAr = entry.ar.some(w => normalizeWord(w) === normTerm || normTerm.includes(normalizeWord(w)));

    if (hasEn || hasAr) {
      entry.en.forEach(w => {
        if (w.toLowerCase() !== term.toLowerCase()) enMatches.push(w);
      });
      entry.ar.forEach(w => {
        if (normalizeArabic(w) !== normalizeArabic(term)) arMatches.push(w);
      });
    }
  }

  return {
    en: [...new Set(enMatches)],
    ar: [...new Set(arMatches)],
  };
}

/**
 * Expands semantic and keyword queries with bilingual translations.
 * Respects `preserveExact` flags on entities.
 */
export function expandBilingual(
  originalQuestion: string,
  detectedLanguage: QueryLanguageValue,
  entities: DetectedEntityType[]
): { semanticQueries: SemanticQueryType[]; keywordQueries: KeywordQueryType[] } {
  const semanticQueries: SemanticQueryType[] = [];
  const keywordQueries: KeywordQueryType[] = [];

  // 1. Add the primary semantic query (weight 1.0)
  semanticQueries.push({
    text: originalQuestion,
    language: detectedLanguage,
    weight: 1.0,
  });

  // 2. Extract keywords from original question, ignoring exact-preserve entities
  let cleanTextForExpansion = originalQuestion.toLowerCase();
  for (const ent of entities) {
    if (ent.preserveExact) {
      // Remove exact entities from text to prevent expanding them
      cleanTextForExpansion = cleanTextForExpansion.replace(ent.text.toLowerCase(), "");
    }
  }

  // Split clean text into tokens (words)
  const words = cleanTextForExpansion.split(/[\s,?.؛،/\\-_()"'«»]+/).filter(w => w.length > 2);
  
  const expandedArTerms: string[] = [];
  const expandedEnTerms: string[] = [];

  for (const word of words) {
    const expansions = getExpansions(word);
    expansions.en.forEach(w => expandedEnTerms.push(w));
    expansions.ar.forEach(w => expandedArTerms.push(w));
  }

  const uniqueArTerms = [...new Set(expandedArTerms)];
  const uniqueEnTerms = [...new Set(expandedEnTerms)];

  // Create semantic queries for expanded terms if they exist
  if (detectedLanguage === "ar" && uniqueEnTerms.length > 0) {
    // Expand Arabic question to English semantic query
    // Generate a simple query string from expanded terms
    semanticQueries.push({
      text: uniqueEnTerms.join(" "),
      language: "en",
      weight: 0.7, // Lower weight for translated/expanded query
    });
  } else if (detectedLanguage === "en" && uniqueArTerms.length > 0) {
    // Expand English question to Arabic semantic query
    semanticQueries.push({
      text: uniqueArTerms.join(" "),
      language: "ar",
      weight: 0.7,
    });
  } else if (detectedLanguage === "mixed") {
    // For mixed, add expansions for both sides if present
    if (uniqueEnTerms.length > 0) {
      semanticQueries.push({
        text: uniqueEnTerms.join(" "),
        language: "en",
        weight: 0.7,
      });
    }
    if (uniqueArTerms.length > 0) {
      semanticQueries.push({
        text: uniqueArTerms.join(" "),
        language: "ar",
        weight: 0.7,
      });
    }
  }

  // 3. Keyword queries
  // Build base keyword query with exact terms from entities first
  const exactTerms = entities
    .filter(e => e.preserveExact)
    .map(e => e.text);

  // If there are words, add them as keywords
  const baseTerms = words.filter(w => !exactTerms.some(et => et.toLowerCase().includes(w)));
  
  if (detectedLanguage === "ar" || detectedLanguage === "mixed") {
    const arKeywordTerms = [...exactTerms.filter(t => containsArabic(t)), ...baseTerms.filter(t => containsArabic(t))];
    if (arKeywordTerms.length > 0) {
      keywordQueries.push({
        terms: arKeywordTerms.slice(0, 30),
        language: "ar",
        mustMatch: false,
      });
    }

    // Add translated english keywords if expanded
    const enKeywordTerms = [...exactTerms.filter(t => !containsArabic(t)), ...uniqueEnTerms];
    if (enKeywordTerms.length > 0) {
      keywordQueries.push({
        terms: enKeywordTerms.slice(0, 30),
        language: "en",
        mustMatch: false,
      });
    }
  }

  if (detectedLanguage === "en" || detectedLanguage === "mixed") {
    const enKeywordTerms = [...exactTerms.filter(t => !containsArabic(t)), ...baseTerms.filter(t => !containsArabic(t))];
    if (enKeywordTerms.length > 0) {
      keywordQueries.push({
        terms: enKeywordTerms.slice(0, 30),
        language: "en",
        mustMatch: false,
      });
    }

    // Add translated arabic keywords if expanded
    const arKeywordTerms = [...exactTerms.filter(t => containsArabic(t)), ...uniqueArTerms];
    if (arKeywordTerms.length > 0) {
      keywordQueries.push({
        terms: arKeywordTerms.slice(0, 30),
        language: "ar",
        mustMatch: false,
      });
    }
  }

  return {
    semanticQueries,
    keywordQueries,
  };
}
