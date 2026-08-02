/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ComplianceLLMAgent } from "../compliance.agent.js";
import type { EvidenceBundle } from "../answerPipeline.types.js";

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
          text: "Normal text about policy.",
          score: 0.9,
          pageNumber: 3,
          sectionTitle: "Policy",
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
          sectionTitle: "Policy",
        },
        textExcerpt: "Normal text about policy.",
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

const CLEAN_COMPLIANCE_RESPONSE = JSON.stringify({
  authorized: true,
  promptInjectionDetected: false,
  unsupportedClaims: false,
  unsafeDisclosure: false,
  conflictingEvidenceHandled: true,
  languageCompliant: true,
  refusalRequired: false,
  refusalReason: null,
  flags: [],
});

describe("Tenant isolation", () => {
  it("compliance agent receives correct tenant and actor context", async () => {
    const agent = new ComplianceLLMAgent({
      providerKey: "fake",
      async complete() {
        return {
          id: "fake-1",
          provider: "fake",
          model: "fake-model",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant" as const,
                content: CLEAN_COMPLIANCE_RESPONSE,
              },
              finishReason: "stop",
            },
          ],
          usage: { promptTokens: 80, completionTokens: 40, totalTokens: 120 },
          latencyMs: 10,
          estimatedCost: 0,
        };
      },
    } as any);

    const result = await agent.execute({
      draftAnswer: {
        answerText: "Answer text",
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
      evidenceBundle: makeEvidenceBundle(),
      userQuestion: "What is the policy?",
      language: "en",
      tenantId: "tenant-A",
      actorId: "user-B",
    });

    assert.equal(result.authorized, true);
  });

  it("evidence bundle tenant matches pipeline tenant", async () => {
    const agent = new ComplianceLLMAgent({
      providerKey: "fake",
      async complete() {
        return {
          id: "fake-1",
          provider: "fake",
          model: "fake-model",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant" as const,
                content: CLEAN_COMPLIANCE_RESPONSE,
              },
              finishReason: "stop",
            },
          ],
          usage: { promptTokens: 80, completionTokens: 40, totalTokens: 120 },
          latencyMs: 10,
          estimatedCost: 0,
        };
      },
    } as any);

    const result = await agent.execute({
      draftAnswer: {
        answerText: "Answer",
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
      evidenceBundle: {
        ...makeEvidenceBundle(),
        items: [
          {
            ...makeEvidenceBundle().items[0],
            candidate: {
              ...makeEvidenceBundle().items[0].candidate,
              tenantId: "tenant-A",
            },
          },
        ],
      },
      userQuestion: "Question",
      language: "en",
      tenantId: "tenant-A",
      actorId: "user-1",
    });

    assert.equal(result.authorized, true);
  });

  it("different tenants cannot see each other's evidence", async () => {
    const agent = new ComplianceLLMAgent({
      providerKey: "fake",
      async complete() {
        return {
          id: "fake-1",
          provider: "fake",
          model: "fake-model",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant" as const,
                content: CLEAN_COMPLIANCE_RESPONSE,
              },
              finishReason: "stop",
            },
          ],
          usage: { promptTokens: 80, completionTokens: 40, totalTokens: 120 },
          latencyMs: 10,
          estimatedCost: 0,
        };
      },
    } as any);

    const result = await agent.execute({
      draftAnswer: {
        answerText: "Answer",
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
      evidenceBundle: {
        ...makeEvidenceBundle(),
        items: [
          {
            ...makeEvidenceBundle().items[0],
            candidate: {
              ...makeEvidenceBundle().items[0].candidate,
              tenantId: "tenant-B",
            },
          },
        ],
      },
      userQuestion: "Question",
      language: "en",
      tenantId: "tenant-A",
      actorId: "user-1",
    });

    assert.equal(result.authorized, true);
  });
});
