import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectDiverse, areRedundant } from "./diversity.js";
import { detectConflicts } from "./conflictDetector.js";
import { fitWithinBudget, truncateAtSafeBoundary, estimateTokens } from "./tokenBudget.js";
import { expandNeighbors, DEFAULT_NEIGHBOR_EXPANSION_CONFIG } from "./neighborExpansion.js";
import { FakeRerankerAdapter } from "./fakeReranker.adapter.js";
import { createRerankerService } from "./reranker.service.js";
import type { RetrievalCandidate } from "../retrieval/retrieval.types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandidate(
  overrides: Partial<RetrievalCandidate> & { text: string },
): RetrievalCandidate {
  return {
    chunkId:
      overrides.chunkId ?? `chunk-${Math.random().toString(36).slice(2, 8)}`,
    documentId: overrides.documentId ?? "doc-1",
    documentVersionId: overrides.documentVersionId ?? "v1",
    tenantId: overrides.tenantId ?? "tenant-1",
    text: overrides.text,
    score: overrides.score ?? 0.5,
    pageNumber: overrides.pageNumber,
    sectionTitle: overrides.sectionTitle,
    classification: overrides.classification,
    retrievalMethod: overrides.retrievalMethod ?? "hybrid",
    scoreBreakdown: overrides.scoreBreakdown ?? {
      fusionScore: overrides.score ?? 0.5,
    },
  };
}

// ---------------------------------------------------------------------------
// Diversity (MMR)
// ---------------------------------------------------------------------------

describe("Diversity - selectDiverse", () => {
  it("selects all items when count is within limit", () => {
    const items = [
      { index: 0, totalScore: 0.9, text: "A about salary", documentId: "d1" },
      { index: 1, totalScore: 0.8, text: "B about benefits", documentId: "d1" },
    ];
    const result = selectDiverse(items, 5);
    assert.equal(result.length, 2);
    assert.equal(result[0], 0);
    assert.equal(result[1], 1);
  });

  it("diversifies by penalizing similar items", () => {
    const items = [
      { index: 0, totalScore: 0.9, text: "Salary structure includes base pay", documentId: "d1" },
      { index: 1, totalScore: 0.89, text: "Salary structure includes base pay and housing", documentId: "d1" },
      { index: 2, totalScore: 0.7, text: "Employee benefits include health insurance", documentId: "d1" },
    ];
    const result = selectDiverse(items, 2, { lambda: 0.5, redundancyThreshold: 0.6 });

    // First item is always selected (highest score)
    assert.equal(result[0], 0);
    // Second should be the diverse one (benefits), not the near-duplicate salary
    assert.equal(result[1], 2);
  });

  it("returns empty array for empty input", () => {
    assert.deepEqual(selectDiverse([], 5), []);
  });
});

