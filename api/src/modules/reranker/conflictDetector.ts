/**
 * Bounded deterministic conflict detection for authorized retrieval evidence.
 * A conflict requires incompatible assertions about the same subject/metric;
 * numeric difference, document identity, or version identity alone is never
 * sufficient.
 */

import type { ConflictGroup } from "./reranker.types.js";

export const MAX_CONFLICT_ITEMS = 50;
export const MAX_CONFLICT_TEXT_CHARS = 4_000;
export const MAX_ASSERTIONS_PER_ITEM = 12;

export interface ConflictDetectorConfig {
  /** Minimum topic-token overlap when no known metric can be extracted. */
  topicSimilarityThreshold: number;
  /** Negation terms in English and Arabic. */
  negationTerms: string[];
  /** Retained for adapter/config compatibility; numeric parsing is structured below. */
  valuePatterns: RegExp[];
}

export const DEFAULT_CONFLICT_DETECTOR_CONFIG: ConflictDetectorConfig = {
  topicSimilarityThreshold: 0.3,
  negationTerms: [
    "not", "no", "never", "cannot", "must not", "shall not",
    "does not", "do not", "is not", "are not", "was not",
    "لا", "غير", "يجب عدم", "لن", "لم", "ليس",
  ],
  valuePatterns: [
    /\d[\d,]*\.?\d*\s*(SAR|USD|EUR|GBP|RY|rial)/gi,
    /\d[\d,]*\.?\d*\s*(percent|%)/gi,
  ],
};

export interface ConflictDetectorInput {
  text: string;
  documentId: string;
  documentVersionId: string;
  tenantId?: string;
  sectionTitle?: string;
  [key: string]: unknown;
}

type ComparisonOperator = "eq" | "gt" | "gte" | "lt" | "lte";

interface NumericAssertion {
  value: number;
  operator: ComparisonOperator;
  metric: string | null;
  priority: string | null;
  baseUnit: string | null;
  cadence: string | null;
  topicTokens: string[];
}

interface ConflictResult {
  isConflict: boolean;
  description: string;
  confidence: number;
}

const NUMBER_WITH_UNIT = /(?:(USD|SAR|EUR|GBP|\$|€|£)\s*)?(\d[\d,]*(?:\.\d+)?)(?:\s*(USD|SAR|EUR|GBP|dollars?|riyals?|percent|%|minutes?|mins?|hours?|hrs?|business\s+days?|working\s+days?|calendar\s+days?|days?|weeks?|months?|years?|x))?/giu;

