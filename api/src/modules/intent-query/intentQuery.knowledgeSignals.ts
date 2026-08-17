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
  "limit", "limits", "allowance", "allowances", "eligibility", "requirement",
  "requirements", "approval", "approvals", "deadline", "deadlines",
  "reimbursement", "receipt", "receipts", "expense", "expenses", "travel",
  "purchase", "purchases", "quotation", "quotations", "quote", "quotes", "remote",
  "account", "lock", "locked", "login", "logins", "failed", "attempts", "security",
  "سياسه", "سياسات", "وثيقه", "وثائق", "مستند", "مستندات", "ملف", "دليل",
  "اجازه", "الاجازه", "اجازات", "الاجازات", "راتب", "رواتب", "تامين", "موظف", "الموظف", "موظفين", "الموظفين", "عقد",
  "ماده", "بند", "لائحه", "لوائح", "دوام", "ساعات", "ترقيه", "تعويض",
  "حد", "بدل", "اهليه", "شرط", "شروط", "موافقه", "مهله", "مصروفات",
  "مصروف", "ايصال", "سفر", "فندق", "وجبات", "مشتريات", "شراء", "عروض",
  "اسعار", "استجابه", "استعاده", "دعم", "حادث", "وصول", "صلاحيات",
]);

const ENTERPRISE_SUBJECT_TERMS = new Set([
  "hotel", "meal", "purchase", "procurement", "quotation", "quote", "remote",
  "work", "leave", "sla", "response", "restoration", "support", "incident",
  "p1", "p2", "p3", "mfa", "vpn", "password", "security", "access", "account",
  "lock", "locked", "login", "logins", "failed", "internal", "systems",
  "فندق", "وجبات", "مشتريات", "شراء", "عروض", "عمل", "العمل", "اجازه", "استجابه",
  "استعاده", "دعم", "حادث", "امن", "امان", "وصول", "صلاحيات",
]);

const CONTROL_TERMS = new Set([
  "policy", "rule", "limit", "allowance", "eligibility", "requirement", "required",
  "mandatory", "approval", "deadline", "reimbursement", "receipt", "expense",
  "allowed", "maximum", "minimum", "threshold", "سياسه", "قواعد", "حد", "بدل",
  "اهليه", "شرط", "موافقه", "مهله", "مصروفات", "ايصال", "اجباري", "الزامي",
  "لازم", "مسموح", "اقصي", "ادني",
]);

const QUESTION_TERMS = new Set([
  "what", "where", "when", "which", "who", "why", "how", "can", "could", "does", "do", "is", "are",
  "ما", "ماذا", "متي", "متى", "اين", "كيف", "كم", "هل", "مين", "ليه", "ممكن", "كام",
]);

