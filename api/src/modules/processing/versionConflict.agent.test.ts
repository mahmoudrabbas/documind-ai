import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { VersionConflictLLMAgent } from "./versionConflict.agent.js";
import type { DocumentComparisonInput } from "./ports/versionConflictAgent.port.js";
import type { ModelAdapter } from "../agents/agents.types.js";

function makeComparisonInput(
  overrides: Partial<DocumentComparisonInput> = {},
): DocumentComparisonInput {
  return {
    sourceDocument: {
      id: "doc-1",
      fileName: "policy-v1.pdf",
      checksum: "cs-111",
      extractedText: "All employees are entitled to 21 working days of annual leave.",
      metadata: {
        title: "Leave Policy v1",
        effectiveDate: new Date("2024-01-01"),
        expiryDate: new Date("2025-01-01"),
        department: "human_resources",
        classification: "internal",
        tags: ["hr", "leave"],
        version: 1,
      },
    },
    candidateDocuments: [
      {
        id: "doc-2",
        fileName: "policy-v2.pdf",
        checksum: "cs-222",
        extractedText: "All employees are entitled to 25 working days of annual leave.",
        metadata: {
          title: "Leave Policy v2",
          effectiveDate: new Date("2025-01-01"),
          expiryDate: new Date("2026-01-01"),
          department: "human_resources",
          classification: "internal",
          tags: ["hr", "leave", "updated"],
          version: 2,
        },
      },
    ],
    ...overrides,
  };
}

class FakeVersionConflictModel {
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
      usage: { promptTokens: 400, completionTokens: 200, totalTokens: 600 },
      latencyMs: 20,
      estimatedCost: 0,
    };
  }
}

describe("VersionConflictLLMAgent", () => {
  it("returns parsed relationships and conflicts from LLM", async () => {
    const fakeResponse = JSON.stringify({
      relationships: [
        {
          targetDocumentId: "doc-2",
          relationshipType: "SUPERSEDES",
          confidence: 0.85,
          evidence: [
            { type: "title_similarity", description: "Titles are 85% similar" },
            { type: "version_comparison", description: "Source v2 vs target v1" },
          ],
          requiresApproval: true,
        },
        {
          targetDocumentId: "doc-2",
          relationshipType: "RELATED_TO",
          confidence: 0.7,
          evidence: [
            { type: "same_department", description: "Both in human_resources" },
          ],
          requiresApproval: true,
        },
      ],
      conflicts: [
        {
          targetDocumentId: "doc-2",
          conflictType: "contradiction",
          severity: "high",
          confidence: 0.9,
          description: "Leave entitlement differs: 21 vs 25 days",
          evidence: [
            {
              type: "value_difference",
              sourceField: "extractedText",
              sourceValue: "21 working days",
              targetValue: "25 working days",
              explanation: "Source document states 21 days but target states 25 days",
            },
          ],
          requiresApproval: true,
        },
      ],
      summary: "Found 2 relationships and 1 conflict between documents.",
      overallConfidence: 0.82,
      requiresReview: true,
    });

    const agent = new VersionConflictLLMAgent(
      new FakeVersionConflictModel(fakeResponse) as unknown as ModelAdapter,
    );
    const result = await agent.analyzeDocument(makeComparisonInput());

    assert.equal(result.relationships.length, 2);
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.relationships[0].relationshipType, "SUPERSEDES");
    assert.equal(result.conflicts[0].conflictType, "contradiction");
    assert.equal(result.conflicts[0].severity, "high");
    assert.equal(result.overallConfidence, 0.82);
    assert.equal(result.requiresReview, true);
  });

  it("returns empty results when no candidates provided", async () => {
    const agent = new VersionConflictLLMAgent(
      new FakeVersionConflictModel("{}") as unknown as ModelAdapter,
    );
    const result = await agent.analyzeDocument(
      makeComparisonInput({ candidateDocuments: [] }),
    );

    assert.equal(result.relationships.length, 0);
    assert.equal(result.conflicts.length, 0);
    assert.ok(result.summary.includes("No candidate documents"));
  });

  it("returns empty output on LLM failure", async () => {
    const failingModel = {
      providerKey: "fake",
      async complete() {
        throw new Error("LLM unavailable");
      },
    };
    const agent = new VersionConflictLLMAgent(failingModel as unknown as ModelAdapter);
    const result = await agent.analyzeDocument(makeComparisonInput());

    assert.equal(result.relationships.length, 0);
    assert.equal(result.conflicts.length, 0);
  });

  it("returns empty output on parse failure", async () => {
    const agent = new VersionConflictLLMAgent(
      new FakeVersionConflictModel("invalid json") as unknown as ModelAdapter,
    );
    const result = await agent.analyzeDocument(makeComparisonInput());

    assert.equal(result.relationships.length, 0);
  });

  it("handles multiple candidate documents", async () => {
    const fakeResponse = JSON.stringify({
      relationships: [
        {
          targetDocumentId: "doc-2",
          relationshipType: "RELATED_TO",
          confidence: 0.7,
          evidence: [{ type: "content_similarity", description: "Similar content" }],
          requiresApproval: true,
        },
        {
          targetDocumentId: "doc-3",
          relationshipType: "DUPLICATE_OF",
          confidence: 0.9,
          evidence: [{ type: "checksum", description: "Identical checksum" }],
          requiresApproval: false,
        },
      ],
      conflicts: [],
      summary: "Found 2 relationships across 2 candidates.",
      overallConfidence: 0.8,
      requiresReview: true,
    });

    const agent = new VersionConflictLLMAgent(
      new FakeVersionConflictModel(fakeResponse) as unknown as ModelAdapter,
    );
    const result = await agent.analyzeDocument(
      makeComparisonInput({
        candidateDocuments: [
          {
            id: "doc-2",
            fileName: "policy-v2.pdf",
            checksum: "cs-222",
            extractedText: "All employees are entitled to 21 working days.",
            metadata: { title: "Leave Policy v2", version: 2 },
          },
          {
            id: "doc-3",
            fileName: "policy-copy.pdf",
            checksum: "cs-111",
            extractedText: "All employees are entitled to 21 working days.",
            metadata: { title: "Leave Policy v1 Copy", version: 1 },
          },
        ],
      }),
    );

    assert.equal(result.relationships.length, 2);
  });
});