const METRIC_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["manager_approval", /\bmanager(?:'s)?\s+approval\b|\bapproval\s+from\s+(?:the\s+)?manager\b/iu],
  ["department_head_approval", /\bdepartment[-\s]+head\s+approval\b|\bapproval\s+from\s+(?:the\s+)?department[-\s]+head\b/iu],
  ["response_time", /\b(?:initial\s+)?response(?:\s+time|\s+target)?\b/iu],
  ["restoration_time", /\brestor(?:e|ation)(?:\s+time|\s+target)?\b|\brecovery\s+time\b/iu],
  ["hotel_limit", /\bhotel\b|\baccommodation\b|\blodging\b/iu],
  ["meal_limit", /\bmeals?\b|\bfood\s+allowance\b/iu],
  ["receipt_threshold", /\breceipts?\b/iu],
  ["employment_eligibility", /\beligib(?:le|ility)\b|\bcontinuous\s+employment\b|\bemployment\s+(?:duration|period)\b/iu],
  ["quotation_threshold", /\bquotations?\b|\bvendor\s+quotes?\b|\bthree\s+quotes?\b/iu],
  ["remote_work", /\bremote\s+work\b|\bwork(?:ing)?\s+remotely\b/iu],
  ["annual_leave", /\bannual\s+leave\b/iu],
  ["salary", /\bsalary\b|\bbase\s+pay\b/iu],
  ["purchase_approval", /\bpurchase\b.*\bapproval\b|\bapproval\b.*\bpurchase\b/iu],
];

const TOPIC_STOP_WORDS = new Set([
  "a", "an", "and", "are", "at", "be", "by", "can", "do", "does", "for", "from",
  "how", "i", "in", "is", "it", "many", "much", "of", "on", "or", "per", "policy",
  "rule", "says", "the", "this", "to", "what", "when", "which", "with", "allowed",
  "required", "requires", "maximum", "minimum", "limit", "threshold", "than", "up", "above",
  "below", "least", "most", "more", "less", "greater", "fewer", "not", "no",
]);

/** Exact/normalized-identical evidence is consistent and safe to deduplicate. */
export function normalizeEvidenceAssertionText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

export function areEquivalentEvidenceAssertions(textA: string, textB: string): boolean {
  const normalizedA = normalizeEvidenceAssertionText(textA);
  return normalizedA.length > 0 && normalizedA === normalizeEvidenceAssertionText(textB);
}

/**
 * At most 50 authorized candidates are compared (1,225 item pairs). Each item
 * contributes at most 12 numeric assertions from its first 4,000 characters.
 */
export function detectConflicts<T extends ConflictDetectorInput>(
  items: T[],
  config: ConflictDetectorConfig = DEFAULT_CONFLICT_DETECTOR_CONFIG,
  questionText = "",
): ConflictGroup[] {
  const boundedItems = items.slice(0, MAX_CONFLICT_ITEMS);
  const conflicts: ConflictGroup[] = [];
  let conflictCounter = 0;

  for (let i = 0; i < boundedItems.length; i++) {
    for (let j = i + 1; j < boundedItems.length; j++) {
      const itemA = boundedItems[i]!;
      const itemB = boundedItems[j]!;

      // Defense in depth. Normal production composition already tenant-scopes
      // and reauthorizes every item before this detector runs.
      if (itemA.tenantId && itemB.tenantId && itemA.tenantId !== itemB.tenantId) continue;

      const result = checkConflict(itemA, itemB, config, questionText);
      if (!result.isConflict) continue;
      conflictCounter += 1;
      conflicts.push({
        conflictId: `conflict-${conflictCounter}`,
        description: result.description,
        itemIndices: [i, j],
      });
    }
  }

  return mergeConflictGroups(conflicts);
}

function checkConflict<T extends ConflictDetectorInput>(
  itemA: T,
  itemB: T,
  config: ConflictDetectorConfig,
  questionText: string,
): ConflictResult {
  const textA = itemA.text.slice(0, MAX_CONFLICT_TEXT_CHARS);
  const textB = itemB.text.slice(0, MAX_CONFLICT_TEXT_CHARS);

  if (areEquivalentEvidenceAssertions(textA, textB)) {
    return noConflict();
  }

  const negationResult = checkNegationConflict(textA, textB, config, questionText);
  if (negationResult.isConflict) return negationResult;

  const valueResult = checkValueConflict(textA, textB, config, questionText);
  if (valueResult.isConflict) return valueResult;

  // Version ids are provenance only. Differing ids do not establish either a
  // conflict or precedence; actual aligned assertions must disagree.
  return noConflict();
}

function checkNegationConflict(
  textA: string,
  textB: string,
  config: ConflictDetectorConfig,
  questionText: string,
): ConflictResult {
  const termsA = tokenize(textA);
  const termsB = tokenize(textB);
  if (matchesNegation(termsA, textA, config.negationTerms) ===
      matchesNegation(termsB, textB, config.negationTerms)) {
    return noConflict();
  }
  if (!textTopicsAlign(textA, textB, questionText, config.topicSimilarityThreshold)) {
    return noConflict();
  }
  const metric = identifyMetric(textA) ?? identifyMetric(textB) ?? "aligned topic";
  return {
    isConflict: true,
    description: `Unresolved opposing assertions for subject/metric: ${metric}`,
    confidence: 0.8,
  };
}

function checkValueConflict(
  textA: string,
  textB: string,
  config: ConflictDetectorConfig,
  questionText: string,
): ConflictResult {
  const assertionsA = extractNumericAssertions(textA);
  const assertionsB = extractNumericAssertions(textB);
  for (const assertionA of assertionsA) {
    for (const assertionB of assertionsB) {
      if (!assertionsAlign(assertionA, assertionB, config.topicSimilarityThreshold)) continue;
      if (!assertionRelevantToQuestion(assertionA, questionText)) continue;
      if (!assertionRelevantToQuestion(assertionB, questionText)) continue;
      if (assertionA.operator !== assertionB.operator) continue;
      if (numbersEquivalent(assertionA.value, assertionB.value)) continue;

      const metric = assertionA.metric ?? assertionB.metric ?? "aligned numeric rule";
      return {
        isConflict: true,
        description: `Unresolved incompatible values for subject/metric: ${metric}`,
        confidence: 0.9,
      };
    }
  }
  return noConflict();
}

function extractNumericAssertions(text: string): NumericAssertion[] {
  const assertions: NumericAssertion[] = [];
  const clauses = text
    .split(/(?:\r?\n)+|(?<=[.!?؟؛;])\s+/u)
    .map((clause) => clause.trim())
    .filter(Boolean);

  for (const clause of clauses) {
    NUMBER_WITH_UNIT.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = NUMBER_WITH_UNIT.exec(clause)) !== null) {
      const value = Number((match[2] ?? "").replace(/,/gu, ""));
      if (!Number.isFinite(value)) continue;
      const operatorContext = clause.slice(Math.max(0, match.index - 48), match.index);
      const suffixContext = clause.slice(NUMBER_WITH_UNIT.lastIndex, NUMBER_WITH_UNIT.lastIndex + 32);
      assertions.push({
        value,
        operator: identifyOperator(operatorContext),
        metric: identifyMetric(clause),
        priority: identifyPriority(clause),
        baseUnit: normalizeUnit(match[1] ?? match[3] ?? null),
        cadence: identifyCadence(`${match[0]} ${suffixContext}`),
        topicTokens: topicTokens(clause),
      });
      if (assertions.length >= MAX_ASSERTIONS_PER_ITEM) return assertions;
    }
  }
  return assertions;
}