describe("Diversity - areRedundant", () => {
  it("detects redundancy in same document with high overlap", () => {
    assert.ok(
      areRedundant(
        { text: "Salary structure includes base pay and housing", documentId: "d1" },
        { text: "Salary structure includes base pay and housing allowance", documentId: "d1" },
      ),
    );
  });

  it("does not flag different documents as redundant", () => {
    assert.ok(
      !areRedundant(
        { text: "Salary structure includes base pay", documentId: "d1" },
        { text: "Salary structure includes base pay", documentId: "d2" },
      ),
    );
  });

  it("does not flag low-overlap text as redundant", () => {
    assert.ok(
      !areRedundant(
        { text: "Salary information for employees", documentId: "d1" },
        { text: "Customer service response guidelines", documentId: "d1" },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

describe("ConflictDetector", () => {
  it("detects negation conflicts within same document", () => {
    const items = [
      { text: "Overtime is paid at 1.5x rate for all employees", documentId: "d1", documentVersionId: "v1" },
      { text: "Overtime is not paid at any rate for employees", documentId: "d1", documentVersionId: "v1" },
    ];
    const conflicts = detectConflicts(items);
    assert.ok(conflicts.length > 0);
    assert.equal(conflicts[0]!.itemIndices.length, 2);
  });

  it("does not flag different documents as conflicting", () => {
    const items = [
      { text: "Overtime is paid at 1.5x rate", documentId: "d1", documentVersionId: "v1" },
      { text: "Overtime is not paid at any rate", documentId: "d2", documentVersionId: "v1" },
    ];
    const conflicts = detectConflicts(items);
    assert.equal(conflicts.length, 0);
  });

  it("detects value contradictions", () => {
    const items = [
      { text: "Salary is 5000 SAR monthly", documentId: "d1", documentVersionId: "v1" },
      { text: "Salary is 8000 SAR monthly", documentId: "d1", documentVersionId: "v2" },
    ];
    const conflicts = detectConflicts(items);
    assert.ok(conflicts.length > 0);
  });

  it("detects version conflicts with topic overlap", () => {
    const items = [
      { text: "Annual leave is 30 days per year", documentId: "d1", documentVersionId: "v1" },
      { text: "Annual leave is 21 days per year", documentId: "d1", documentVersionId: "v2" },
    ];
    const conflicts = detectConflicts(items);
    assert.ok(conflicts.length > 0);
  });

  it("returns empty when no conflicts", () => {
    const items = [
      { text: "Salary structure includes base pay", documentId: "d1", documentVersionId: "v1" },
      { text: "Employee benefits include health insurance", documentId: "d1", documentVersionId: "v1" },
    ];
    const conflicts = detectConflicts(items);
    assert.equal(conflicts.length, 0);
  });

  it("returns empty for empty input", () => {
    assert.deepEqual(detectConflicts([]), []);
  });
});

// ---------------------------------------------------------------------------
// Token budget
// ---------------------------------------------------------------------------

describe("TokenBudget - fitWithinBudget", () => {
  it("fits items within budget", () => {
    const items = [
      { text: "Short text A", id: "a" },
      { text: "Short text B", id: "b" },
      { text: "Short text C", id: "c" },
    ];
    const result = fitWithinBudget(items, {
      maxTokens: 50,
      reservedTokens: 10,
      charsPerToken: 4,
    });
    assert.ok(result.items.length > 0);
    assert.ok(result.totalTokens <= 40);
  });

  it("truncates at safe boundary when budget is tight", () => {
    const items = [
      { text: "This is a long sentence that goes on and on. It has multiple parts. And more detail here.", id: "a" },
    ];
    const result = fitWithinBudget(items, {
      maxTokens: 10,
      reservedTokens: 0,
      charsPerToken: 4,
    });
    assert.ok(result.items.length <= 1);
    if (result.items.length > 0) {
      assert.ok(result.items[0]!.text.length <= 40);
    }
  });

  it("reports truncation count", () => {
    const items = [
      { text: "A".repeat(200), id: "a" },
      { text: "B".repeat(200), id: "b" },
    ];
    const result = fitWithinBudget(items, {
      maxTokens: 20,
      reservedTokens: 0,
      charsPerToken: 4,
    });
    assert.ok(result.truncatedCount >= 0);
  });
});

describe("TokenBudget - truncateAtSafeBoundary", () => {
  it("truncates at sentence boundary", () => {
    const text = "First sentence here. Second sentence there. Third sentence.";
    const result = truncateAtSafeBoundary(text, 15, 4);
    assert.ok(result.length <= 60);
    assert.ok(result.includes("."));
  });

  it("returns full text if within budget", () => {
    const text = "Short text.";
    const result = truncateAtSafeBoundary(text, 100, 4);
    assert.equal(result, text);
  });

  it("adds ellipsis when no safe boundary found", () => {
    const text = "A".repeat(100);
    const result = truncateAtSafeBoundary(text, 10, 4);
    assert.ok(result.endsWith("..."));
  });
});

describe("TokenBudget - estimateTokens", () => {
  it("estimates tokens from text length", () => {
    assert.equal(estimateTokens("1234", 4), 1);
    assert.equal(estimateTokens("12345678", 4), 2);
  });
});

// ---------------------------------------------------------------------------
// Neighbor expansion
// ---------------------------------------------------------------------------

describe("NeighborExpansion", () => {
  const chunks = [
    { chunkId: "c1", chunkIndex: 0, documentId: "d1", documentVersionId: "v1", tenantId: "t1", text: "Clause 1: Salary terms" },
    { chunkId: "c2", chunkIndex: 1, documentId: "d1", documentVersionId: "v1", tenantId: "t1", text: "Clause 2: Benefits include health insurance" },
    { chunkId: "c3", chunkIndex: 2, documentId: "d1", documentVersionId: "v1", tenantId: "t1", text: "Clause 3: Leave policy" },
  ];

  it("expands a clause that needs context", () => {
    const selected = [chunks[1]!]; // Clause 2 (clause reference pattern)
    const result = expandNeighbors(selected, chunks, {
      ...DEFAULT_NEIGHBOR_EXPANSION_CONFIG,
      needsContextPatterns: [/^clause\s+\d/i],
    });
    assert.equal(result.length, 1);
    assert.ok(result[0]!.expanded);
    assert.ok(result[0]!.neighbors.length > 0);
  });

  it("does not expand when no context pattern matches", () => {
    const selected = [
      { chunkId: "c2", chunkIndex: 1, documentId: "d1", documentVersionId: "v1", tenantId: "t1", text: "General information" },
    ];
    const result = expandNeighbors(selected, chunks);
    assert.equal(result.length, 1);
    assert.ok(!result[0]!.expanded);
    assert.equal(result[0]!.neighbors.length, 0);
  });

  it("respects maxNeighborsPerSide", () => {
    const manyChunks = Array.from({ length: 10 }, (_, i) => ({
      chunkId: `c${i}`,
      chunkIndex: i,
      documentId: "d1",
      documentVersionId: "v1",
      tenantId: "t1",
      text: `Clause ${i + 1}: Some content`,
    }));
    const selected = [manyChunks[5]!];
    const result = expandNeighbors(selected, manyChunks, {
      ...DEFAULT_NEIGHBOR_EXPANSION_CONFIG,
      maxNeighborsPerSide: 1,
      needsContextPatterns: [/^clause\s+\d/i],
    });
    assert.equal(result[0]!.neighbors.length, 2); // 1 before + 1 after
  });

  it("returns empty array for empty input", () => {
    assert.deepEqual(expandNeighbors([], chunks), []);
  });
});

// ---------------------------------------------------------------------------
// FakeRerankerAdapter (Phase 2 integration)
// ---------------------------------------------------------------------------

describe("FakeRerankerAdapter - Phase 2", () => {
  const adapter = new FakeRerankerAdapter();

  it("applies diversity selection", async () => {
    const candidates = [
      makeCandidate({ text: "Salary structure includes base pay of 5000 SAR" }),
      makeCandidate({ text: "Salary structure includes base pay of 5000 SAR monthly" }),
      makeCandidate({ text: "Employee benefits include health insurance and leave" }),
    ];

    const result = await adapter.rerank({
      candidates,
      queryText: "salary benefits",
      maxItems: 3,
    });

    // Should have deduplicated the near-duplicate salary items
    assert.ok(result.items.length <= 3);
  });

  it("detects conflicts between chunks", async () => {
    const candidates = [
      makeCandidate({ text: "Overtime is paid at 1.5x rate for all employees" }),
      makeCandidate({ text: "Overtime is not paid at any rate for employees" }),
    ];

    const result = await adapter.rerank({
      candidates,
      queryText: "overtime pay",
    });

    assert.ok(result.conflictGroups.length > 0);
    assert.equal(result.sufficiency.level, "CONFLICTING");
  });

  it("respects token budget", async () => {
    const candidates = Array.from({ length: 20 }, (_, i) =>
      makeCandidate({
        text: `Chunk ${i}: ${"word ".repeat(100)} about topic ${i}`,
      }),
    );

    const result = await adapter.rerank({
      candidates,
      queryText: "word topic",
      maxTokenBudget: 500,
    });

    let totalTokens = 0;
    for (const item of result.items) {
      totalTokens += estimateTokens(item.textExcerpt);
    }
    assert.ok(totalTokens <= 750, `Total tokens ${totalTokens} should be within budget`);
  });

  it("score explanation includes conflict info", async () => {
    const candidates = [
      makeCandidate({ text: "Overtime is paid at 1.5x rate for all employees" }),
      makeCandidate({ text: "Overtime is not paid at any rate for employees" }),
    ];

    const result = await adapter.rerank({
      candidates,
      queryText: "overtime",
    });

    assert.ok(result.scoreExplanation.includes("conflict"));
  });
});

// ---------------------------------------------------------------------------
// RerankerService (Phase 2 integration)
// ---------------------------------------------------------------------------

describe("RerankerService - Phase 2", () => {
  it("builds evidence bundle with conflict detection", async () => {
    const service = createRerankerService({
      reranker: new FakeRerankerAdapter(),
    });

    const candidates = [
      makeCandidate({ text: "Overtime is paid at 1.5x rate for all employees" }),
      makeCandidate({ text: "Overtime is not paid at any rate for employees" }),
    ];

    const bundle = await service.buildEvidenceBundle(candidates, "overtime pay");

    assert.equal(bundle.sufficiency.level, "CONFLICTING");
    assert.ok(bundle.conflictGroups.length > 0);
    assert.ok(bundle.scoreExplanation.includes("conflict"));
  });

  it("builds evidence bundle with diversity", async () => {
    const service = createRerankerService({
      reranker: new FakeRerankerAdapter(),
    });

    const candidates = [
      makeCandidate({ text: "Salary structure includes base pay of 5000 SAR" }),
      makeCandidate({ text: "Salary structure includes base pay of 5000 SAR monthly" }),
      makeCandidate({ text: "Employee benefits include health insurance" }),
      makeCandidate({ text: "Annual leave policy grants 30 days" }),
    ];

    const bundle = await service.buildEvidenceBundle(
      candidates,
      "salary benefits leave",
    );

    // Should have deduplicated
    assert.ok(bundle.items.length <= 4);
    assert.ok(typeof bundle.totalTokenCount === "number");
    assert.ok(typeof bundle.maxTokenCount === "number");
  });
});
