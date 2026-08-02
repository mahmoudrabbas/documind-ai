import type {
  DraftAnswer,
  CitationVerificationResult,
  ComplianceResult,
  FinalAnswer,
  FinalCitation,
  AnswerLanguage,
  EvidenceBundle,
} from "./answerPipeline.types.js";

const REFUSAL_MESSAGES: Record<AnswerLanguage, Record<string, string>> = {
  en: {
    default:
      "I'm unable to provide a reliable answer based on the available documents. The information may be insufficient, conflicting, or not directly relevant to your question.",
    injection:
      "I cannot process this request due to a security concern in the input.",
    no_evidence:
      "I don't have relevant documents to answer this question. Please contact your administrator to upload relevant materials.",
    unsupported:
      "The available evidence does not fully support an answer to this question. Some claims could not be verified against the source documents.",
    conflict:
      "The documents contain conflicting information on this topic. Please review the source documents directly or contact an administrator.",
  },
  ar: {
    default:
      "لا أستطيع تقديم إجابة موثوقة بناءً على المستندات المتاحة. قد تكون المعلومات غير كافية أو متضاربة أو غير ذات صلة مباشرة بسؤالك.",
    injection:
      "لا أستطيع معالجة هذا الطلب بسبب مشكلة أمنية في المدخلات.",
    no_evidence:
      "لا توجد مستندات ذات صلة للإجابة على هذا السؤال. يرجى التواصل مع المسؤول لتحميل المواد ذات الصلة.",
    unsupported:
      "الدليل المتاح لا يدعم بالكامل الإجابة على هذا السؤال. لم يتم التحقق من بعض المزاعم ضد مستندات المصدر.",
    conflict:
      "تحتوي المستندات على معلومات متضاربة حول هذا الموضوع. يرجى مراجعة مستندات المصدر مباشرة أو التواصل مع المسؤول.",
  },
  mixed: {
    default:
      "I'm unable to provide a reliable answer / لا أستطيع تقديم إجابة موثوقة بناءً على المستندات المتاحة.",
    injection:
      "I cannot process this request / لا أستطيع معالجة هذا الطلب due to a security concern.",
    no_evidence:
      "No relevant documents found / لا توجد مستندات ذات صلة للإجابة على هذا السؤال.",
    unsupported:
      "Evidence is insufficient / الدليل غير كافٍ للإجابة على هذا السؤال.",
    conflict:
      "Conflicting information found / معلومات متضاربة في المستندات حول هذا الموضوع.",
  },
};

export class Finalizer {
  execute(params: {
    draftAnswer: DraftAnswer;
    verificationResult: CitationVerificationResult;
    complianceResult: ComplianceResult;
    evidenceBundle: EvidenceBundle;
    language: AnswerLanguage;
    traceId: string;
    promptVersions: {
      answerWriter: string;
      citationVerification: string;
      compliance: string;
    };
  }): FinalAnswer {
    const {
      draftAnswer,
      verificationResult,
      complianceResult,
      evidenceBundle,
      language,
      traceId,
      promptVersions,
    } = params;

    // Rule 1: Prompt injection detected → refuse
    if (complianceResult.promptInjectionDetected) {
      return this.buildRefusal(
        language,
        "injection",
        complianceResult.refusalReason ?? "prompt_injection_detected",
        traceId,
        promptVersions,
      );
    }

    // Rule 2: Compliance says refuse → refuse
    if (complianceResult.refusalRequired) {
      const reasonKey = this.mapRefusalReason(
        complianceResult.refusalReason,
      );
      return this.buildRefusal(
        language,
        reasonKey,
        complianceResult.refusalReason ?? "compliance_refusal",
        traceId,
        promptVersions,
      );
    }

    // Rule 3: No evidence → refuse
    if (
      evidenceBundle.sufficiency.level === "NO_EVIDENCE" ||
      evidenceBundle.items.length === 0
    ) {
      return this.buildRefusal(
        language,
        "no_evidence",
        "no_evidence",
        traceId,
        promptVersions,
      );
    }

    // Rule 4: All claims unsupported → refuse
    if (verificationResult.overallSupport === "none") {
      return this.buildRefusal(
        language,
        "unsupported",
        "all_claims_unsupported",
        traceId,
        promptVersions,
      );
    }

    // Rule 5: Answer writer flagged refusal candidate → refuse
    if (draftAnswer.refusalCandidate) {
      return this.buildRefusal(
        language,
        "default",
        draftAnswer.refusalReason ?? "answer_writer_refusal",
        traceId,
        promptVersions,
      );
    }

    // Rule 6: Answer writer expressed uncertainty → clarified response
    if (draftAnswer.uncertainty !== null) {
      return this.buildClarified(draftAnswer, verificationResult, evidenceBundle, language, traceId, promptVersions);
    }

    // Rule 7: Conflicting evidence not handled → conflict response
    if (
      evidenceBundle.sufficiency.level === "CONFLICTING" &&
      !complianceResult.conflictingEvidenceHandled
    ) {
      return this.buildConflictResponse(
        draftAnswer,
        verificationResult,
        evidenceBundle,
        language,
        traceId,
        promptVersions,
      );
    }

    // Rule 8: Partial support → approved with caveats
    if (verificationResult.overallSupport === "partial") {
      return this.buildApprovedAnswer(
        draftAnswer,
        verificationResult,
        complianceResult,
        language,
        traceId,
        promptVersions,
        "Some claims may not be fully supported by the evidence.",
      );
    }

    // Default: Approved
    return this.buildApprovedAnswer(
      draftAnswer,
      verificationResult,
      complianceResult,
      language,
      traceId,
      promptVersions,
    );
  }

