const ARABIC_RANGE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const ARABIC_RANGE_G = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
const LATIN_RANGE = /[a-zA-Z]/;
const LATIN_RANGE_G = /[a-zA-Z]/g;

export function detectLanguage(text: string): "ar" | "en" | "mixed" {
  const hasArabic = ARABIC_RANGE.test(text);
  const hasLatin = LATIN_RANGE.test(text);

  if (hasArabic && hasLatin) {
    const arabicCount = (text.match(ARABIC_RANGE_G) || []).length;
    const latinCount = (text.match(LATIN_RANGE_G) || []).length;
    const total = arabicCount + latinCount;
    if (total === 0) return "en";
    const arabicRatio = arabicCount / total;
    if (arabicRatio > 0.3 && arabicRatio < 0.7) return "mixed";
    return arabicRatio >= 0.7 ? "ar" : "en";
  }

  if (hasArabic) return "ar";
  return "en";
}
