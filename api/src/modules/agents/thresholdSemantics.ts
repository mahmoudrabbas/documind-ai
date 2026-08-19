import { normalizeArabic } from "../intent-query/intentQuery.languageDetector.js";

export type ThresholdOperator = "gt" | "gte" | "lt" | "lte";

export interface NumericMention {
  readonly value: number;
  readonly unit: string | null;
  /**
   * Period this quantity is measured over ("week" for "2 days per week"), or
   * `null` when it is an absolute quantity ("90 days of employment").
   */
  readonly ratePeriod: string | null;
  readonly start: number;
  readonly end: number;
}

export interface ThresholdRule extends NumericMention {
  readonly operator: ThresholdOperator;
}

export interface ThresholdComparison {
  readonly questionValue: number;
  readonly thresholdValue: number;
  readonly unit: string;
  readonly operator: ThresholdOperator;
  readonly satisfied: boolean;
}

export interface ThresholdDecision {
  readonly conditions: readonly ThresholdComparison[];
  readonly satisfied: boolean;
}

const NUMBER_WORD_VALUES: Readonly<Record<string, number>> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const NUMBER_TOKEN = String.raw`(?:[+-]?\d[\d,]*(?:\.\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|thirty(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|forty(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|fifty(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|sixty(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|seventy(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|eighty(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|ninety(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?)`;

const TEMPORAL_UNIT_MODIFIERS = String.raw`(?:remote|business|calendar|working|consecutive)\s+`;

const NUMBER_PATTERN = new RegExp(
  String.raw`(?<![\p{L}\p{N}_])(?:USD\s*|\$\s*)?(${NUMBER_TOKEN})(?:\s*(?:-\s*)?(?:${TEMPORAL_UNIT_MODIFIERS})?(%|percent(?:age)?|USD|dollars?|days?|hours?|minutes?|degrees?|دولار(?:ا)?|ايام|يوم(?:ا)?|ساعات?|ساعه|دقائق?|دقيقه|درجات?|درجه|بالمئه))?(?![\p{L}\p{N}_])`,
  "giu",
);

const PREFIX_OPERATORS: readonly [RegExp, ThresholdOperator][] = [
  [/(?:>=|≥|at\s+least|minimum(?:\s+of)?(?:\s+[\p{L}-]+){0,4}\s*(?:is|=|:)?|no\s+less\s+than|علي\s+الاقل|بحد\s+ادني|لا\s+يقل\s+عن)\s*$/iu, "gte"],
  [/(?:<=|≤|at\s+most|maximum(?:\s+of)?(?:\s+[\p{L}-]+){0,4}\s*(?:is|=|:)?|up\s+to|no\s+more\s+than|بحد\s+اقصي|لا\s+يزيد\s+عن|حتي|الي\s+حد\s+اقصي)\s*$/iu, "lte"],
  [/(?:>|greater\s+than|above|more\s+than|over|اكثر\s+من|اكبر\s+من|فوق|(?:ي|ت)زيد\s+عن)\s*$/iu, "gt"],
  [/(?:<|less\s+than|below|fewer\s+than|under|اقل\s+من|اصغر\s+من|تحت|(?:ي|ت)قل\s+عن)\s*$/iu, "lt"],
];

const POSTFIX_OPERATORS: readonly [RegExp, ThresholdOperator][] = [
  [/^\s*(?:or\s+more|minimum)\b|^\s*(?:علي\s+الاقل|بحد\s+ادني)(?:\s|$)/iu, "gte"],
  [/^\s*(?:or\s+less|maximum)\b|^\s*(?:بحد\s+اقصي)(?:\s|$)/iu, "lte"],
];

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_ARABIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** Controlled parsing representation; caller-visible text is never rewritten. */
export function normalizeNumericText(text: string): string {
  return normalizeArabic(text.normalize("NFKC"))
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212\uFE58\uFE63\uFF0D]/gu, "-")
    .replace(/[٠-٩]/gu, (digit) => String(ARABIC_INDIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/gu, (digit) => String(EASTERN_ARABIC_DIGITS.indexOf(digit)))
    .replace(/٫/gu, ".")
    .replace(/٬/gu, ",");
}