function assertionsAlign(
  assertionA: NumericAssertion,
  assertionB: NumericAssertion,
  topicThreshold: number,
): boolean {
  if (assertionA.metric && assertionB.metric && assertionA.metric !== assertionB.metric) return false;
  if (assertionA.priority && assertionB.priority && assertionA.priority !== assertionB.priority) return false;
  if (assertionA.baseUnit && assertionB.baseUnit && assertionA.baseUnit !== assertionB.baseUnit) return false;
  if (assertionA.cadence && assertionB.cadence && assertionA.cadence !== assertionB.cadence) return false;
  if (assertionA.metric && assertionB.metric) return true;
  return jaccardSimilarity(assertionA.topicTokens, assertionB.topicTokens) >= topicThreshold;
}

function assertionRelevantToQuestion(assertion: NumericAssertion, questionText: string): boolean {
  const questionTokens = topicTokens(questionText);
  if (questionTokens.length === 0) return true;
  const questionMetric = identifyMetric(questionText);
  if (questionMetric && assertion.metric) return questionMetric === assertion.metric;
  const questionPriority = identifyPriority(questionText);
  if (questionPriority && assertion.priority) return questionPriority === assertion.priority;
  return questionTokens.some((token) => assertion.topicTokens.includes(token));
}

function textTopicsAlign(
  textA: string,
  textB: string,
  questionText: string,
  topicThreshold: number,
): boolean {
  const metricA = identifyMetric(textA);
  const metricB = identifyMetric(textB);
  if (metricA && metricB && metricA !== metricB) return false;
  const priorityA = identifyPriority(textA);
  const priorityB = identifyPriority(textB);
  if (priorityA && priorityB && priorityA !== priorityB) return false;
  const questionMetric = identifyMetric(questionText);
  if (questionMetric && metricA && questionMetric !== metricA) return false;
  if (questionMetric && metricB && questionMetric !== metricB) return false;
  const questionTokens = topicTokens(questionText);
  if (
    !questionMetric &&
    questionTokens.length > 0 &&
    (!questionTokens.some((token) => topicTokens(textA).includes(token)) ||
      !questionTokens.some((token) => topicTokens(textB).includes(token)))
  ) {
    return false;
  }
  return metricA !== null && metricB !== null ||
    jaccardSimilarity(topicTokens(textA), topicTokens(textB)) >= topicThreshold;
}

function identifyMetric(text: string): string | null {
  for (const [metric, pattern] of METRIC_PATTERNS) {
    if (pattern.test(text)) return metric;
  }
  return null;
}

function identifyPriority(text: string): string | null {
  return /\bP\s*([1-9])\b/iu.exec(text)?.[1]?.toLowerCase() ?? null;
}

