import type { IntentClassValue } from "./intentQuery.types.js";
import { preprocessIntentText } from "./intentQuery.preprocessor.js";
import { detectSocialMessage } from "./intentQuery.socialDetector.js";

const RETRIEVABLE_INTENTS = new Set<IntentClassValue>([
  "knowledge_question",
  "follow_up",
  "document_specific",
  "comparison",
  "summarization",
  "navigation",
  "administrative_action",
]);

const KNOWLEDGE_TERMS = new Set([
  "policy", "policies", "document", "documents", "file", "handbook", "guide",
  "procedure", "process", "rule", "rules", "leave", "vacation", "salary",
  "benefit", "benefits", "insurance", "probation", "employee", "employees",
  "contract", "article", "section", "code", "working", "hours", "hr",
  "سياسه", "سياسات", "وثيقه", "وثائق", "مستند", "مستندات", "ملف", "دليل",
  "اجازه", "الاجازه", "اجازات", "الاجازات", "راتب", "رواتب", "تامين", "موظف", "موظفين", "عقد",
  "ماده", "بند", "لائحه", "لوائح", "دوام", "ساعات", "ترقيه", "تعويض",
]);

const QUESTION_TERMS = new Set([
  "what", "where", "when", "which", "who", "why", "how", "can", "could", "does", "do", "is", "are",
  "ما", "ماذا", "متي", "متى", "اين", "كيف", "كم", "هل", "مين", "ليه", "ممكن", "كام",
]);

const REQUEST_TERMS = new Set([
  "show", "find", "explain", "summarize", "compare", "list", "locate", "upload", "delete",
  "اعرض", "اجد", "اشرح", "لخص", "قارن", "اذكر", "قولي", "اريد", "عايز", "احذف", "ارفع",
]);

const CONTEXTUAL_ACKNOWLEDGEMENTS = new Set([
  "ايوه", "ايوا", "نعم", "لا", "تمام", "ماشي", "yes", "no", "ok", "okay", "sure",
]);

const OVERLAP_STOP_WORDS = new Set([
  ...QUESTION_TERMS,
  "the", "a", "an", "our", "my", "please", "me", "about", "of", "for", "to", "in",
  "هي", "هو", "عن", "في", "من", "على", "لي", "لنا", "يا", "لو", "فضلك",
  "شكرا", "شكر", "تسلم", "thanks", "thank", "hello", "مرحبا", "السلام", "عليكم",
]);

export interface KnowledgeSignalAssessment {
  readonly positive: boolean;
  readonly retrievalText: string;
  readonly socialPrefixRemoved: boolean;
  readonly reasons: readonly string[];
}

export function isRetrievableIntent(intent: unknown): intent is IntentClassValue {
  return typeof intent === "string" && RETRIEVABLE_INTENTS.has(intent as IntentClassValue);
}

/** Remove only a leading segment that independently classifies as social. */
export function stripLeadingSocialExpression(raw: string): {
  text: string;
  removed: boolean;
} {
  const trimmed = raw.trim();
  const delimiter = /[،,;؛.!؟?]+/gu;
  for (const match of trimmed.matchAll(delimiter)) {
    const index = match.index ?? -1;
    if (index <= 0) continue;
    const prefix = trimmed.slice(0, index);
    const remainder = trimmed.slice(index + match[0].length).trim();
    if (remainder && detectSocialMessage(prefix).isSocial) {
      return { text: remainder, removed: true };
    }
    break;
  }

  const tokenMatches = [...trimmed.matchAll(/\S+/gu)];
  let best: string | null = null;
  for (let count = 1; count <= Math.min(6, tokenMatches.length - 1); count += 1) {
    const next = tokenMatches[count];
    if (!next) break;
    const prefix = trimmed.slice(0, next.index).trim();
    if (detectSocialMessage(prefix).isSocial) {
      best = trimmed.slice(next.index).trim();
    }
  }
  return best ? { text: best, removed: true } : { text: trimmed, removed: false };
}

export function assessPositiveKnowledgeSeeking(raw: string): KnowledgeSignalAssessment {
  const stripped = stripLeadingSocialExpression(raw);
  const prepared = preprocessIntentText(stripped.text);
  const tokens = prepared.normalizedTokens;
  const hasKnowledgeTerm = tokens.some((token) => KNOWLEDGE_TERMS.has(token));
  const hasQuestionShape = tokens.some((token) => QUESTION_TERMS.has(token));
  const hasRequestShape = tokens.some((token) => REQUEST_TERMS.has(token));
  const hasDocumentReference = /(?:\.[a-z0-9]{2,8}\b|\bdoc[-_]?\w+\b)/iu.test(stripped.text);
  const hasQuestionMark = /[?؟]/u.test(stripped.text);
  const substantiveTokens = tokens.filter(
    (token) => !QUESTION_TERMS.has(token) && !OVERLAP_STOP_WORDS.has(token),
  );

  const reasons: string[] = [];
  if (hasKnowledgeTerm) reasons.push("DOMAIN_TERM");
  if (hasDocumentReference) reasons.push("DOCUMENT_REFERENCE");
  if (hasQuestionShape || hasQuestionMark) reasons.push("QUESTION_SHAPE");
  if (hasRequestShape) reasons.push("REQUEST_SHAPE");

  const positive =
    substantiveTokens.length > 0 &&
    (hasKnowledgeTerm || hasDocumentReference) &&
    (hasQuestionShape || hasQuestionMark || hasRequestShape);

  return {
    positive,
    retrievalText: stripped.text,
    socialPrefixRemoved: stripped.removed,
    reasons,
  };
}