function parseNumber(raw: string): number | null {
  if (/^[+-]?\d/iu.test(raw)) {
    const value = Number(raw.replaceAll(",", ""));
    return Number.isFinite(value) ? value : null;
  }
  const parts = raw.toLowerCase().split(/[-\s]+/u);
  const first = NUMBER_WORD_VALUES[parts[0] ?? ""];
  if (first === undefined) return null;
  const second = NUMBER_WORD_VALUES[parts[1] ?? ""];
  return second === undefined ? first : first + second;
}

function normalizeUnit(fullMatch: string, capturedUnit: string | undefined): string | null {
  const lower = fullMatch.toLowerCase();
  if (lower.includes("$") || /\busd\b/iu.test(lower) || /dollars?/iu.test(capturedUnit ?? "")) {
    return "currency:usd";
  }
  const unit = (capturedUnit ?? "").toLowerCase();
  if (/^days?$/u.test(unit)) return "duration:day";
  if (/^hours?$/u.test(unit)) return "duration:hour";
  if (/^minutes?$/u.test(unit)) return "duration:minute";
  if (/^(?:ايام|يوم(?:ا)?)$/u.test(unit)) return "duration:day";
  if (/^(?:ساعات?|ساعه)$/u.test(unit)) return "duration:hour";
  if (/^(?:دقائق?|دقيقه)$/u.test(unit)) return "duration:minute";
  if (/^degrees?$/u.test(unit) || /^(?:درجات?|درجه)$/u.test(unit)) return "temperature:degree";
  if (unit === "%" || /^percent(?:age)?$/u.test(unit)) return "percentage";
  if (unit === "بالمئه") return "percentage";
  if (/^دولار(?:ا)?$/u.test(unit)) return "currency:usd";
  return null;
}

function inferCountUnit(text: string, end: number): string | null {
  const words = boundedFollowingClause(text, end).toLowerCase().match(/[a-z]+/gu) ?? [];
  const noun = words.at(-1);
  if (!noun) return null;
  const singular = noun.endsWith("ies")
    ? `${noun.slice(0, -3)}y`
    : noun.endsWith("s") && !noun.endsWith("ss")
      ? noun.slice(0, -1)
      : noun;
  return `count:${singular}`;
}

/**
 * Text following a number, bounded to the same clause so a later, unrelated
 * clause cannot describe this quantity.
 */
function boundedFollowingClause(text: string, end: number): string {
  const suffix = text.slice(end, Math.min(text.length, end + 48));
  return suffix.split(CLAUSE_BOUNDARY)[0] ?? "";
}

const CLAUSE_BOUNDARY =
  /[,.;:!?؛؟]|\b(?:is|are|was|were|may|must|shall|requires?|needed|allowed)\b/iu;

/** Nouns that name a recurrence period, in normalized (see `normalizeArabic`) form. */
const RATE_PERIOD_NOUNS: Readonly<Record<string, string>> = {
  day: "day", days: "day",
  week: "week", weeks: "week",
  month: "month", months: "month",
  quarter: "quarter", quarters: "quarter",
  year: "year", years: "year", annum: "year",
  يوم: "day", ايام: "day",
  اسبوع: "week", اسابيع: "week",
  شهر: "month", شهور: "month", اشهر: "month",
  سنه: "year", سنوات: "year", عام: "year", اعوام: "year",
};

/** Single words that carry the period on their own ("2 days weekly"). */
const RATE_PERIOD_ADVERBS: Readonly<Record<string, string>> = {
  daily: "day", weekly: "week", monthly: "month", quarterly: "quarter",
  yearly: "year", annual: "year", annually: "year",
  يوميا: "day", اسبوعيا: "week", شهريا: "month", سنويا: "year",
};

const RATE_MARKER = /(?:\bper\b|\beach\b|\bevery\b|\/|في|كل)\s*(?:(?:a|an|one|1)\s+)?([\p{L}]+)/iu;

/**
 * Period a quantity recurs over, or `null` when it is stated absolutely.
 *
 * "2 days per week" and "90 days of continuous employment" share the unit
 * `duration:day` while measuring different things: a weekly allowance and an
 * absolute tenure. The recurrence period is therefore part of the quantity's
 * identity, and it is read only from the same clause as the number itself.
 * An unrecognized period noun ("USD 25 per receipt") reads as absolute, which
 * keeps this strictly a disambiguator between known periods.
 */
