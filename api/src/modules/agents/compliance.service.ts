import { QueryLanguageValue } from "../intent-query/intentQuery.types.js";
import {
  ChatComplianceDecisionValue,
} from "./chatWorkflowContracts.js";
import {
  ComplianceAgentInput,
  ComplianceAgentInputSchema,
  ComplianceAgentOutput,
  ComplianceAgentOutputSchema,
  ComplianceReasonCodeValue,
} from "./chatAgentIO.js";
import {
  isArabicContext,
  insufficientEvidenceMessage,
} from "./answerWriter.service.js";

const UNSUPPORTED_EN =
  "This question is outside the scope of company documents. I can help with questions about company policies and documents.";
const UNSUPPORTED_AR =
  "هذا السؤال خارج نطاق وثائق الشركة. يمكنني مساعدتك في الأسئلة المتعلقة بسياسات الشركة ووثائقها.";
const UNSAFE_EN = "This request cannot be processed due to safety policies.";
const UNSAFE_AR = "لا يمكن معالجة هذا الطلب لمخالفته لسياسات الأمان.";
const CLARIFICATION_EN =
  "Could you clarify your question so I can find the relevant policy or document to help you?";
const CLARIFICATION_AR =
  "يرجى توضيح سؤالك بحيث أتمكن من العثور على السياسة أو المستند ذي الصلة لمساعدتك.";

export function unsupportedReplyFor(
  language: QueryLanguageValue = "en",
): string {
  return isArabicContext(language) ? UNSUPPORTED_AR : UNSUPPORTED_EN;
}

export function unsafeReplyFor(language: QueryLanguageValue = "en"): string {
  return isArabicContext(language) ? UNSAFE_AR : UNSAFE_EN;
}

export function clarificationReplyFor(
  language: QueryLanguageValue = "en",
): string {
  return isArabicContext(language) ? CLARIFICATION_AR : CLARIFICATION_EN;
}

function normalizeLanguage(language: unknown): QueryLanguageValue {
  if (language === "ar" || language === "en" || language === "mixed") {
    return language;
  }
  return "en";
}

/**
 * Assemble a compliance output and guarantee it round-trips through the strict
 * output schema. On any structural failure we fall closed to a refuse with the
 * localized insufficient-evidence message — never an unverified model answer.
 */
function buildOutput(
  action: ChatComplianceDecisionValue,
  answer: string,
  sourceIds: string[],
  reasonCode: ComplianceReasonCodeValue,
  language: QueryLanguageValue,
): ComplianceAgentOutput {
  const round = ComplianceAgentOutputSchema.safeParse({
    action,
    answer,
    sourceIds,
    reasonCode,
  });
  if (round.success) return round.data;
  return {
    action: "refuse",
    answer: insufficientEvidenceMessage(language),
    sourceIds: [],
    reasonCode: "INSUFFICIENT_EVIDENCE",
  };
}

/**
 * Deterministic compliance gate.
 *
 * Pure & synchronous: no I/O, no LLM, no DB. Decides `release` / `refuse` /
 * `clarify` from the answer-writer decision, route, citation-verification
 * projection and the tenant `citationsEnabled` flag. Every branch is
 * fail-closed: an unsafe/unsupported/unverifiable request never releases the
 * model's answer, and never throws — malformed input is refused safely.
 *
 * Precedence (first match wins):
 *   unsafe -> unsupported -> clarification -> insufficient_evidence -> grounded
 */
export function evaluateCompliance(
  input: ComplianceAgentInput,
): ComplianceAgentOutput {
  const parsed = ComplianceAgentInputSchema.safeParse(input);
  if (!parsed.success) {
    const language = normalizeLanguage(input?.language);
    return buildOutput(
      "refuse",
      insufficientEvidenceMessage(language),
      [],
      "INSUFFICIENT_EVIDENCE",
      language,
    );
  }

  const v = parsed.data;
  const language = v.language ?? "en";

  if (v.route === "unsafe" || v.answerDecision === "unsafe") {
    return buildOutput(
      "refuse",
      unsafeReplyFor(language),
      [],
      "UNSAFE_RESPONSE",
      language,
    );
  }

  if (v.route === "unsupported" || v.answerDecision === "unsupported") {
    return buildOutput(
      "refuse",
      unsupportedReplyFor(language),
      [],
      "UNSUPPORTED_REQUEST",
      language,
    );
  }

  if (v.route === "clarification" || v.answerDecision === "clarification") {
    const preserved = v.answer.trim();
    return buildOutput(
      "clarify",
      preserved.length > 0 ? preserved : clarificationReplyFor(language),
      [],
      "CLARIFICATION_REQUIRED",
      language,
    );
  }

  if (v.answerDecision === "insufficient_evidence") {
    return buildOutput(
      "refuse",
      insufficientEvidenceMessage(language),
      [],
      "INSUFFICIENT_EVIDENCE",
      language,
    );
  }

  if (v.answerDecision === "grounded_answer") {
    const cv = v.citationVerification;
    const verificationValid =
      cv !== undefined &&
      cv.verified === true &&
      cv.validatedCitationIds.length > 0;

    if (!verificationValid) {
      return buildOutput(
        "refuse",
        insufficientEvidenceMessage(language),
        [],
        "UNVERIFIED_GROUNDED_RESPONSE",
        language,
      );
    }

    if (!v.citationsEnabled) {
      return buildOutput(
        "release",
        v.answer,
        [],
        "COMPLIANT_GROUNDED_RESPONSE_CITATIONS_DISABLED",
        language,
      );
    }

    return buildOutput(
      "release",
      v.answer,
      cv.validatedCitationIds,
      "COMPLIANT_GROUNDED_RESPONSE",
      language,
    );
  }

  return buildOutput(
    "refuse",
    insufficientEvidenceMessage(language),
    [],
    "INSUFFICIENT_EVIDENCE",
    language,
  );
}
