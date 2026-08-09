export type ThresholdOperator = "gt" | "gte" | "lt" | "lte";

export interface NumericMention {
  readonly value: number;
  readonly unit: string | null;
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

const NUMBER_TOKEN = String.raw`(?:\d[\d,]*(?:\.\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|thirty(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|forty(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|fifty(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|sixty(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|seventy(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|eighty(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|ninety(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?)`;

const NUMBER_PATTERN = new RegExp(
  String.raw`(?<![\p{L}\p{N}_])(?:USD\s*|\$\s*)?(${NUMBER_TOKEN})(?:\s*(?:-\s*)?(%|percent(?:age)?|USD|dollars?|days?|hours?|minutes?))?(?![\p{L}\p{N}_])`,
  "giu",
);

const PREFIX_OPERATORS: readonly [RegExp, ThresholdOperator][] = [
  [/(?:>=|≥|at\s+least|minimum(?:\s+of)?(?:\s+[\p{L}-]+){0,4}\s*(?:is|=|:)?|no\s+less\s+than)\s*$/iu, "gte"],
  [/(?:<=|≤|at\s+most|maximum(?:\s+of)?(?:\s+[\p{L}-]+){0,4}\s*(?:is|=|:)?|up\s+to|no\s+more\s+than)\s*$/iu, "lte"],
  [/(?:>|greater\s+than|above|more\s+than|over)\s*$/iu, "gt"],
  [/(?:<|less\s+than|below|fewer\s+than|under)\s*$/iu, "lt"],
];

const POSTFIX_OPERATORS: readonly [RegExp, ThresholdOperator][] = [
  [/^\s*(?:or\s+more|minimum)\b/iu, "gte"],
  [/^\s*(?:or\s+less|maximum)\b/iu, "lte"],
];

function parseNumber(raw: string): number | null {
  if (/^\d/iu.test(raw)) {
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
  if (unit === "%" || /^percent(?:age)?$/u.test(unit)) return "percentage";
  return null;
}

function inferCountUnit(text: string, end: number): string | null {
  const suffix = text.slice(end, Math.min(text.length, end + 48));
  const phrase = suffix.split(/[,.;:!?]|\b(?:is|are|was|were|may|must|shall|requires?|needed|allowed)\b/iu)[0] ?? "";
  const words = phrase.toLowerCase().match(/[a-z]+/gu) ?? [];
  const noun = words.at(-1);
  if (!noun) return null;
  const singular = noun.endsWith("ies")
    ? `${noun.slice(0, -3)}y`
    : noun.endsWith("s") && !noun.endsWith("ss")
      ? noun.slice(0, -1)
      : noun;
  return `count:${singular}`;
}

export function extractNumericMentions(text: string): NumericMention[] {
  const mentions: NumericMention[] = [];
  for (const match of text.matchAll(NUMBER_PATTERN)) {
    const value = parseNumber(match[1] ?? "");
    if (value === null || match.index === undefined) continue;
    const end = match.index + match[0].length;
    const explicitUnit = normalizeUnit(match[0], match[2]);
    mentions.push({
      value,
      unit: explicitUnit ?? inferCountUnit(text, end),
      start: match.index,
      end,
    });
  }
  return mentions;
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
  return extractNumericMentions(text).flatMap((mention) => {
    const operator = operatorFor(text, mention);
    return operator ? [{ ...mention, operator }] : [];
  });
}

function compatibleUnits(left: string | null, right: string | null): boolean {
  return left !== null && right !== null && left === right;
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
      if (!compatibleUnits(question.unit, rule.unit)) continue;
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
  return /(?:[<>]=?|≥|≤|greater\s+than|less\s+than|above|below|at\s+least|at\s+most|minimum|maximum|up\s+to|more\s+than|fewer\s+than|threshold|within|exceeds?|satisf(?:y|ies|ied)|meets?|eligible|appl(?:y|ies|ied))/iu.test(text);
}

/**
 * Equality facts remain strict. A number absent from evidence is accepted only
 * when it came from the current question and authorized evidence contains an
 * explicit, unit-compatible inequality against which that value can be
 * compared. Semantic entailment still validates the resulting prose.
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