function ratePeriodFor(text: string, end: number): string | null {
  const phrase = boundedFollowingClause(text, end);
  const marker = RATE_MARKER.exec(phrase);
  if (marker) {
    const noun = (marker[1] ?? "").toLowerCase().replace(/^ال/u, "");
    const period = RATE_PERIOD_NOUNS[noun];
    if (period) return period;
  }
  for (const word of phrase.toLowerCase().match(/[\p{L}]+/gu) ?? []) {
    const period = RATE_PERIOD_ADVERBS[word];
    if (period) return period;
  }
  return null;
}

function overlapsStructuredNumber(text: string, start: number, end: number): boolean {
  const datePattern = /(?<![\p{L}\p{N}_])\d{4}-\d{1,2}-\d{1,2}(?![\p{L}\p{N}_])/gu;
  for (const match of text.matchAll(datePattern)) {
    const dateStart = match.index ?? -1;
    const dateEnd = dateStart + match[0].length;
    if (start < dateEnd && end > dateStart) return true;
  }
  return /[\p{L}\p{N}_]-$/u.test(text.slice(Math.max(0, start - 2), start)) ||
    /^-[\p{L}\p{N}_]/u.test(text.slice(end, end + 2));
}

function extractNormalizedNumericMentions(text: string): NumericMention[] {
  const mentions: NumericMention[] = [];
  for (const match of text.matchAll(NUMBER_PATTERN)) {
    const value = parseNumber(match[1] ?? "");
    if (value === null || match.index === undefined) continue;
    const end = match.index + match[0].length;
    if (overlapsStructuredNumber(text, match.index, end)) continue;
    const explicitUnit = normalizeUnit(match[0], match[2]);
    mentions.push({
      value,
      unit: explicitUnit ?? inferCountUnit(text, end),
      ratePeriod: ratePeriodFor(text, end),
      start: match.index,
      end,
    });
  }
  return mentions;
}

export function extractNumericMentions(text: string): NumericMention[] {
  return extractNormalizedNumericMentions(normalizeNumericText(text));
}

function operatorFor(text: string, mention: NumericMention): ThresholdOperator | null {
  const prefix = text.slice(Math.max(0, mention.start - 48), mention.start);
  for (const [pattern, operator] of PREFIX_OPERATORS) {
    if (pattern.test(prefix)) return operator;
  }
  const postfix = text.slice(mention.end, Math.min(text.length, mention.end + 24));
  for (const [pattern, operator] of POSTFIX_OPERATORS) {
    if (pattern.test(postfix)) return operator;
  }
  return null;
}

export function extractThresholdRules(text: string): ThresholdRule[] {
  const normalized = normalizeNumericText(text);
  return extractNormalizedNumericMentions(normalized).flatMap((mention) => {
    const operator = operatorFor(normalized, mention);
    return operator ? [{ ...mention, operator }] : [];
  });
}

function compatibleUnits(left: string | null, right: string | null): boolean {
  return left !== null && right !== null && left === right;
}

/**
 * A question value may be compared to a documented threshold only when both
 * measure the same METRIC: same unit AND the same recurrence period. Equal
 * units alone are not enough — "two days per week" and "90 days of continuous
 * employment" are both `duration:day`, and comparing them yields
 * `2 >= 90 -> false`, a nonsense row that reads downstream as a documented
 * eligibility failure. Absolute values compare only to absolute thresholds, and
 * rates only to rates over the same period.
 */
function comparableQuantities(question: NumericMention, rule: ThresholdRule): boolean {
  return compatibleUnits(question.unit, rule.unit) && question.ratePeriod === rule.ratePeriod;
}

function evaluate(value: number, operator: ThresholdOperator, threshold: number): boolean {
  if (operator === "gt") return value > threshold;
  if (operator === "gte") return value >= threshold;
  if (operator === "lt") return value < threshold;
  return value <= threshold;
}