function identifyOperator(context: string): ComparisonOperator {
  const normalized = context.toLowerCase();
  const tail = "(?:\\s+(?:is|of))?\\s*[:=]?\\s*(?:[A-Z]{3}|[$€£])?\\s*$";
  if (new RegExp(`(?:>=|at\\s+least|minimum|not\\s+less\\s+than)${tail}`, "iu").test(normalized)) return "gte";
  if (new RegExp(`(?:<=|at\\s+most|up\\s+to|maximum|not\\s+more\\s+than)${tail}`, "iu").test(normalized)) return "lte";
  if (new RegExp(`(?:>|above|more\\s+than|greater\\s+than|over)${tail}`, "iu").test(normalized)) return "gt";
  if (new RegExp(`(?:<|below|less\\s+than|fewer\\s+than|under)${tail}`, "iu").test(normalized)) return "lt";
  return "eq";
}

function normalizeUnit(unit: string | null): string | null {
  if (!unit) return null;
  const normalized = unit.toLowerCase().replace(/\s+/gu, " ");
  if (normalized === "$" || normalized === "dollar" || normalized === "dollars") return "usd";
  if (normalized === "€") return "eur";
  if (normalized === "£") return "gbp";
  if (["minute", "minutes", "min", "mins"].includes(normalized)) return "minute";
  if (["hour", "hours", "hr", "hrs"].includes(normalized)) return "hour";
  if (["day", "days"].includes(normalized)) return "day";
  if (normalized === "business day" || normalized === "business days") return "business_day";
  if (normalized === "working day" || normalized === "working days") return "working_day";
  if (normalized === "calendar day" || normalized === "calendar days") return "calendar_day";
  if (["week", "weeks"].includes(normalized)) return "week";
  if (["month", "months"].includes(normalized)) return "month";
  if (["year", "years"].includes(normalized)) return "year";
  if (normalized === "percent") return "%";
  return normalized;
}

function identifyCadence(text: string): string | null {
  const match = /\b(?:per|each|a)\s+(night|day|week|month|year)\b/iu.exec(text);
  return match?.[1]?.toLowerCase() ?? null;
}

function topicTokens(text: string): string[] {
  return tokenize(text).filter((token) =>
    !TOPIC_STOP_WORDS.has(token) &&
    !/^\d+(?:\.\d+)?$/u.test(token) &&
    !["usd", "sar", "eur", "gbp", "minutes", "minute", "hours", "hour", "days", "day", "weeks", "week", "months", "month", "years", "year"].includes(token),
  );
}

function tokenize(text: string): string[] {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/u)
    .filter((token) => token.length > 1);
}

function matchesNegation(terms: string[], rawText: string, negationTerms: string[]): boolean {
  const termSet = new Set(terms);
  const normalizedRaw = rawText.toLowerCase();
  return negationTerms.some((negation) => {
    const words = negation.split(/\s+/u);
    return words.length === 1
      ? termSet.has(words[0]!)
      : normalizedRaw.includes(negation.toLowerCase());
  });
}

function numbersEquivalent(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(1, Math.abs(a), Math.abs(b)) * 0.000001;
}

function noConflict(): ConflictResult {
  return { isConflict: false, description: "", confidence: 0 };
}

function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function mergeConflictGroups(groups: ConflictGroup[]): ConflictGroup[] {
  if (groups.length === 0) return [];
  const parent = new Map<number, number>();
  for (const group of groups) {
    for (const index of group.itemIndices) {
      if (!parent.has(index)) parent.set(index, index);
    }
  }
  const find = (value: number): number => {
    if (parent.get(value) !== value) parent.set(value, find(parent.get(value)!));
    return parent.get(value)!;
  };
  const union = (a: number, b: number): void => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  };
  for (const group of groups) {
    for (let index = 1; index < group.itemIndices.length; index++) {
      union(group.itemIndices[0]!, group.itemIndices[index]!);
    }
  }

  const grouped = new Map<number, number[]>();
  for (const index of parent.keys()) {
    const root = find(index);
    grouped.set(root, [...(grouped.get(root) ?? []), index]);
  }
  return [...grouped.values()]
    .filter((indices) => indices.length >= 2)
    .map((indices, index) => {
      const indexSet = new Set(indices);
      const reasons = [...new Set(groups
        .filter((group) => group.itemIndices.every((itemIndex) => indexSet.has(itemIndex)))
        .map((group) => group.description))];
      return {
        conflictId: `conflict-${index + 1}`,
        description:
          `Unresolved conflict group containing ${indices.length} aligned evidence items` +
          (reasons.length > 0 ? `: ${reasons.join("; ")}` : ""),
        itemIndices: indices.sort((a, b) => a - b),
      };
    });
}
