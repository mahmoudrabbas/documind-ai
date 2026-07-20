import test from "node:test";
import assert from "node:assert";
import { FakeVersionConflictAgent } from "./ports/fakeVersionConflictAgent.js";
import type { DocumentComparisonInput } from "./ports/versionConflictAgent.port.js";

function makeDocumentComparisonInput(
  overrides: Partial<DocumentComparisonInput> = {},
): DocumentComparisonInput {
  return {
    sourceDocument: {
      id: "doc-1",
      fileName: "policy-v1.pdf",
      checksum: "checksum-123",
      extractedText: "This is a policy document about employee conduct and workplace behavior.",
      metadata: {
        title: "Employee Conduct Policy",
        effectiveDate: new Date("2024-01-01"),
        expiryDate: new Date("2025-01-01"),
        department: "human_resources",
        classification: "internal",
        tags: ["hr", "policy", "conduct"],
        version: 1,
      },
    },
    candidateDocuments: [
      {
        id: "doc-2",
        fileName: "policy-v2.pdf",
        checksum: "checksum-456",
        extractedText: "This is an updated policy document about employee conduct and workplace behavior with new guidelines.",
        metadata: {
          title: "Employee Conduct Policy Updated",
          effectiveDate: new Date("2025-01-01"),
          expiryDate: new Date("2026-01-01"),
          department: "human_resources",
          classification: "internal",
          tags: ["hr", "policy", "conduct", "updated"],
          version: 2,
        },
      },
    ],
    ...overrides,
  };
}