export function isLikelyGibberish(raw: string): boolean {
  const prepared = preprocessIntentText(raw);
  if (prepared.normalizedTokens.length === 0) return true;
  if (assessPositiveKnowledgeSeeking(raw).positive || detectSocialMessage(raw).isSocial) return false;
  if (prepared.normalizedTokens.length > 2 || /[?؟]/u.test(raw)) return false;
  return prepared.normalizedTokens.every((token) => {
    if (QUESTION_TERMS.has(token) || REQUEST_TERMS.has(token) || KNOWLEDGE_TERMS.has(token)) return false;
    if (/^[a-z]+$/u.test(token)) {
      return /^(.{2,4})\1+$/u.test(token) ||
        /^[^aeiou]{5,}$/u.test(token) ||
        /(?:qwerty|asdf|zxcv)/u.test(token);
    }
    // Avoid guessing that an unfamiliar Arabic word is malformed. Provider
    // failure still fails closed because it lacks positive knowledge signals.
    return false;
  });
}

function protectedAnchors(text: string): string[] {
  const matches = text.match(
    /(?:[\p{L}\p{N}_-]+\.[a-z0-9]{2,8}\b|\b[\p{L}_-]*\d[\p{L}\p{N}_./:-]*\b|["“”«»][^"“”«»]+["“”«»])/giu,
  );
  return matches ?? [];
}

function comparable(value: string): string {
  return preprocessIntentText(value).elongationReducedText;
}

function tokensAreClose(left: string, right: string): boolean {
  if (left === right) return true;
  if (left.length < 5 || right.length < 5 || Math.abs(left.length - right.length) > 1) return false;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current.push(Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (left[i - 1] === right[j - 1] ? 0 : 1),
      ));
    }
    previous = current;
  }
  return previous[right.length]! <= 1;
}

/**
 * Accept a provider's corrected standalone question only when it remains close
 * to the current turn and preserves every exact/critical anchor. Otherwise use
 * the original knowledge remainder (with only a verified social prefix removed).
 */
export function selectSafeRetrievalQuestion(
  original: string,
  proposed: unknown,
  protectedValues: readonly string[] = [],
): string {
  const stripped = stripLeadingSocialExpression(original);
  const base = stripped.text || original.trim();
  if (typeof proposed !== "string") return base;
  const candidate = proposed.trim();
  if (!candidate || candidate.length > 2000 || candidate.length > base.length * 2 + 80) return base;
  if (stripped.removed && comparable(candidate) === comparable(original.trim())) return base;

  const candidateComparable = comparable(candidate);
  for (const anchor of [...protectedAnchors(base), ...protectedValues]) {
    if (!anchor.trim()) continue;
    if (!candidateComparable.includes(comparable(anchor))) return base;
  }

  const sourceTokens = new Set(
    preprocessIntentText(base).normalizedTokens.filter(
      (token) => token.length > 2 && !OVERLAP_STOP_WORDS.has(token),
    ),
  );
  const candidateTokens = new Set(
    preprocessIntentText(candidate).normalizedTokens.filter(
      (token) => token.length > 2 && !OVERLAP_STOP_WORDS.has(token),
    ),
  );
  const overlap = [...sourceTokens].filter((token) =>
    [...candidateTokens].some((candidateToken) => tokensAreClose(token, candidateToken)),
  ).length;
  const required = Math.max(1, Math.ceil(sourceTokens.size * 0.4));
  if (sourceTokens.size > 0 && overlap < required) return base;
  const novelCandidateTokens = [...candidateTokens].filter(
    (candidateToken) =>
      ![...sourceTokens].some((sourceToken) =>
        tokensAreClose(sourceToken, candidateToken),
      ),
  );
  const allowedNovelTokens = Math.max(2, Math.ceil(sourceTokens.size * 0.3));
  if (sourceTokens.size > 0 && novelCandidateTokens.length > allowedNovelTokens) {
    return base;
  }
  return candidate;
}

export function isContextualAcknowledgement(raw: string): boolean {
  return CONTEXTUAL_ACKNOWLEDGEMENTS.has(
    preprocessIntentText(raw).elongationReducedText,
  );
}

export function assistantRequestsUserResponse(content: string): boolean {
  const normalized = preprocessIntentText(content).normalizedText;
  return /[?؟]\s*$/u.test(content.trim()) ||
    /\b(?:clarify|confirm|choose|which|restate)\b/u.test(normalized) ||
    /(?:وضح|توضيح|تاكيد|تؤكد|اختر|اي وثيقه|هل تقصد)/u.test(normalized);
}
