import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Finalizer } from "../finalizer.js";
import type {
  EvidenceBundle,
} from "../answerPipeline.types.js";

function makeEvidenceBundle(): EvidenceBundle {
  return {
    items: [
      {
        rank: 0,
        candidate: {
          chunkId: "chunk-1",
          documentId: "doc-1",
          documentVersionId: "ver-1",
          tenantId: "tenant-1",
          text: "Annual leave is 21 working days per calendar year.",
          score: 0.9,
          pageNumber: 3,
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
          pageNumber: 3,
          sectionTitle: "Leave Policy",
        },
        textExcerpt: "Annual leave is 21 working days per calendar year.",
      },
    ],
    totalTokenCount: 20,
    maxTokenCount: 4000,
    inputCandidateCount: 1,
    conflictGroups: [],
    sufficiency: { level: "SUFFICIENT", reasons: [] },
    scoreExplanation: "Strong match",
    accessPolicyVersion: "1.0.0",
    createdAt: new Date().toISOString(),
  };
}

const PROMPT_VERSIONS = {
  answerWriter: "1.0.0",
  citationVerification: "1.0.0",
  compliance: "1.0.0",
};

describe("Multilingual Finalizer", () => {
  const finalizer = new Finalizer();

  it("returns English refusal for unsupported claims in English", () => {
    const result = finalizer.execute({
      draftAnswer: {
        answerText: "Some answer",
        language: "en",
        claims: [],
        uncertainty: null,
        refusalCandidate: false,
        refusalReason: null,
        tokenUsage: { totalTokens: 0 },
      },
      verificationResult: {
        claims: [],
        overallSupport: "none",
        unsupportedCount: 0,
        tokenUsage: { totalTokens: 0 },
      },
      complianceResult: {
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
      },
      evidenceBundle: makeEvidenceBundle(),
      language: "en",
      traceId: "trace-en",
      promptVersions: PROMPT_VERSIONS,
    });

    assert.equal(result.outcome, "refused");
    assert.ok(result.answerText.includes("evidence") || result.answerText.includes("support"));
  });

  it("returns Arabic refusal for unsupported claims in Arabic", () => {
    const result = finalizer.execute({
      draftAnswer: {
        answerText: "some answer",
        language: "ar",
        claims: [],
        uncertainty: null,
        refusalCandidate: false,
        refusalReason: null,
        tokenUsage: { totalTokens: 0 },
      },
      verificationResult: {
        claims: [],
        overallSupport: "none",
        unsupportedCount: 0,
        tokenUsage: { totalTokens: 0 },
      },
      complianceResult: {
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
      },
      evidenceBundle: makeEvidenceBundle(),
      language: "ar",
      traceId: "trace-ar",
      promptVersions: PROMPT_VERSIONS,
    });

    assert.equal(result.outcome, "refused");
    assert.ok(/[\u0080-\uFFFF]/.test(result.answerText), "Should contain Arabic characters");
  });

  it("returns mixed-language refusal for mixed language", () => {
    const result = finalizer.execute({
      draftAnswer: {
        answerText: "some answer",
        language: "mixed",
        claims: [],
        uncertainty: null,
        refusalCandidate: false,
        refusalReason: null,
        tokenUsage: { totalTokens: 0 },
      },
      verificationResult: {
        claims: [],
        overallSupport: "none",
        unsupportedCount: 0,
        tokenUsage: { totalTokens: 0 },
      },
      complianceResult: {
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
      },
      evidenceBundle: makeEvidenceBundle(),
      language: "mixed",
      traceId: "trace-mixed",
      promptVersions: PROMPT_VERSIONS,
    });

    assert.equal(result.outcome, "refused");
    assert.ok(result.answerText.includes("/"), "Mixed language should contain separator");
  });

  it("returns English injection refusal for English", () => {
    const result = finalizer.execute({
      draftAnswer: {
        answerText: "Injection answer",
        language: "en",
        claims: [],
        uncertainty: null,
        refusalCandidate: false,
        refusalReason: null,
        tokenUsage: { totalTokens: 0 },
      },
      verificationResult: {
        claims: [],
        overallSupport: "none",
        unsupportedCount: 0,
        tokenUsage: { totalTokens: 0 },
      },
      complianceResult: {
        authorized: true,
        promptInjectionDetected: true,
        unsupportedClaims: false,
        unsafeDisclosure: false,
        conflictingEvidenceHandled: true,
        languageCompliant: true,
        refusalRequired: true,
        refusalReason: "prompt_injection_detected",
        flags: ["injection_pattern_detected"],
        tokenUsage: { totalTokens: 0 },
      },
      evidenceBundle: makeEvidenceBundle(),
      language: "en",
      traceId: "trace-inj-en",
      promptVersions: PROMPT_VERSIONS,
    });

    assert.equal(result.outcome, "refused");
    assert.ok(result.answerText.includes("security"));
  });

  it("returns Arabic injection refusal for Arabic", () => {
    const result = finalizer.execute({
      draftAnswer: {
        answerText: "Injection answer",
        language: "ar",
        claims: [],
        uncertainty: null,
        refusalCandidate: false,
        refusalReason: null,
        tokenUsage: { totalTokens: 0 },
      },
      verificationResult: {
        claims: [],
        overallSupport: "none",
        unsupportedCount: 0,
        tokenUsage: { totalTokens: 0 },
      },
      complianceResult: {
        authorized: true,
        promptInjectionDetected: true,
        unsupportedClaims: false,
        unsafeDisclosure: false,
        conflictingEvidenceHandled: true,
        languageCompliant: true,
        refusalRequired: true,
        refusalReason: "prompt_injection_detected",
        flags: ["injection_pattern_detected"],
        tokenUsage: { totalTokens: 0 },
      },
      evidenceBundle: makeEvidenceBundle(),
      language: "ar",
      traceId: "trace-inj-ar",
      promptVersions: PROMPT_VERSIONS,
    });

    assert.equal(result.outcome, "refused");
    assert.ok(/[\u0080-\uFFFF]/.test(result.answerText), "Should contain Arabic characters");
  });
});
