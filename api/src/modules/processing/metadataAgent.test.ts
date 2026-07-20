import test from "node:test";
import assert from "node:assert";
import { FakeMetadataAgent } from "./ports/fakeMetadataAgent.js";
import type { ExtractionArtifacts } from "./ports/metadataAgent.port.js";

function makeExtractionArtifacts(overrides: Partial<ExtractionArtifacts> = {}): ExtractionArtifacts {
  return {
    documentId: "doc-123",
    documentVersion: 1,
    fileName: "test-document.pdf",
    mimeType: "application/pdf",
    extractedText: "This is a test document with some content about HR policies and employee benefits.",
    pageCount: 5,
    checksum: "abc123def456",
    ...overrides,
  };
}

test("metadataAgent", async (t) => {
  const agent = new FakeMetadataAgent();

  await t.test("proposes title from filename when not provided", async () => {
    const artifacts = makeExtractionArtifacts();
    const result = await agent.proposeMetadata(artifacts);

    assert.ok(result.candidates.length > 0, "Should propose at least one candidate");
    const titleCandidate = result.candidates.find((c) => c.fieldType === "title");
    assert.ok(titleCandidate, "Should have a title candidate");
    assert.equal(titleCandidate.proposedValue, "test document");
    assert.ok(titleCandidate.confidence > 0, "Should have positive confidence");
  });

  await t.test("uses provided title when available", async () => {
    const artifacts = makeExtractionArtifacts({ title: "Custom Document Title" });
    const result = await agent.proposeMetadata(artifacts);

    const titleCandidate = result.candidates.find((c) => c.fieldType === "title");
    assert.ok(titleCandidate, "Should have a title candidate");
    assert.equal(titleCandidate.proposedValue, "Custom Document Title");
    assert.ok(titleCandidate.confidence >= 0.9, "Should have high confidence for provided title");
  });

  await t.test("detects document type from content", async () => {
    const artifacts = makeExtractionArtifacts({
      extractedText: "This is a policy document about employee conduct and workplace behavior.",
    });
    const result = await agent.proposeMetadata(artifacts);

    const typeCandidate = result.candidates.find((c) => c.fieldType === "documentType");
    assert.ok(typeCandidate, "Should have a document type candidate");
    assert.equal(typeCandidate.proposedValue, "policy");
  });

  await t.test("detects language from content", async () => {
    const artifacts = makeExtractionArtifacts({
      extractedText: "هذا مستند باللغة العربية يحتوي على سياسات الموظفين",
    });
    const result = await agent.proposeMetadata(artifacts);

    const langCandidate = result.candidates.find((c) => c.fieldType === "language");
    assert.ok(langCandidate, "Should have a language candidate");
    assert.equal(langCandidate.proposedValue, "ar");
  });

  await t.test("detects classification from content", async () => {
    const artifacts = makeExtractionArtifacts({
      extractedText: "This is a confidential document containing proprietary information.",
    });
    const result = await agent.proposeMetadata(artifacts);

    const classCandidate = result.candidates.find((c) => c.fieldType === "classification");
    assert.ok(classCandidate, "Should have a classification candidate");
    assert.equal(classCandidate.proposedValue, "confidential");
  });

  await t.test("proposes tags based on content keywords", async () => {
    const artifacts = makeExtractionArtifacts({
      extractedText: "This document contains financial information about budget planning and expense reports for the quarter.",
    });
    const result = await agent.proposeMetadata(artifacts);

    const tagsCandidate = result.candidates.find((c) => c.fieldType === "tags");
    assert.ok(tagsCandidate, "Should have a tags candidate");
    assert.ok(Array.isArray(tagsCandidate.proposedValue), "Tags should be an array");
    assert.ok((tagsCandidate.proposedValue as string[]).includes("financial"), "Should include financial tag");
  });

  await t.test("calculates overall confidence correctly", async () => {
    const artifacts = makeExtractionArtifacts();
    const result = await agent.proposeMetadata(artifacts);

    assert.ok(result.overallConfidence > 0, "Overall confidence should be positive");
    assert.ok(result.overallConfidence <= 1, "Overall confidence should be at most 1");
  });

  await t.test("marks candidates requiring approval", async () => {
    const artifacts = makeExtractionArtifacts({
      extractedText: "This document has no clear type indicators.",
    });
    const result = await agent.proposeMetadata(artifacts);

    const candidatesRequiringApproval = result.candidates.filter((c) => c.requiresApproval);
    assert.ok(candidatesRequiringApproval.length > 0, "Some candidates should require approval");
  });

  await t.test("generates summary", async () => {
    const artifacts = makeExtractionArtifacts();
    const result = await agent.proposeMetadata(artifacts);

    assert.ok(typeof result.summary === "string", "Summary should be a string");
    assert.ok(result.summary.length > 0, "Summary should not be empty");
    assert.ok(result.summary.includes("test-document.pdf"), "Summary should include filename");
  });

  await t.test("handles documents with existing metadata", async () => {
    const artifacts = makeExtractionArtifacts({
      existingMetadata: {
        title: "Existing Title",
        description: "Existing description",
        tags: ["existing-tag"],
        category: "existing-category",
        department: "hr",
        classification: "internal",
        effectiveDate: new Date("2024-01-01"),
        expiryDate: new Date("2025-01-01"),
      },
    });
    const result = await agent.proposeMetadata(artifacts);

    assert.ok(result.candidates.length > 0, "Should still propose candidates");
  });
});