export function deriveThresholdComparisons(
  questionText: string,
  evidenceText: string,
): ThresholdComparison[] {
  const questionMentions = extractNumericMentions(questionText);
  const rules = extractThresholdRules(evidenceText);
  const comparisons: ThresholdComparison[] = [];
  for (const question of questionMentions) {
    for (const rule of rules) {
      if (!comparableQuantities(question, rule)) continue;
      comparisons.push({
        questionValue: question.value,
        thresholdValue: rule.value,
        unit: rule.unit!,
        operator: rule.operator,
        satisfied: evaluate(question.value, rule.operator, rule.value),
      });
    }
  }
  return comparisons;
}

/** Same-sentence bounds form one rule and are evaluated conjunctively. */
export function deriveThresholdDecisions(
  questionText: string,
  evidenceText: string,
): ThresholdDecision[] {
  const sentences = evidenceText
    .split(/(?<=[.!?])\s+|(?:\r?\n)+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.flatMap((sentence) => {
    const conditions = deriveThresholdComparisons(questionText, sentence);
    return conditions.length > 0
      ? [{ conditions, satisfied: conditions.every((condition) => condition.satisfied) }]
      : [];
  });
}

function sameQuantity(left: NumericMention, right: NumericMention): boolean {
  if (left.value !== right.value) return false;
  if (left.unit?.startsWith("count:") && right.unit?.startsWith("count:")) return true;
  if (left.unit === null || right.unit === null) return true;
  return left.unit === right.unit;
}

function hasComparativeMeaning(text: string): boolean {
  const normalized = normalizeNumericText(text);
  return /(?:[<>]=?|≥|≤|greater\s+than|less\s+than|above|below|at\s+least|at\s+most|minimum|maximum|up\s+to|more\s+than|fewer\s+than|threshold|within|exceeds?|satisf(?:y|ies|ied)|meets?|eligible|appl(?:y|ies|ied)|الحد\s+الادني|الحد\s+الاقصي|علي\s+الاقل|بحد\s+ادني|بحد\s+اقصي|لا\s+يقل\s+عن|لا\s+يزيد\s+عن|(?:لم|لا)?\s*يستوف(?:ي)?|يلبي|مؤهل)/iu.test(normalized);
}

/**
 * Equality facts remain strict. A number absent from evidence is accepted only
 * when it came from the current question and authorized evidence contains an
 * explicit, unit-compatible inequality against which that value can be
 * compared. Semantic entailment still validates the resulting prose.
 *
 * This gate stays unit-only, not metric-scoped like `comparableQuantities`: it
 * decides whether a claimed number is DEFENSIBLE, so narrowing it would refuse
 * more answers rather than fewer. That is a separate behavior change from
 * bounding which comparisons are derived FOR the writer, and is out of scope
 * here.
 */
export function hasNumericConsistencyViolation(input: {
  readonly claimText: string;
  readonly evidenceText: string;
  readonly questionText?: string;
}): boolean {
  const claims = extractNumericMentions(input.claimText);
  if (claims.length === 0) return false;
  const evidence = extractNumericMentions(input.evidenceText);
  if (evidence.length === 0) return false;
  const question = extractNumericMentions(input.questionText ?? "");
  const rules = extractThresholdRules(input.evidenceText);

  return claims.some((claim) => {
    if (evidence.some((item) => sameQuantity(claim, item))) return false;
    const questionMatch = question.find((item) => sameQuantity(claim, item));
    if (!questionMatch) return true;
    const conflictingFixedFact = evidence.some((item) =>
      compatibleUnits(claim.unit, item.unit) &&
      item.value !== claim.value &&
      !rules.some((rule) => rule.start === item.start && rule.end === item.end),
    );
    if (conflictingFixedFact && !hasComparativeMeaning(input.claimText)) return true;
    return !rules.some((rule) => compatibleUnits(questionMatch.unit, rule.unit));
  });
}

export function formatThresholdComparisons(
  questionText: string,
  evidence: readonly { chunkId: string; text: string }[],
): string | null {
  const rows = evidence.flatMap((item) =>
    deriveThresholdDecisions(questionText, item.text).map((decision) => ({
      chunkId: item.chunkId,
      ...decision,
    })),
  );
  if (rows.length === 0) return null;
  return JSON.stringify(rows.slice(0, 20));
}