  private buildRefusal(
    language: AnswerLanguage,
    reasonKey: string,
    reason: string,
    traceId: string,
    promptVersions: FinalAnswer["promptVersions"],
  ): FinalAnswer {
    const messages = REFUSAL_MESSAGES[language] ?? REFUSAL_MESSAGES.en;
    const answerText = messages[reasonKey] ?? messages.default;

    return {
      outcome: "refused",
      answerText,
      citations: [],
      complianceResult: {
        authorized: true,
        promptInjectionDetected: reason === "prompt_injection_detected",
        unsupportedClaims: reason.includes("unsupported"),
        unsafeDisclosure: false,
        conflictingEvidenceHandled: true,
        languageCompliant: true,
        refusalRequired: true,
        refusalReason: reason,
        flags: [reason],
        tokenUsage: { totalTokens: 0 },
      },
      language,
      traceId,
      promptVersions,
    };
  }

  private buildClarified(
    draftAnswer: DraftAnswer,
    verificationResult: CitationVerificationResult,
    evidenceBundle: EvidenceBundle,
    language: AnswerLanguage,
    traceId: string,
    promptVersions: FinalAnswer["promptVersions"],
  ): FinalAnswer {
    const clarificationText =
      language === "ar"
        ? `ملاحظة: ${draftAnswer.uncertainty ?? "هناك عدم يقين بشأن هذه الإجابة."}`
        : language === "mixed"
          ? `Note / ملاحظة: ${draftAnswer.uncertainty ?? "There is uncertainty about this answer / هناك عدم يقين بشأن هذه الإجابة."}`
          : `Note: ${draftAnswer.uncertainty ?? "There is some uncertainty about this answer."}`;

    return {
      outcome: "clarified",
      answerText: `${draftAnswer.answerText}\n\n${clarificationText}`,
      citations: this.buildCitations(
        draftAnswer,
        verificationResult,
        evidenceBundle,
      ),
      complianceResult: {
        authorized: true,
        promptInjectionDetected: false,
        unsupportedClaims: verificationResult.unsupportedCount > 0,
        unsafeDisclosure: false,
        conflictingEvidenceHandled: true,
        languageCompliant: true,
        refusalRequired: false,
        refusalReason: null,
        flags: ["uncertainty_present"],
        tokenUsage: { totalTokens: 0 },
      },
      language,
      traceId,
      promptVersions,
    };
  }

  private buildConflictResponse(
    draftAnswer: DraftAnswer,
    verificationResult: CitationVerificationResult,
    evidenceBundle: EvidenceBundle,
    language: AnswerLanguage,
    traceId: string,
    promptVersions: FinalAnswer["promptVersions"],
  ): FinalAnswer {
    const conflictText =
      language === "ar"
        ? "تحتوي المستندات على معلومات متضاربة حول هذا الموضوع. يرجى مراجعة المصادر أدناه."
        : language === "mixed"
          ? "The documents contain conflicting information / تحتوي المستندات على معلومات متضاربة. Please review the sources below."
          : "The documents contain conflicting information on this topic. Please review the sources below.";

    return {
      outcome: "conflict",
      answerText: `${draftAnswer.answerText}\n\n${conflictText}`,
      citations: this.buildCitations(
        draftAnswer,
        verificationResult,
        evidenceBundle,
      ),
      complianceResult: {
        authorized: true,
        promptInjectionDetected: false,
        unsupportedClaims: verificationResult.unsupportedCount > 0,
        unsafeDisclosure: false,
        conflictingEvidenceHandled: true,
        languageCompliant: true,
        refusalRequired: false,
        refusalReason: null,
        flags: ["conflicting_evidence"],
        tokenUsage: { totalTokens: 0 },
      },
      language,
      traceId,
      promptVersions,
    };
  }

  private buildApprovedAnswer(
    draftAnswer: DraftAnswer,
    verificationResult: CitationVerificationResult,
    complianceResult: ComplianceResult,
    language: AnswerLanguage,
    traceId: string,
    promptVersions: FinalAnswer["promptVersions"],
    caveat?: string,
  ): FinalAnswer {
    let answerText = draftAnswer.answerText;
    if (caveat) {
      answerText += `\n\n_${caveat}_`;
    }

    return {
      outcome: "approved",
      answerText,
      citations: this.buildCitations(
        draftAnswer,
        verificationResult,
        { items: [], conflictGroups: [], sufficiency: { level: "SUFFICIENT", reasons: [] }, totalTokenCount: 0, maxTokenCount: 0, inputCandidateCount: 0, scoreExplanation: "", accessPolicyVersion: "1.0.0", createdAt: "" },
      ),
      complianceResult,
      language,
      traceId,
      promptVersions,
    };
  }

  private buildCitations(
    draftAnswer: DraftAnswer,
    verificationResult: CitationVerificationResult,
    _evidenceBundle: EvidenceBundle,
  ): FinalCitation[] {
    const citations: FinalCitation[] = [];

    for (const claim of draftAnswer.claims) {
      const verification = verificationResult.claims.find(
        (vc) => vc.claimId === claim.id,
      );

      for (const anchor of claim.citationAnchors) {
        citations.push({
          claimId: claim.id,
          claimText: claim.text,
          status: verification?.status ?? "supported",
          chunkId: anchor.chunkId,
          documentId: anchor.documentId,
          documentVersionId: anchor.documentVersionId,
          pageNumber: anchor.pageNumber,
          sectionTitle: anchor.sectionTitle,
        });
      }
    }

    return citations;
  }

  private mapRefusalReason(reason: string | null): string {
    if (!reason) return "default";
    if (reason.includes("injection")) return "injection";
    if (reason.includes("evidence")) return "no_evidence";
    if (reason.includes("unsupported")) return "unsupported";
    if (reason.includes("conflict")) return "conflict";
    return "default";
  }
}