const REQUEST_TERMS = new Set([
  "show", "find", "explain", "summarize", "compare", "list", "locate", "upload", "delete",
  "tell", "give", "describe", "detail", "details", "provide", "inform", "clarify", "get", "fetch", "check", "lookup", "search",
  "اعرض", "اجد", "اشرح", "لخص", "قارن", "اذكر", "قولي", "اريد", "عايز", "احذف", "ارفع",
  "اخبرني", "عرفني", "اعطني", "وضح", "هات", "ابحث", "شوف", "اقرا",
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

const GENERIC_DOCUMENT_REFERENTS = new Set([
  "document", "documents", "file", "files", "policy", "policies", "handbook",
  "summary", "summaries", "documento", "ملف", "ملفات", "وثيقه", "وثائق",
  "مستند", "مستندات", "سياسه", "سياسات", "دليل", "ملخص", "تلخيص",
]);

const UNRESOLVED_REFERENCE_WORDS = new Set([
  "it", "that", "this", "those", "these", "هو", "هي", "هذا", "هذه", "ذلك", "تلك",
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

/**
 * Returns true when the current turn contains a usable semantic subject for
 * retrieval, rather than only a generic document noun or a pronoun. This is a
 * routing signal, not document authorization or title resolution.
 */
export function hasSemanticRetrievalSubject(raw: string): boolean {
  const stripped = stripLeadingSocialExpression(raw);
  const prepared = preprocessIntentText(stripped.text);
  const tokens = prepared.normalizedTokens;
  const substantiveTokens = tokens.filter(
    (token) =>
      !QUESTION_TERMS.has(token) &&
      !REQUEST_TERMS.has(token) &&
      !OVERLAP_STOP_WORDS.has(token) &&
      !GENERIC_DOCUMENT_REFERENTS.has(token) &&
      !UNRESOLVED_REFERENCE_WORDS.has(token),
  );
  if (substantiveTokens.length === 0) return false;

  // A trailing standalone reference still depends on prior context. A
  // determiner before a real subject (for example, "this remote policy") is
  // not treated as unresolved.
  const hasTrailingUnresolvedReference = tokens.some(
    (token, index) =>
      UNRESOLVED_REFERENCE_WORDS.has(token) &&
      index === tokens.length - 1,
  );
  return !hasTrailingUnresolvedReference;
}

export function isBareGeneralDefinitionText(normalized: string): boolean {
  return (
    /^(?:what\s+is|explain|define)\s+(?:a\s+|an\s+|the\s+)?(?:vpn|mfa|procurement|sla|hotel\s+management)(?:\s+in\s+general)?$/u.test(normalized) ||
    /^(?:ما|ماذا)\s+(?:هو|هي)\s+(?:vpn|mfa|sla|المشتريات)$/u.test(normalized)
  );
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
  const hasEnterpriseSubject = tokens.some((token) => ENTERPRISE_SUBJECT_TERMS.has(token));
  const hasControlTerm = tokens.some((token) => CONTROL_TERMS.has(token));
  const normalized = prepared.elongationReducedText;
  const hasStructuredEnterpriseSignal = hasEnterpriseSubject && (
    hasControlTerm ||
    /\bp[123]\b.*\b(?:response|restoration)\s+(?:time|target)\b/u.test(normalized) ||
    /\b(?:is|are|when\s+is|when\s+are)\b.*\b(?:required|mandatory|allowed)\b/u.test(normalized) ||
    /\bhow\s+(?:many|long)\b.*\b(?:allowed|take|takes|days?|hours?|minutes?)\b/u.test(normalized) ||
    /(?:زمن|وقت)\s+الاستجابه/u.test(normalized) ||
    /(?:هل|امتي)\s+.*(?:لازم|اجباري|الزامي|مطلوب|مسموح)/u.test(normalized) ||
    /(?:كام|كم)\s+(?:هو\s+)?(?:حد|يوم|وقت)/u.test(normalized)
    || /\b(?:account\s+)?lock(?:ed)?\b.*\b(?:login|attempt|failed)\b/iu.test(normalized)
    || /\b(?:support|incident|p1|p2)\b.*\b(?:24\s*[/ ]?\s*7|monitored|monitoring)\b/iu.test(normalized)
    || (
      /\b(?:work(?:ing)?\s+remotely|remote\s+(?:work|days?)|work(?:ing)?\s+from\s+home|remote[-\s]+work)\b/iu.test(normalized) &&
      /\b(?:days?|week|approval|approved|eligible|eligibility|allowed|required|requirement)\b/iu.test(normalized)
    )
  );
  const isBareGeneralDefinition = isBareGeneralDefinitionText(normalized);
  const substantiveTokens = tokens.filter(
    (token) => !QUESTION_TERMS.has(token) && !OVERLAP_STOP_WORDS.has(token),
  );

  const reasons: string[] = [];
  if (hasKnowledgeTerm) reasons.push("DOMAIN_TERM");
  if (hasDocumentReference) reasons.push("DOCUMENT_REFERENCE");
  if (hasQuestionShape || hasQuestionMark) reasons.push("QUESTION_SHAPE");
  if (hasRequestShape) reasons.push("REQUEST_SHAPE");
  if (hasStructuredEnterpriseSignal) reasons.push("ENTERPRISE_STRUCTURE");
  if (isBareGeneralDefinition) reasons.push("GENERAL_DEFINITION");

  const positive =
    !isBareGeneralDefinition &&
    substantiveTokens.length > 0 &&
    (hasKnowledgeTerm || hasDocumentReference || hasStructuredEnterpriseSignal) &&
    (hasQuestionShape || hasQuestionMark || hasRequestShape);

  return {
    positive,
    retrievalText: stripped.text,
    socialPrefixRemoved: stripped.removed,
    reasons,
  };
}

/**
 * Deterministic marker for a contextual access/security follow-up. This is
 * intentionally narrow: it only fires when the current turn contains an
 * unresolved continuation plus security/system-access vocabulary. The caller
 * must still prove that conversation history exists and supplies the prior
 * subject.
 */
export function isLikelyAccessContextFollowUp(raw: string): boolean {
  const normalized = preprocessIntentText(raw).elongationReducedText;
  const hasContinuation = /\b(?:that|this|doing\s+that|while\s+doing\s+that)\b/u.test(normalized);
  const hasAccessTopic = /\b(?:access|internal\s+systems?|vpn|security|mfa)\b/u.test(normalized);
  return hasContinuation && hasAccessTopic;
}

/**
 * Domain-agnostic marker for a contextual follow-up: a short, continuation-led
 * turn whose subject lives in the previous user message ("Does that apply to
 * contractors?", "What about the hotel limit?", "And the per-diem rate?").
 * The topic vocabulary is deliberately NOT constrained — the previous turn
 * supplies the subject, and retrieval over the authorized corpus stays the
 * authority on answerability.
 */
export function isLikelyContextualFollowUp(raw: string): boolean {
  const normalized = preprocessIntentText(raw).elongationReducedText;
  const words = normalized.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0 || words.length > 15) return false;
  const hasContinuation =
    /\b(?:that|this|it|they|those|these|the\s+same|such|also|too|there|then)\b/u.test(normalized) ||
    /\b(?:what|how)\s+about\b/iu.test(normalized) ||
    /^\s*(?:and|و)\b/iu.test(normalized) ||
    /(?:أيضاً|ايضاً|هل هذا|وماذا عن|وكيف|كذلك)/u.test(normalized);
  if (!hasContinuation) return false;
  // The continuation must lead the turn: a deictic subject (that/this/it/…)
  // within the first few words, or an explicit continuation opener. A long
  // independent question that merely contains a pronoun is not a follow-up.
  const leadFour = words.slice(0, 4).join(" ").toLowerCase();
  const deicticLead =
    /\b(?:that|this|it|they|those|these|the same|such|also|too)\b/u.test(leadFour);
  const phraseLead =
    /^(?:what about|how about|what if|and the|and what|and how|and does|and is|and are|and can|and do|and)\b/u.test(leadFour);
  const arabicLead =
    /^(?:وماذا عن|وكيف|هل هذا|أيضاً|ايضاً|كذلك)/u.test(normalized.trim());
  return deicticLead || phraseLead || arabicLead;
}

/**
 * Conservative prior-turn document/RAG predicate. A contextual follow-up may
 * only be deterministically promoted when the previous user turn itself
 * expressed document or enterprise knowledge intent. Assistant/product-name
 * phrasing is neutralized first so "What can DocuMind AI do?" cannot satisfy
 * the document-reference signal through the "doc" substring.
 */
export function isLikelyPriorDocumentTurn(raw: string): boolean {
  if (!raw.trim()) return false;
  const neutralized = raw
    .replace(/\bdocu[-_]?mind\b/giu, "product")
    .replace(/\b(?:chat\s*bot|assistant)\b/giu, "product");
  if (/\b(?:who|what)\s+(?:are|r)\s+(?:you|u)\b/iu.test(neutralized)) return false;
  if (/\b(?:what|which|how)\s+(?:can|could|do|does|did)\s+(?:you|u|it|product)\b/iu.test(neutralized)) return false;
  return assessPositiveKnowledgeSeeking(neutralized).positive;
}

/**
 * A prior user turn can anchor a contextual follow-up only when it is itself
 * substantive: not social small talk, not gibberish, and carries real tokens.
 */
export function hasSubstantivePriorTurn(message: string): boolean {
  if (!message.trim()) return false;
  if (detectSocialMessage(message).isSocial) return false;
  if (isLikelyGibberish(message)) return false;
  return preprocessIntentText(message).normalizedTokens.length >= 2;
}

export function buildContextualFollowUpQuestion(
  previousUserQuestion: string,
  currentQuestion: string,
): string {
  return `Regarding the previous question, "${previousUserQuestion.trim()}", ${currentQuestion.trim()}`;
}

/**
 * Domain-agnostic question detection. Unlike assessPositiveKnowledgeSeeking,
 * this does not require the enterprise/HR vocabulary: any well-formed
 * question or request with substantive content qualifies. Used to keep a
 * provider's "unsupported" verdict from blocking questions about arbitrary
 * uploaded-document topics; retrieval and the evidence gate remain the
 * authority on whether the corpus can answer.
 */
export function hasDomainAgnosticQuestionShape(raw: string): boolean {
  const stripped = stripLeadingSocialExpression(raw);
  const prepared = preprocessIntentText(stripped.text);
  const tokens = prepared.normalizedTokens;
  if (tokens.length === 0) return false;
  if (
    /^(?:(?:simple|generic|test|example|sample)\s+)?(?:knowledge\s+)?(?:query|question)(?:\s+here)?[?\s]*$/u.test(
      prepared.elongationReducedText,
    )
  ) {
    return false;
  }
  const substantiveTokens = tokens.filter(
    (token) => !QUESTION_TERMS.has(token) && !OVERLAP_STOP_WORDS.has(token),
  );
  if (substantiveTokens.length === 0) return false;
  const hasQuestionShape = tokens.some((token) => QUESTION_TERMS.has(token));
  const hasRequestShape = tokens.some((token) => REQUEST_TERMS.has(token));
  const hasQuestionMark = /[?؟]/u.test(stripped.text);
  return hasQuestionShape || hasQuestionMark || hasRequestShape;
}

export function hasInterrogativeQuestionShape(raw: string): boolean {
  const stripped = stripLeadingSocialExpression(raw);
  const prepared = preprocessIntentText(stripped.text);
  const tokens = prepared.normalizedTokens;
  const hasQuestionShape = tokens.some((token) => QUESTION_TERMS.has(token));
  const hasQuestionMark = /[?؟]/u.test(stripped.text);
  return hasQuestionShape || hasQuestionMark;
}

export function hasEnterpriseSubjectTerm(raw: string): boolean {
  const stripped = stripLeadingSocialExpression(raw);
  const prepared = preprocessIntentText(stripped.text);
  return prepared.normalizedTokens.some((token) => ENTERPRISE_SUBJECT_TERMS.has(token));
}

export function isLikelySensitivePersonalDataRequest(raw: string): boolean {
  const normalized = preprocessIntentText(raw).elongationReducedText;
  return /\b(?:personal|private)\s+(?:mobile|phone|telephone|email|address|contact|number)\b/u.test(
    normalized,
  );
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
