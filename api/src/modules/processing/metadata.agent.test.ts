import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MetadataLLMAgent } from "./metadata.agent.js";
import type { ExtractionArtifacts } from "./ports/metadataAgent.port.js";
import type { ModelAdapter } from "../agents/agents.types.js";

function makeArtifacts(overrides: Partial<ExtractionArtifacts> = {}): ExtractionArtifacts {
  return {
    documentId: "doc-123",
    documentVersion: 1,
    fileName: "employee-handbook.pdf",
    mimeType: "application/pdf",
    extractedText: "Employee Handbook v2. This document contains HR policies and employee benefits.",
    pageCount: 10,
    checksum: "abc123",
    ...overrides,
  };
}

class FakeMetadataModel {
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
      usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      latencyMs: 10,
      estimatedCost: 0,
    };
  }
}

describe("MetadataLLMAgent", () => {
  it("returns parsed candidates from LLM response", async () => {
    const fakeResponse = JSON.stringify({
      candidates: [
        {
          fieldType: "title",
          proposedValue: "Employee Handbook v2",
          confidence: 0.95,
          evidence: [
            { type: "extracted", description: "Title found in document text", sourceText: "Employee Handbook v2" },
          ],
          requiresApproval: false,
        },
        {
          fieldType: "documentType",
          proposedValue: "policy",
          confidence: 0.85,
          evidence: [{ type: "content_analysis", description: "Document contains policy-related keywords" }],
          requiresApproval: false,
        },
        {
          fieldType: "language",
          proposedValue: "en",
          confidence: 0.9,
          evidence: [{ type: "content_analysis", description: "Document appears to be primarily English" }],
          requiresApproval: false,
        },
        {
          fieldType: "classification",
          proposedValue: "internal",
          confidence: 0.6,
          evidence: [{ type: "content_analysis", description: "Default classification for business documents" }],
          requiresApproval: true,
        },
      ],
      summary: "Extracted 4 metadata fields from employee-handbook.pdf with 82% confidence.",
      overallConfidence: 0.82,
      requiresReview: true,
    });

    const agent = new MetadataLLMAgent(new FakeMetadataModel(fakeResponse) as unknown as ModelAdapter);
    const result = await agent.proposeMetadata(makeArtifacts());

    assert.equal(result.candidates.length, 4);
    assert.equal(result.candidates[0].fieldType, "title");
    assert.equal(result.candidates[0].proposedValue, "Employee Handbook v2");
    assert.equal(result.candidates[0].confidence, 0.95);
    assert.equal(result.candidates[3].requiresApproval, true);
    assert.equal(result.overallConfidence, 0.82);
    assert.equal(result.requiresReview, true);
  });

  it("returns empty output on LLM parse failure", async () => {
    const agent = new MetadataLLMAgent(
      new FakeMetadataModel("not valid json") as unknown as ModelAdapter,
    );
    const result = await agent.proposeMetadata(makeArtifacts());

    assert.equal(result.candidates.length, 0);
    assert.equal(result.overallConfidence, 0);
    assert.equal(result.requiresReview, true);
  });

  it("returns empty output on LLM failure", async () => {
    const failingModel = {
      providerKey: "fake",
      async complete() {
        throw new Error("LLM unavailable");
      },
    };
    const agent = new MetadataLLMAgent(failingModel as unknown as ModelAdapter);
    const result = await agent.proposeMetadata(makeArtifacts());

    assert.equal(result.candidates.length, 0);
  });

  it("handles existing metadata in the artifacts", async () => {
    const fakeResponse = JSON.stringify({
      candidates: [
        {
          fieldType: "title",
          proposedValue: "Existing Title Override",
          confidence: 0.9,
          evidence: [{ type: "extracted", description: "Confirmed existing title" }],
          requiresApproval: false,
        },
      ],
      summary: "Reviewed existing metadata.",
      overallConfidence: 0.9,
      requiresReview: false,
    });

    const agent = new MetadataLLMAgent(new FakeMetadataModel(fakeResponse) as unknown as ModelAdapter);
    const result = await agent.proposeMetadata(
      makeArtifacts({
        title: "Existing Title",
        existingMetadata: {
          title: "Existing Title",
          department: "hr",
          classification: "internal",
        },
      }),
    );

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].proposedValue, "Existing Title Override");
  });
});
