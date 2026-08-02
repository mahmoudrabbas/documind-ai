import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Finalizer } from "../finalizer.js";
import type {
  DraftAnswer,
  CitationVerificationResult,
  ComplianceResult,
  EvidenceBundle,
} from "../answerPipeline.types.js";

function makeDraftAnswer(overrides: Partial<DraftAnswer> = {}): DraftAnswer {
  return {
    answerText: "The leave policy allows 21 days per year.",
    language: "en",
    claims: [
      {
        id: "c1",
        text: "The leave policy allows 21 days per year.",
        evidenceItemIndices: [0],
        confidence: "high",
        citationAnchors: [
          {
            chunkId: "chunk-1",
            documentId: "doc-1",
            documentVersionId: "ver-1",
            pageNumber: 1,
            sectionTitle: "Leave Policy",
          },
        ],
      },
    ],
    uncertainty: null,
    refusalCandidate: false,
    refusalReason: null,
    tokenUsage: { totalTokens: 0 },
    ...overrides,
  };
}

function makeVerificationResult(
  overrides: Partial<CitationVerificationResult> = {},
): CitationVerificationResult {
  return {
    claims: [
      {
        claimId: "c1",
        status: "supported",
        correctedAnchors: [],
        reason: null,
      },
    ],
    overallSupport: "full",
    unsupportedCount: 0,
    tokenUsage: { totalTokens: 0 },
    ...overrides,
  };
}

function makeComplianceResult(
  overrides: Partial<ComplianceResult> = {},
): ComplianceResult {
  return {
    authorized: true,
    promptInjectionDetected: false,
    unsupportedClaims: false,
    unsafeDisclosure: false,
    conflictingEvidenceHandled: true,
    languageCompliant: true,
    refusalRequired: false,
    refusalReason: null,
    flags: [],
    tokenUsage: { totalTokens: 0 },
    ...overrides,
  };
}