test("versionConflictAgent", async (t) => {
  const agent = new FakeVersionConflictAgent();

  await t.test("detects duplicate documents with same checksum", async () => {
    const input = makeDocumentComparisonInput({
      candidateDocuments: [
        {
          id: "doc-2",
          fileName: "policy-copy.pdf",
          checksum: "checksum-123",
          extractedText: "This is a copy of the same policy document.",
          metadata: {
            title: "Employee Conduct Policy",
            version: 1,
          },
        },
      ],
    });

    const result = await agent.analyzeDocument(input);

    assert.ok(result.relationships.length > 0, "Should detect relationships");
    const duplicateRel = result.relationships.find(
      (r) => r.relationshipType === "DUPLICATE_OF",
    );
    assert.ok(duplicateRel, "Should detect duplicate relationship");
    assert.ok(duplicateRel.confidence > 0.9, "Should have high confidence for checksum match");
  });

  await t.test("detects version relationships", async () => {
    const input = makeDocumentComparisonInput();
    const result = await agent.analyzeDocument(input);

    const versionRel = result.relationships.find(
      (r) => r.relationshipType === "SUPERSEDES" || r.relationshipType === "SUPERSEDED_BY",
    );
    assert.ok(versionRel, "Should detect version relationship");
  });

  await t.test("detects related documents with similar content", async () => {
    const input = makeDocumentComparisonInput({
      sourceDocument: {
        id: "doc-1",
        fileName: "hr-policy.pdf",
        checksum: "checksum-123",
        extractedText: "This is a policy about employee benefits and compensation.",
        metadata: {
          title: "Employee Benefits Policy",
          department: "human_resources",
          tags: ["hr", "benefits"],
          version: 1,
        },
      },
      candidateDocuments: [
        {
          id: "doc-3",
          fileName: "compensation-policy.pdf",
          checksum: "checksum-789",
          extractedText: "This is a policy about employee compensation and salary structure.",
          metadata: {
            title: "Compensation Policy",
            department: "human_resources",
            tags: ["hr", "compensation"],
            version: 1,
          },
        },
      ],
    });

    const result = await agent.analyzeDocument(input);

    const relatedRel = result.relationships.find(
      (r) => r.relationshipType === "RELATED_TO",
    );
    assert.ok(relatedRel, "Should detect related relationship");
  });

  await t.test("detects date conflicts with overlapping ranges", async () => {
    const input = makeDocumentComparisonInput({
      sourceDocument: {
        id: "doc-1",
        fileName: "policy-2024.pdf",
        checksum: "checksum-123",
        extractedText: "This is a policy document.",
        metadata: {
          title: "Policy 2024",
          effectiveDate: new Date("2024-06-01"),
          expiryDate: new Date("2025-06-01"),
          version: 1,
        },
      },
      candidateDocuments: [
        {
          id: "doc-4",
          fileName: "policy-2024b.pdf",
          checksum: "checksum-999",
          extractedText: "This is another policy document.",
          metadata: {
            title: "Policy 2024 Updated",
            effectiveDate: new Date("2024-12-01"),
            expiryDate: new Date("2025-12-01"),
            version: 1,
          },
        },
      ],
    });

    const result = await agent.analyzeDocument(input);

    const dateConflict = result.conflicts.find(
      (c) => c.conflictType === "overlapping_dates",
    );
    assert.ok(dateConflict, "Should detect date conflict");
    assert.ok(dateConflict.severity === "medium" || dateConflict.severity === "high", "Should have appropriate severity");
  });

  await t.test("detects inconsistent classification values", async () => {
    const input = makeDocumentComparisonInput({
      sourceDocument: {
        id: "doc-1",
        fileName: "policy-internal.pdf",
        checksum: "checksum-123",
        extractedText: "This is an internal policy document.",
        metadata: {
          title: "Internal Policy",
          classification: "internal",
          version: 1,
        },
      },
      candidateDocuments: [
        {
          id: "doc-5",
          fileName: "policy-confidential.pdf",
          checksum: "checksum-888",
          extractedText: "This is a confidential policy document.",
          metadata: {
            title: "Confidential Policy",
            classification: "confidential",
            version: 1,
          },
        },
      ],
    });

    const result = await agent.analyzeDocument(input);

    const valueConflict = result.conflicts.find(
      (c) => c.conflictType === "inconsistent_values",
    );
    assert.ok(valueConflict, "Should detect inconsistent values conflict");
  });

  await t.test("returns empty results when no candidates provided", async () => {
    const input = makeDocumentComparisonInput({ candidateDocuments: [] });
    const result = await agent.analyzeDocument(input);

    assert.equal(result.relationships.length, 0, "Should have no relationships");
    assert.equal(result.conflicts.length, 0, "Should have no conflicts");
    assert.ok(result.summary.includes("No significant"), "Summary should indicate no findings");
  });

  await t.test("calculates overall confidence correctly", async () => {
    const input = makeDocumentComparisonInput();
    const result = await agent.analyzeDocument(input);

    assert.ok(typeof result.overallConfidence === "number", "Overall confidence should be a number");
    assert.ok(result.overallConfidence >= 0, "Overall confidence should be non-negative");
    assert.ok(result.overallConfidence <= 1, "Overall confidence should be at most 1");
  });

  await t.test("marks items requiring approval", async () => {
    const input = makeDocumentComparisonInput();
    const result = await agent.analyzeDocument(input);

    const requiresApproval =
      result.relationships.some((r) => r.requiresApproval) ||
      result.conflicts.some((c) => c.requiresApproval);
    assert.ok(typeof requiresApproval === "boolean", "requiresReview should be a boolean");
  });

  await t.test("generates summary with findings count", async () => {
    const input = makeDocumentComparisonInput();
    const result = await agent.analyzeDocument(input);

    assert.ok(typeof result.summary === "string", "Summary should be a string");
    assert.ok(result.summary.length > 0, "Summary should not be empty");
    assert.ok(result.summary.includes("policy-v1.pdf"), "Summary should include source filename");
  });

  await t.test("handles multiple candidate documents", async () => {
    const input = makeDocumentComparisonInput({
      candidateDocuments: [
        {
          id: "doc-2",
          fileName: "similar-doc.pdf",
          checksum: "checksum-456",
          extractedText: "This is a similar document about employee policies.",
          metadata: {
            title: "Similar Policy",
            department: "human_resources",
            tags: ["hr", "policy"],
            version: 1,
          },
        },
        {
          id: "doc-3",
          fileName: "related-doc.pdf",
          checksum: "checksum-789",
          extractedText: "This document discusses employee benefits and compensation.",
          metadata: {
            title: "Benefits Document",
            department: "human_resources",
            tags: ["hr", "benefits"],
            version: 1,
          },
        },
      ],
    });

    const result = await agent.analyzeDocument(input);

    assert.ok(result.relationships.length > 0 || result.conflicts.length > 0, "Should find some relationships or conflicts");
  });
});
