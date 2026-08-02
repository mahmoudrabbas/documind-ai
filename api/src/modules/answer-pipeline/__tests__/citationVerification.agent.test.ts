/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CitationVerificationLLMAgent } from "../citationVerification.agent.js";
import type { DraftAnswer, EvidenceBundle } from "../answerPipeline.types.js";

function makeDraftAnswer(): DraftAnswer {
  return {
    answerText: "Annual leave is 21 working days per year.",
    language: "en",
    claims: [
      {
        id: "c1",
        text: "Annual leave is 21 working days per year.",
        evidenceItemIndices: [0],
        confidence: "high",
        citationAnchors: [
          {
            chunkId: "chunk-1",
            documentId: "doc-1",
            documentVersionId: "ver-1",
            pageNumber: 3,
            sectionTitle: "Leave Policy",
          },
        ],
      },
    ],
    uncertainty: null,
    refusalCandidate: false,
    refusalReason: null,
    tokenUsage: { totalTokens: 0 },
  };
}

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

class FakeVerificationModel {
  readonly providerKey = "fake";
  private readonly responseText: string;

  constructor(responseText: string) {
    this.responseText = responseText;
  }

  async complete() {
    return {
      id: "fake-1",
      provider: "fake",
      model: "fake-model",
      choices: [
        {
          index: 0,
          message: { role: "assistant" as const, content: this.responseText },
          finishReason: "stop",
        },
      ],
      usage: { promptTokens: 80, completionTokens: 40, totalTokens: 120 },
      latencyMs: 10,
      estimatedCost: 0,
    };
  }
}

describe("CitationVerificationLLMAgent", () => {
  it("verifies supported claims", async () => {
    const fakeResponse = JSON.stringify({
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
    });

    const agent = new CitationVerificationLLMAgent(
      new FakeVerificationModel(fakeResponse) as any,
    );

    const result = await agent.execute({
      draftAnswer: makeDraftAnswer(),
      evidenceBundle: makeEvidenceBundle(),
    });

    assert.equal(result.overallSupport, "full");
    assert.equal(result.unsupportedCount, 0);
    assert.equal(result.claims[0].status, "supported");
  });

  it("detects unsupported claims", async () => {
    const fakeResponse = JSON.stringify({
      claims: [
        {
          claimId: "c1",
          status: "unsupported",
          correctedAnchors: [],
          reason: "Not found in evidence",
        },
      ],
      overallSupport: "none",
      unsupportedCount: 1,
    });

    const agent = new CitationVerificationLLMAgent(
      new FakeVerificationModel(fakeResponse) as any,
    );

    const result = await agent.execute({
      draftAnswer: makeDraftAnswer(),
      evidenceBundle: makeEvidenceBundle(),
    });

    assert.equal(result.overallSupport, "none");
    assert.equal(result.unsupportedCount, 1);
    assert.equal(result.claims[0].status, "unsupported");
  });

  it("returns empty result for empty claims", async () => {
    const agent = new CitationVerificationLLMAgent(
      new FakeVerificationModel("{}") as any,
    );

    const result = await agent.execute({
      draftAnswer: { ...makeDraftAnswer(), claims: [] },
      evidenceBundle: makeEvidenceBundle(),
    });

    assert.equal(result.overallSupport, "none");
    assert.equal(result.claims.length, 0);
  });

  it("returns empty result on LLM failure", async () => {
    const failingModel = {
      providerKey: "fake",
      async complete() {
        throw new Error("LLM unavailable");
      },
    };

    const agent = new CitationVerificationLLMAgent(failingModel as any);
    const result = await agent.execute({
      draftAnswer: makeDraftAnswer(),
      evidenceBundle: makeEvidenceBundle(),
    });

    assert.equal(result.overallSupport, "none");
    assert.equal(result.claims.length, 0);
  });
});
