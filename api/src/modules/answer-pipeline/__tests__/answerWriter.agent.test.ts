/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AnswerWriterLLMAgent } from "../answerWriter.agent.js";
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

class FakeAnswerWriterModel {
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
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      latencyMs: 10,
      estimatedCost: 0,
    };
  }
}

describe("AnswerWriterLLMAgent", () => {
  it("produces a valid draft answer from LLM response", async () => {
    const fakeResponse = JSON.stringify({
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
    });

    const agent = new AnswerWriterLLMAgent(
      new FakeAnswerWriterModel(fakeResponse) as any,
    );

    const result = await agent.execute({
      evidenceBundle: makeEvidenceBundle(),
      question: "How many annual leave days am I entitled to?",
      language: "en",
      conversationContext: [],
      maxClaims: 10,
    });

    assert.equal(result.language, "en");
    assert.equal(result.claims.length, 1);
    assert.equal(result.claims[0].id, "c1");
    assert.equal(result.claims[0].confidence, "high");
    assert.equal(result.refusalCandidate, false);
    assert.ok(result.answerText.length > 0);
  });

  it("returns empty draft on LLM failure", async () => {
    const failingModel = {
      providerKey: "fake",
      async complete() {
        throw new Error("LLM unavailable");
      },
    };

    const agent = new AnswerWriterLLMAgent(failingModel as any);
    const result = await agent.execute({
      evidenceBundle: makeEvidenceBundle(),
      question: "Test question",
      language: "en",
      conversationContext: [],
      maxClaims: 10,
    });

    assert.equal(result.refusalCandidate, true);
    assert.equal(result.refusalReason, "agent_output_parse_failure");
    assert.equal(result.claims.length, 0);
  });

  it("handles malformed JSON from LLM gracefully", async () => {
    const agent = new AnswerWriterLLMAgent(
      new FakeAnswerWriterModel("this is not json") as any,
    );

    const result = await agent.execute({
      evidenceBundle: makeEvidenceBundle(),
      question: "Test question",
      language: "en",
      conversationContext: [],
      maxClaims: 10,
    });

    assert.equal(result.refusalCandidate, true);
    assert.equal(result.claims.length, 0);
  });

  it("handles Arabic input", async () => {
    const fakeResponse = JSON.stringify({
      answerText: "الإجازة السنوية 21 يوم عمل في السنة.",
      language: "ar",
      claims: [
        {
          id: "c1",
          text: "الإجازة السنوية 21 يوم عمل في السنة.",
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
    });

    const agent = new AnswerWriterLLMAgent(
      new FakeAnswerWriterModel(fakeResponse) as any,
    );

    const result = await agent.execute({
      evidenceBundle: makeEvidenceBundle(),
      question: "كم يوم إجازة سنوية؟",
      language: "ar",
      conversationContext: [],
      maxClaims: 10,
    });

    assert.equal(result.language, "ar");
    assert.ok(/[\u0080-\uFFFF]/.test(result.answerText));
  });
});