function makeEvidenceBundle(
  overrides: Partial<EvidenceBundle> = {},
): EvidenceBundle {
  return {
    items: [
      {
        rank: 0,
        candidate: {
          chunkId: "chunk-1",
          documentId: "doc-1",
          documentVersionId: "ver-1",
          tenantId: "tenant-1",
          text: "The leave policy allows 21 days per year.",
          score: 0.9,
          pageNumber: 1,
          sectionTitle: "Leave Policy",
          retrievalMethod: "hybrid",
        },
        scoreBreakdown: {
          fusionScore: 0.9,
          rerankScore: 0.85,
          semanticScore: 0.8,
          exactTermScore: 0.7,
          sourceAuthorityScore: 0.8,
          versionPreferenceScore: 0.8,
          totalScore: 0.87,
        },
        citationAnchor: {
          chunkId: "chunk-1",
          documentId: "doc-1",
          documentVersionId: "ver-1",
          pageNumber: 1,
          sectionTitle: "Leave Policy",
        },
        textExcerpt: "The leave policy allows 21 days per year.",
      },
    ],
    totalTokenCount: 20,
    maxTokenCount: 4000,
    inputCandidateCount: 1,
    conflictGroups: [],
    sufficiency: { level: "SUFFICIENT", reasons: ["Strong evidence match"] },
    scoreExplanation: "Strong match",
    accessPolicyVersion: "1.0.0",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const PROMPT_VERSIONS = {
  answerWriter: "1.0.0",
  citationVerification: "1.0.0",
  compliance: "1.0.0",
};

describe("Finalizer", () => {
  const finalizer = new Finalizer();

  it("approves a fully supported answer", () => {
    const result = finalizer.execute({
      draftAnswer: makeDraftAnswer(),
      verificationResult: makeVerificationResult(),
      complianceResult: makeComplianceResult(),
      evidenceBundle: makeEvidenceBundle(),
      language: "en",
      traceId: "trace-1",
      promptVersions: PROMPT_VERSIONS,
    });

    assert.equal(result.outcome, "approved");
    assert.ok(result.answerText.length > 0);
    assert.ok(result.citations.length > 0);
  });

  it("refuses when prompt injection detected", () => {
    const result = finalizer.execute({
      draftAnswer: makeDraftAnswer(),
      verificationResult: makeVerificationResult(),
      complianceResult: makeComplianceResult({
        promptInjectionDetected: true,
        refusalRequired: true,
        refusalReason: "prompt_injection_detected",
      }),
      evidenceBundle: makeEvidenceBundle(),
      language: "en",
      traceId: "trace-2",
      promptVersions: PROMPT_VERSIONS,
    });

    assert.equal(result.outcome, "refused");
    assert.ok(result.answerText.includes("security"));
  });

  it("refuses when all claims unsupported", () => {
    const result = finalizer.execute({
      draftAnswer: makeDraftAnswer(),
      verificationResult: makeVerificationResult({
        overallSupport: "none",
        unsupportedCount: 1,
        claims: [
          {
            claimId: "c1",
            status: "unsupported",
            correctedAnchors: [],
            reason: "Not in evidence",
          },
        ],
      }),
      complianceResult: makeComplianceResult(),
      evidenceBundle: makeEvidenceBundle(),
      language: "en",
      traceId: "trace-3",
      promptVersions: PROMPT_VERSIONS,
    });

    assert.equal(result.outcome, "refused");
    assert.equal(result.citations.length, 0);
  });

  it("refuses when no evidence available", () => {
    const result = finalizer.execute({
      draftAnswer: makeDraftAnswer(),
      verificationResult: makeVerificationResult(),
      complianceResult: makeComplianceResult(),
      evidenceBundle: makeEvidenceBundle({
        items: [],
        sufficiency: { level: "NO_EVIDENCE", reasons: [] },
      }),
      language: "en",
      traceId: "trace-4",
      promptVersions: PROMPT_VERSIONS,
    });

    assert.equal(result.outcome, "refused");
    assert.ok(result.answerText.includes("documents"));
  });

  it("refuses when answer writer flags refusal candidate", () => {
    const result = finalizer.execute({
      draftAnswer: makeDraftAnswer({
        refusalCandidate: true,
        refusalReason: "no_sufficient_evidence",
      }),
      verificationResult: makeVerificationResult(),
      complianceResult: makeComplianceResult(),
      evidenceBundle: makeEvidenceBundle(),
      language: "en",
      traceId: "trace-5",
      promptVersions: PROMPT_VERSIONS,
    });

    assert.equal(result.outcome, "refused");
  });

  it("returns conflict when evidence conflicts and not handled", () => {
    const result = finalizer.execute({
      draftAnswer: makeDraftAnswer(),
      verificationResult: makeVerificationResult(),
      complianceResult: makeComplianceResult({
        conflictingEvidenceHandled: false,
      }),
      evidenceBundle: makeEvidenceBundle({
        sufficiency: { level: "CONFLICTING", reasons: ["Contradictions found"] },
        conflictGroups: [
          {
            conflictId: "cg-1",
            description: "Contradicting statements about leave days",
            itemIndices: [0, 1],
          },
        ],
      }),
      language: "en",
      traceId: "trace-6",
      promptVersions: PROMPT_VERSIONS,
    });

    assert.equal(result.outcome, "conflict");
    assert.ok(result.answerText.includes("conflicting"));
  });

  it("approves with caveat when partially supported", () => {
    const result = finalizer.execute({
      draftAnswer: makeDraftAnswer(),
      verificationResult: makeVerificationResult({
        overallSupport: "partial",
        unsupportedCount: 0,
      }),
      complianceResult: makeComplianceResult(),
      evidenceBundle: makeEvidenceBundle(),
      language: "en",
      traceId: "trace-7",
      promptVersions: PROMPT_VERSIONS,
    });

    assert.equal(result.outcome, "approved");
    assert.ok(result.answerText.includes("caveat") || result.answerText.includes("may not"));
  });

  it("returns clarified when answer writer expresses uncertainty", () => {
    const result = finalizer.execute({
      draftAnswer: makeDraftAnswer({
        uncertainty: "The evidence is ambiguous about the exact number of days.",
        refusalCandidate: false,
      }),
      verificationResult: makeVerificationResult({
        overallSupport: "partial",
        unsupportedCount: 0,
      }),
      complianceResult: makeComplianceResult(),
      evidenceBundle: makeEvidenceBundle(),
      language: "en",
      traceId: "trace-clarified",
      promptVersions: PROMPT_VERSIONS,
    });

    assert.equal(result.outcome, "clarified");
    assert.ok(result.answerText.includes("Note:"));
    assert.ok(result.answerText.includes("ambiguous"));
    assert.ok(result.citations.length > 0);
    assert.ok(result.complianceResult.flags.includes("uncertainty_present"));
  });

  it("returns Arabic refusal messages for Arabic language", () => {
    const result = finalizer.execute({
      draftAnswer: makeDraftAnswer({ language: "ar" }),
      verificationResult: makeVerificationResult({
        overallSupport: "none",
        unsupportedCount: 1,
        claims: [
          {
            claimId: "c1",
            status: "unsupported",
            correctedAnchors: [],
            reason: "Not in evidence",
          },
        ],
      }),
      complianceResult: makeComplianceResult(),
      evidenceBundle: makeEvidenceBundle(),
      language: "ar",
      traceId: "trace-8",
      promptVersions: PROMPT_VERSIONS,
    });

    assert.equal(result.outcome, "refused");
    assert.ok(/[\u0080-\uFFFF]/.test(result.answerText), "Should contain non-ASCII (Arabic) characters");
  });

  it("returns mixed-language refusal for mixed language", () => {
    const result = finalizer.execute({
      draftAnswer: makeDraftAnswer({ language: "mixed" }),
      verificationResult: makeVerificationResult({
        overallSupport: "none",
        unsupportedCount: 1,
        claims: [
          {
            claimId: "c1",
            status: "unsupported",
            correctedAnchors: [],
            reason: "Not in evidence",
          },
        ],
      }),
      complianceResult: makeComplianceResult(),
      evidenceBundle: makeEvidenceBundle(),
      language: "mixed",
      traceId: "trace-9",
      promptVersions: PROMPT_VERSIONS,
    });

    assert.equal(result.outcome, "refused");
    assert.ok(result.answerText.includes("/"), "Mixed language should contain separator");
  });
});
