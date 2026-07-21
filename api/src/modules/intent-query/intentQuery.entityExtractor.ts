import type { DetectedEntityType, QueryLanguageValue, TemporalConstraintType } from "./intentQuery.types.js";
import { containsArabic } from "./intentQuery.languageDetector.js";

/**
 * Extracts entities from user query text using deterministic regex rules.
 */
export function extractEntities(text: string, _language?: QueryLanguageValue): DetectedEntityType[] {
  if (!text) return [];

  const entities: DetectedEntityType[] = [];

  // 1. Quoted phrases (highest priority, we want to preserve these exact phrases)
  const quoteRegex = /"([^"]+)"|'([^']+)'|«([^»]+)»/g;
  let match;
  while ((match = quoteRegex.exec(text)) !== null) {
    const matchedText = match[1] || match[2] || match[3];
    if (matchedText && matchedText.trim()) {
      entities.push({
        text: matchedText.trim(),
        type: "quoted_phrase",
        language: determineLanguageOfText(matchedText),
        preserveExact: true,
      });
    }
  }

  // 2. Document References (e.g., DOC-12345 or Doc-123)
  const docRefRegex = /\b(doc|docx|pdf)-\d+\b/ig;
  while ((match = docRefRegex.exec(text)) !== null) {
    entities.push({
      text: match[0],
      type: "document_title",
      language: "en",
      preserveExact: true,
    });
  }

  // 3. Clause Numbers (Arabic and English)
  // English: Clause 5, Article 12.3, Section 2
  const clauseEnRegex = /\b(article|clause|section|para|paragraph|item)\b\s*\d+(\.\d+)*/ig;
  while ((match = clauseEnRegex.exec(text)) !== null) {
    entities.push({
      text: match[0],
      type: "clause_number",
      language: "en",
      preserveExact: true,
    });
  }

  // Arabic: المادة 5, البند 12.3, المادة الخامسة, الفقرة الثانية
  const clauseArRegex = /(المادة|البند|القسم|الفقرة)\s+(\d+|الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|الحادي عشر|الثاني عشر|الأولى|الثانية|الثالثة|الرابعة|الخامسة|السادسة|السابعة|الثامنة|التاسعة|العاشرة|الحادية عشرة|الثانية عشرة|[١٢٣٤٥٦٧٨٩٠]+)(\.[\d١٢٣٤٥٦٧٨٩٠]+)*/g;
  while ((match = clauseArRegex.exec(text)) !== null) {
    entities.push({
      text: match[0],
      type: "clause_number",
      language: "ar",
      preserveExact: true,
    });
  }

  // 4. Dates
  // standard date pattern: YYYY-MM-DD or DD/MM/YYYY
  const standardDateRegex = /\b\d{4}[-/./]\d{1,2}[-/./]\d{1,2}\b|\b\d{1,2}[-/./]\d{1,2}[-/./]\d{4}\b/g;
  while ((match = standardDateRegex.exec(text)) !== null) {
    entities.push({
      text: match[0],
      type: "date",
      language: "en",
      preserveExact: true,
    });
  }

  // Arabic Dates (e.g. 15 يناير 2024 or 15/يناير/2024)
  const monthsAr = "يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر";
  const dateArRegex = new RegExp(`\\b\\d{1,2}\\s+(${monthsAr})\\s+\\d{4}\\b`, "g");
  while ((match = dateArRegex.exec(text)) !== null) {
    entities.push({
      text: match[0],
      type: "date",
      language: "ar",
      preserveExact: true,
    });
  }

  // English Dates (e.g. 15 January 2024, Jan 15 2024)
  const monthsEn = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec";
  const dateEnRegex = new RegExp(`\\b\\d{1,2}(st|nd|rd|th)?\\s+(${monthsEn})\\s+\\d{4}\\b|\\b(${monthsEn})\\s+\\d{1,2}(st|nd|rd|th)?,?\\s+\\d{4}\\b`, "ig");
  while ((match = dateEnRegex.exec(text)) !== null) {
    entities.push({
      text: match[0],
      type: "date",
      language: "en",
      preserveExact: true,
    });
  }

  // 5. Numbers (distinct digits of length 3 or more, or code-like digits to exclude short counts)
  const numberRegex = /\b\d{3,}\b/g;
  while ((match = numberRegex.exec(text)) !== null) {
    // Only add if not already captured by dates or clauses
    if (!isSubsumed(match[0], match.index, entities, text)) {
      entities.push({
        text: match[0],
        type: "number",
        language: "en",
        preserveExact: true,
      });
    }
  }

  return entities;
}

