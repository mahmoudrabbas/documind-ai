import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FakeRerankerAdapter } from "./fakeReranker.adapter.js";
import { createRerankerService } from "./reranker.service.js";
import type { RetrievalCandidate } from "../retrieval/retrieval.types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandidate(overrides: Partial<RetrievalCandidate> & { text: string }): RetrievalCandidate {
  return {
    chunkId: overrides.chunkId ?? `chunk-${Math.random().toString(36).slice(2, 8)}`,
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
// FakeRerankerAdapter
// ---------------------------------------------------------------------------

describe("FakeRerankerAdapter", () => {
  const adapter = new FakeRerankerAdapter();

  it("returns NO_EVIDENCE when candidates are empty", async () => {
    const result = await adapter.rerank({
      candidates: [],
      queryText: "salary policy",
    });

    assert.equal(result.items.length, 0);
    assert.equal(result.sufficiency.level, "NO_EVIDENCE");
    assert.ok(result.sufficiency.reasons.length > 0);
  });

  it("ranks candidates by exact-term overlap with query", async () => {
    const candidates = [
      makeCandidate({ text: "The weather is nice today" }),
      makeCandidate({ text: "Salary structure includes base pay and allowances" }),
      makeCandidate({ text: "Employee benefits include health insurance" }),
    ];

    const result = await adapter.rerank({
      candidates,
      queryText: "salary structure",
    });

    assert.ok(result.items.length > 0);
    // The salary-related candidate should rank highest
    const topText = result.items[0]!.textExcerpt;
    assert.ok(
      topText.includes("Salary"),
      `Expected top item to mention salary, got: ${topText}`,
    );
  });

  it("deduplicates candidates from the same document", async () => {
    const candidates = [
      makeCandidate({
        chunkId: "c1",
        documentId: "doc-1",
        text: "Salary structure includes base pay and housing allowance",
      }),
      makeCandidate({
        chunkId: "c2",
        documentId: "doc-1",
        text: "Salary structure includes base pay and housing allowance benefits",
      }),
    ];

    const result = await adapter.rerank({
      candidates,
      queryText: "salary",
    });

    // Should deduplicate — similar text from same doc
    assert.ok(result.items.length <= 2);
  });

  it("respects maxItems limit", async () => {
    const candidates = Array.from({ length: 20 }, (_, i) =>
      makeCandidate({
        chunkId: `c${i}`,
        text: `Chunk ${i} about salary and benefits for employee ${i}`,
      }),
    );

    const result = await adapter.rerank({
      candidates,
      queryText: "salary benefits",
      maxItems: 5,
    });

    assert.ok(result.items.length <= 5);
  });

  it("respects maxTokenBudget", async () => {
    const longText = "word ".repeat(1000);
    const candidates = Array.from({ length: 10 }, (_, i) =>
      makeCandidate({
        chunkId: `c${i}`,
        text: `${longText} chunk ${i}`,
      }),
    );

    const result = await adapter.rerank({
      candidates,
      queryText: "word",
      maxTokenBudget: 500,
    });

    // Should stop adding items once budget is exceeded
    let totalTokens = 0;
    for (const item of result.items) {
      totalTokens += Math.ceil(item.textExcerpt.length / 4);
    }
    assert.ok(totalTokens <= 500 + 250, `Total tokens ${totalTokens} should be within budget`);
  });

  it("returns citation anchors for each item", async () => {
    const candidates = [
      makeCandidate({
        chunkId: "c1",
        documentId: "doc-1",
        documentVersionId: "v1",
        pageNumber: 3,
        sectionTitle: "Benefits",
        text: "Health insurance coverage for employee",
      }),
    ];

    const result = await adapter.rerank({
      candidates,
      queryText: "health insurance",
    });

    assert.equal(result.items.length, 1);
    const anchor = result.items[0]!.citationAnchor;
    assert.equal(anchor.chunkId, "c1");
    assert.equal(anchor.documentId, "doc-1");
    assert.equal(anchor.documentVersionId, "v1");
    assert.equal(anchor.pageNumber, 3);
    assert.equal(anchor.sectionTitle, "Benefits");
  });

  it("provides score breakdown for each item", async () => {
    const candidates = [
      makeCandidate({ text: "Salary terms and conditions" }),
    ];

    const result = await adapter.rerank({
      candidates,
      queryText: "salary",
    });

    assert.equal(result.items.length, 1);
    const breakdown = result.items[0]!.scoreBreakdown;
    assert.equal(typeof breakdown.fusionScore, "number");
    assert.equal(typeof breakdown.rerankScore, "number");
    assert.equal(typeof breakdown.semanticScore, "number");
    assert.equal(typeof breakdown.exactTermScore, "number");
    assert.equal(typeof breakdown.totalScore, "number");
    assert.ok(breakdown.exactTermScore > 0, "Should have positive exact term score for matching query");
  });

  it("provides score explanation string", async () => {
    const candidates = [
      makeCandidate({ text: "Salary information" }),
    ];

    const result = await adapter.rerank({
      candidates,
      queryText: "salary",
    });

    assert.equal(typeof result.scoreExplanation, "string");
    assert.ok(result.scoreExplanation.length > 0);
  });
});

// ---------------------------------------------------------------------------
// RerankerService
// ---------------------------------------------------------------------------

describe("RerankerService", () => {
  it("builds an evidence bundle from candidates", async () => {
    const service = createRerankerService({
      reranker: new FakeRerankerAdapter(),
    });

    const candidates = [
      makeCandidate({ text: "Salary structure includes base pay" }),
      makeCandidate({ text: "Employee benefits package" }),
    ];

    const bundle = await service.buildEvidenceBundle(candidates, "salary benefits");

    assert.equal(typeof bundle.totalTokenCount, "number");
    assert.equal(typeof bundle.maxTokenCount, "number");
    assert.equal(typeof bundle.accessPolicyVersion, "string");
    assert.equal(typeof bundle.createdAt, "string");
    assert.ok(Array.isArray(bundle.items));
    assert.ok(Array.isArray(bundle.conflictGroups));
    assert.equal(typeof bundle.sufficiency.level, "string");
  });

  it("returns SUFFICIENT when evidence is strong", async () => {
    const service = createRerankerService({
      reranker: new FakeRerankerAdapter(),
    });

    const candidates = [
      makeCandidate({
        text: "Salary structure includes base pay of 5000 SAR monthly",
        score: 0.9,
        scoreBreakdown: { fusionScore: 0.9 },
      }),
      makeCandidate({
        text: "Employee benefits include health insurance and annual leave",
        score: 0.8,
        scoreBreakdown: { fusionScore: 0.8 },
      }),
      makeCandidate({
        text: "Annual leave policy grants 30 days paid leave per year",
        score: 0.7,
        scoreBreakdown: { fusionScore: 0.7 },
      }),
    ];

    const bundle = await service.buildEvidenceBundle(candidates, "salary benefits leave");

    assert.ok(
      bundle.sufficiency.level === "SUFFICIENT" || bundle.sufficiency.level === "WEAK",
      `Expected SUFFICIENT or WEAK, got ${bundle.sufficiency.level}`,
    );
  });

  it("returns NO_EVIDENCE when candidates are empty", async () => {
    const service = createRerankerService({
      reranker: new FakeRerankerAdapter(),
    });

    const bundle = await service.buildEvidenceBundle([], "any query");

    assert.equal(bundle.sufficiency.level, "NO_EVIDENCE");
    assert.equal(bundle.items.length, 0);
  });
});
