import { assessPositiveKnowledgeSeeking } from "./intentQuery.knowledgeSignals.js";
import { preprocessIntentText } from "./intentQuery.preprocessor.js";
import type { AssistantIntentKindValue } from "./intentQuery.types.js";

export interface AssistantIntentDetection {
  readonly kind: AssistantIntentKindValue | null;
  readonly isAssistantOnly: boolean;
  readonly knowledgeRemainder: string | null;
}

const TOKEN_ALIASES = new Map<string, string>([
  ["u", "you"],
  ["r", "are"],
  ["انتا", "انت"],
  ["انتي", "انت"],
  ["ميين", "مين"],
  ["مينن", "مين"],
  ["قدراتكك", "قدراتك"],
]);

const IGNORED_TOKENS = new Set([
  "يا", "documind", "ai", "exactly", "please", "لو", "سمحت", "من", "فضلك",
  "طب", "طيب", "and", "then", "و", "بعدها", "وبعدها", "بعدين", "وبعدين",
  "هل", "حضرتك",
]);

function canonicalTokens(raw: string): string[] {
  return preprocessIntentText(raw).normalizedTokens.map((token) => TOKEN_ALIASES.get(token) ?? token);
}

function hasSequence(tokens: readonly string[], sequence: readonly string[]): boolean {
  return sequence.every((token, index) => tokens[index] === token);
}

function classifyAssistantExpression(raw: string): AssistantIntentKindValue | null {
  const tokens = canonicalTokens(raw);
  if (tokens.length === 0 || tokens.length > 12) return null;
  const meaningful = tokens.filter((token) => !IGNORED_TOKENS.has(token));
  const joined = meaningful.join(" ");

  const identity =
    /^(?:who are you|what are you|tell me about yourself)$/u.test(joined) ||
    /^(?:انت مين|مين انت|مين|انت ايه|عرف نفسك)$/u.test(joined) ||
    (tokens.includes("من") && tokens.includes("انت")) ||
    (tokens.includes("documind") &&
      (tokens.includes("انت") ||
        hasSequence(meaningful, ["are", "you"]) ||
        hasSequence(meaningful, ["what", "is"])));
  if (identity) return "identity";

  const capabilities =
    /^(?:what can you do|what can you help me with|what can you help with|what are your capabilities|what is your role)$/u.test(joined) ||
    meaningful.some((token) => ["قدراتك", "وظيفتك", "دورك"].includes(token)) ||
    (meaningful.includes("بتعمل") && meaningful.some((token) => ["ايه", "اي"].includes(token))) ||
    (meaningful.some((token) => ["تعرف", "بتعرف"].includes(token)) && meaningful.includes("تعمل")) ||
    (meaningful.some((token) => ["تقدر", "ممكن"].includes(token)) &&
      meaningful.some((token) => ["تساعدني", "تساعد"].includes(token)));
  return capabilities ? "capabilities" : null;
}

function trimLeadingConnector(raw: string): string {
  let value = raw.trim().replace(/^[،,;؛.!?؟]+/u, "").trim();
  value = value
    .replace(/^(?:and|then)\b/iu, "")
    .replace(/^(?:و?بعدها|و?بعدين)\b/u, "")
    .trim();
  // Arabic conjunctions commonly attach to the first substantive token
  // ("وكام", "ولخص"). Only remove it for the mixed-intent remainder probe.
  return value.replace(/^و(?=[\p{Script=Arabic}])/u, "").trim();
}

function findKnowledgeRemainder(raw: string): { kind: AssistantIntentKindValue; text: string } | null {
  const tokenMatches = [...raw.matchAll(/\S+/gu)];
  for (let index = tokenMatches.length - 1; index >= 1; index -= 1) {
    const boundary = tokenMatches[index]?.index;
    if (boundary == null) continue;
    const prefix = raw.slice(0, boundary).trim();
    const kind = classifyAssistantExpression(prefix);
    if (!kind) continue;
    const remainder = trimLeadingConnector(raw.slice(boundary));
    if (remainder && assessPositiveKnowledgeSeeking(remainder).positive) {
      return { kind, text: remainder };
    }
  }
  return null;
}

/**
 * Conservative deterministic detector for product-owned self-description.
 * Only a whole assistant expression receives the no-retrieval route. If the
 * turn also contains a positive document-knowledge request, that request is
 * preserved as a standalone RAG remainder.
 */
export function detectAssistantIntent(raw: string): AssistantIntentDetection {
  const wholeKind = classifyAssistantExpression(raw);
  if (wholeKind) {
    return { kind: wholeKind, isAssistantOnly: true, knowledgeRemainder: null };
  }

  const mixed = findKnowledgeRemainder(raw);
  if (mixed) {
    return { kind: mixed.kind, isAssistantOnly: false, knowledgeRemainder: mixed.text };
  }

  return {
    kind: null,
    isAssistantOnly: false,
    knowledgeRemainder: null,
  };
}
