import type { CitationSemanticVerificationResult } from "../../agents/citationSemanticVerification.service.js";
import {
  GroundednessEvaluationResultSchema,
  type GroundednessEvaluationResult,
} from "./evaluation.schemas.js";
import { sameProposition } from "./correctness.evaluator.js";

export interface GroundednessEvaluationInput {
  semanticVerification: Pick<
    CitationSemanticVerificationResult,
    | "preparedClaims"
    | "claimResults"
    | "supportingEvidenceIds"
    | "releasedAnswerText"
    | "reasonCode"
  > &
    Partial<Pick<CitationSemanticVerificationResult, "complete" | "retryCount">>;
  /** Existing judge faithfulness remains an independent, non-gating signal. */
  faithfulnessScore?: number | null;
  evidenceTexts?: readonly string[];
  exhaustiveDocumentCoverage?: boolean;
  documentAbsence?: readonly {
    proposition: string;
    exhaustiveDocumentCoverage: boolean;
    explicitNegativeEvidence: readonly string[];
  }[];
}

const DOCUMENT_ABSENCE_PATTERN = /(?:\b(?:does not|doesn't|not (?:state|mention|contain|include)|no (?:reference|mention|provision)|absent from)\b|(?:لا\s+(?:تذكر|يذكر|تنص|ينص|تتضمن|يتضمن)|ليس\s+مذكور|غير\s+مذكور))/iu;

function isDocumentAbsenceClaim(value: string): boolean {
  return DOCUMENT_ABSENCE_PATTERN.test(value);
}

function absenceProposition(value: string): string {
  return value
    .replace(/^(?:the\s+)?(?:policy|document)\s+(?:does\s+not|doesn't)\s+(?:state|mention|contain|include)\s+/iu, "")
    .replace(/^.+?\s+is\s+not\s+(?:stated|mentioned|contained|included)\s+(?:in|by)\s+(?:the\s+)?(?:policy|document)\s*$/iu, "$1")
    .replace(/^(?:الوثيقه|الوثيقة|السياسه|السياسة)\s+لا\s+(?:تذكر|تنص على|تتضمن)\s+/u, "")
    .replace(/^لا\s+(?:تذكر|تنص على|تتضمن)\s+(?:الوثيقه|الوثيقة|السياسه|السياسة)\s+/u, "")
    .trim();
}

function matchingDefinition(
  claim: string,
  definitions: GroundednessEvaluationInput["documentAbsence"],
) {
  const proposition = absenceProposition(claim);
  return definitions?.find((definition) =>
    sameProposition(proposition, absenceProposition(definition.proposition)),
  );
}

function hasLinkedNegativeEvidence(
  claim: string,
  definition: NonNullable<GroundednessEvaluationInput["documentAbsence"]>[number],
): boolean {
  const proposition = absenceProposition(claim);
  return definition.explicitNegativeEvidence.some((evidence) =>
    isDocumentAbsenceClaim(evidence) &&
    sameProposition(proposition, absenceProposition(evidence)),
  );
}

/** Adapts the runtime verifier output without invoking or changing that gate. */
export class GroundednessEvaluator {
  evaluate(input: GroundednessEvaluationInput): GroundednessEvaluationResult {
    const { semanticVerification } = input;
    const factualClaimCount = semanticVerification.preparedClaims.length;
    const absenceClaims = semanticVerification.claimResults.filter((claim) =>
      isDocumentAbsenceClaim(claim.text),
    );
    const safelySupportedAbsenceClaims = absenceClaims.filter((claim) => {
      if (claim.state !== "SUPPORTED" || claim.deterministicContradiction) return false;
      if (input.exhaustiveDocumentCoverage === true) return true;
      const definition = matchingDefinition(claim.text, input.documentAbsence);
      if (!definition) return false;
      return definition.exhaustiveDocumentCoverage === true ||
        hasLinkedNegativeEvidence(claim.text, definition);
    });
    const unsafeAbsenceClaimIndexes = new Set(
      absenceClaims
        .filter((claim) => claim.state === "SUPPORTED" && !safelySupportedAbsenceClaims.includes(claim))
        .map((claim) => claim.claimIndex),
    );
    const supportedClaimCount = semanticVerification.claimResults.filter(
      (claim) => claim.state === "SUPPORTED" && !unsafeAbsenceClaimIndexes.has(claim.claimIndex),
    ).length;
    const unsupportedClaimCount = semanticVerification.claimResults.filter(
      (claim) => claim.state === "UNSUPPORTED",
    ).length;
    const explicitUnknownCount = semanticVerification.claimResults.filter(
      (claim) => claim.state === "UNKNOWN",
    ).length + unsafeAbsenceClaimIndexes.size;
    const unclassifiedClaimCount = Math.max(
      0,
      factualClaimCount - semanticVerification.claimResults.length,
    );
    const unknownClaimCount = explicitUnknownCount + unclassifiedClaimCount;
    const claimSupportRate =
      factualClaimCount > 0 ? supportedClaimCount / factualClaimCount : null;

    return GroundednessEvaluationResultSchema.parse({
      evaluated: true,
      factualClaimCount,
      supportedClaimCount,
      unsupportedClaimCount,
      unknownClaimCount,
      claimSupportRate,
      fullyGrounded:
        factualClaimCount > 0 &&
        supportedClaimCount === factualClaimCount &&
        unsupportedClaimCount === 0 &&
        unknownClaimCount === 0 &&
        semanticVerification.reasonCode === "SEMANTIC_VERIFIED" &&
        semanticVerification.releasedAnswerText !== undefined,
      supportingEvidenceIds: [...new Set(semanticVerification.supportingEvidenceIds)],
      ...(semanticVerification.releasedAnswerText !== undefined
        ? { finalVerifiedAnswer: semanticVerification.releasedAnswerText }
        : {}),
      faithfulnessScore: input.faithfulnessScore ?? null,
      semanticReasonCode: semanticVerification.reasonCode,
      ...(semanticVerification.complete === undefined
        ? {}
        : { verifierComplete: semanticVerification.complete }),
      ...(semanticVerification.retryCount === undefined
        ? {}
        : { verifierRetryCount: semanticVerification.retryCount }),
      documentAbsenceClaimCount: absenceClaims.length,
      safelySupportedDocumentAbsenceClaimCount: safelySupportedAbsenceClaims.length,
    });
  }
}