function determineLanguageOfText(val: string): QueryLanguageValue {
  const hasAr = containsArabic(val);
  const latinRegex = /[a-zA-Z]/;
  const hasLa = latinRegex.test(val);
  if (hasAr && hasLa) return "mixed";
  if (hasAr) return "ar";
  return "en";
}

function isSubsumed(matchText: string, index: number, entities: DetectedEntityType[], originalText: string): boolean {
  // Check if this position is inside any already matched entity in originalText
  const matchStart = index;
  const matchEnd = index + matchText.length;

  for (const ent of entities) {
    // TODO: indexOf may match the wrong occurrence if the same text appears multiple times. Needs offset tracking.
    const entIndex = originalText.indexOf(ent.text);
    if (entIndex !== -1) {
      const entStart = entIndex;
      const entEnd = entIndex + ent.text.length;
      if (matchStart >= entStart && matchEnd <= entEnd) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Extracts temporal constraints from text using regex rules.
 */
export function extractTemporalConstraints(text: string): TemporalConstraintType[] {
  if (!text) return [];

  const constraints: TemporalConstraintType[] = [];
  let match;

  const startOrSpace = "(?:^|[\\s,?.؛،/\\\\-_()\"'«»])";
  const endOrSpace = "(?:$|[\\s,?.؛،/\\\\-_()\"'«»])";
  const yearOptAr = "(?:عام\\s+|سنة\\s+)?";
  const yearOptEn = "(?:year\\s+)?";

  // 1. Between range: "between YYYY and YYYY", "from YYYY to YYYY", "بين YYYY و YYYY", "من YYYY إلى YYYY"
  const betweenEnPattern = `\\b(between|from)\\s+${yearOptEn}(\\d{4})\\s+(and|to)\\s+${yearOptEn}(\\d{4})\\b`;
  const betweenArPattern = `${startOrSpace}بين\\s+${yearOptAr}(\\d{4})\\s+و\\s+${yearOptAr}(\\d{4})${endOrSpace}`;
  const betweenRegex = new RegExp(`${betweenEnPattern}|${betweenArPattern}`, "ig");

  while ((match = betweenRegex.exec(text)) !== null) {
    const startVal = match[2] || match[5];
    const endVal = match[4] || match[6];
    if (startVal && endVal) {
      constraints.push({
        type: "between",
        value: `${startVal}-${endVal}`,
        rawText: match[0].trim(),
      });
    }
  }

  // 2. Before constraint: "before YYYY", "prior to YYYY", "قبل YYYY"
  const beforeEnPattern = `\\b(before|prior\\s+to)\\s+${yearOptEn}(\\d{4})\\b`;
  const beforeArPattern = `${startOrSpace}قبل\\s+${yearOptAr}(\\d{4})${endOrSpace}`;
  const beforeRegex = new RegExp(`${beforeEnPattern}|${beforeArPattern}`, "ig");

  while ((match = beforeRegex.exec(text)) !== null) {
    const val = match[2] || match[3];
    if (val && !constraints.some(c => c.rawText.includes(match![0].trim()))) {
      constraints.push({
        type: "before",
        value: val,
        rawText: match[0].trim(),
      });
    }
  }

  // 3. After constraint: "after YYYY", "since YYYY", "بعد YYYY", "منذ YYYY"
  const afterEnPattern = `\\b(after|since)\\s+${yearOptEn}(\\d{4})\\b`;
  const afterArPattern = `${startOrSpace}(بعد|منذ)\\s+${yearOptAr}(\\d{4})${endOrSpace}`;
  const afterRegex = new RegExp(`${afterEnPattern}|${afterArPattern}`, "ig");

  while ((match = afterRegex.exec(text)) !== null) {
    const val = match[2] || match[4];
    if (val && !constraints.some(c => c.rawText.includes(match![0].trim()))) {
      constraints.push({
        type: "after",
        value: val,
        rawText: match[0].trim(),
      });
    }
  }

  // 4. Exact / Specific constraint: "in YYYY", "during YYYY", "في YYYY", "خلال YYYY"
  const exactEnPattern = `\\b(in|during)\\s+${yearOptEn}(\\d{4})\\b`;
  const exactArPattern = `${startOrSpace}(في|خلال|لعام)\\s+${yearOptAr}(\\d{4})${endOrSpace}`;
  const exactRegex = new RegExp(`${exactEnPattern}|${exactArPattern}`, "ig");

  while ((match = exactRegex.exec(text)) !== null) {
    const val = match[2] || match[4];
    if (val && !constraints.some(c => c.rawText.includes(match![0].trim()))) {
      constraints.push({
        type: "exact",
        value: val,
        rawText: match[0].trim(),
      });
    }
  }

  return constraints;
}

