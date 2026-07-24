import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { InMemoryMetricRecorder } from "../../common/observability/metricRecorder.js";
import { createRerankerService } from "./reranker.service.js";
import { FakeRerankerAdapter } from "./fakeReranker.adapter.js";
import type { RerankerAdapter, RerankRequest, RerankResponse } from "./reranker.types.js";
import type { RetrievalCandidate } from "../retrieval/retrieval.types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandidate(
  overrides: Partial<RetrievalCandidate> & { text: string },
): RetrievalCandidate {
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
    scoreBreakdown: overrides.scoreBreakdown ?? { fusionScore: overrides.score ?? 0.5 },
  };
}

class ThrowingRerankerAdapter implements RerankerAdapter {
  readonly providerKey = "throwing";
  async rerank(_request: RerankRequest): Promise<RerankResponse> {
    throw new Error("Simulated provider outage");
  }
}

// ---------------------------------------------------------------------------
// Metrics recording
// ---------------------------------------------------------------------------

describe("RerankerService - Phase 3: Metrics", () => {
  it("records metrics when MetricRecorder is provided", async () => {
    const metrics = new InMemoryMetricRecorder();
    const service = createRerankerService({
      reranker: new FakeRerankerAdapter(),
      metrics,
    });

    const candidates = [
      makeCandidate({ text: "Salary is 5000 SAR monthly" }),
      makeCandidate({ text: "Benefits include health insurance" }),
    ];

    await service.buildEvidenceBundle(candidates, "salary", "trace-123");

    // Should have recorded invoker metric
    const invoked = metrics.metrics.filter((m) => m.name === "reranker.invoked");
    assert.ok(invoked.length > 0);
    assert.equal(invoked[0]!.tags?.provider, "fake");
    assert.equal(invoked[0]!.tags?.traceId, "trace-123");

    // Should have recorded latency
    const latency = metrics.metrics.filter((m) => m.name === "reranker.latency_ms");
    assert.ok(latency.length > 0);
    assert.ok(typeof latency[0]!.value === "number");
    assert.ok(latency[0]!.value >= 0);

    // Should have recorded input candidates
    const inputMetric = metrics.metrics.filter((m) => m.name === "reranker.input_candidates");
    assert.ok(inputMetric.length > 0);
    assert.equal(inputMetric[0]!.value, 2);

    // Should have recorded output items
    const outputMetric = metrics.metrics.filter((m) => m.name === "reranker.output_items");
    assert.ok(outputMetric.length > 0);
    assert.ok(outputMetric[0]!.value >= 1);
  });

  it("records fallback metric when adapter throws", async () => {
    const metrics = new InMemoryMetricRecorder();
    const service = createRerankerService({
      reranker: new ThrowingRerankerAdapter(),
      metrics,
    });

    const candidates = [
      makeCandidate({ text: "Salary info" }),
    ];

    await service.buildEvidenceBundle(candidates, "salary", "trace-fallback");

    const fallback = metrics.metrics.filter((m) => m.name === "reranker.fallback_used");
    assert.ok(fallback.length > 0);
    assert.equal(fallback[0]!.tags?.traceId, "trace-fallback");
  });

  it("does not record metrics when MetricRecorder is not provided", async () => {
    const service = createRerankerService({
      reranker: new FakeRerankerAdapter(),
    });

    const candidates = [
      makeCandidate({ text: "Salary info" }),
    ];

    // Should not throw
    const bundle = await service.buildEvidenceBundle(candidates, "salary");
    assert.ok(bundle.items.length > 0);
  });
});

// ---------------------------------------------------------------------------
// Fallback behavior
// ---------------------------------------------------------------------------

describe("RerankerService - Phase 3: Fallback", () => {
  it("returns fallback bundle when adapter throws", async () => {
    const service = createRerankerService({
      reranker: new ThrowingRerankerAdapter(),
    });

    const candidates = [
      makeCandidate({ text: "Salary is 5000 SAR monthly", documentId: "d1" }),
      makeCandidate({ text: "Benefits include health insurance", documentId: "d2" }),
    ];

    const bundle = await service.buildEvidenceBundle(candidates, "salary");

    // Should return all candidates in fallback order
    assert.equal(bundle.items.length, 2);
    assert.equal(bundle.sufficiency.level, "WEAK");
    assert.ok(bundle.sufficiency.reasons.some((r) => r.includes("fallback")));
    assert.ok(bundle.scoreExplanation.includes("Fallback"));
    assert.equal(bundle.conflictGroups.length, 0);
  });

  it("fallback bundle preserves citation anchors", async () => {
    const service = createRerankerService({
      reranker: new ThrowingRerankerAdapter(),
    });

    const candidates = [
      makeCandidate({
        text: "Salary info",
        documentId: "d1",
        documentVersionId: "v2",
        pageNumber: 5,
        sectionTitle: "Compensation",
      }),
    ];

    const bundle = await service.buildEvidenceBundle(candidates, "salary");

    assert.equal(bundle.items.length, 1);
    assert.equal(bundle.items[0]!.citationAnchor.documentId, "d1");
    assert.equal(bundle.items[0]!.citationAnchor.documentVersionId, "v2");
    assert.equal(bundle.items[0]!.citationAnchor.pageNumber, 5);
    assert.equal(bundle.items[0]!.citationAnchor.sectionTitle, "Compensation");
  });

  it("fallback bundle includes token count", async () => {
    const service = createRerankerService({
      reranker: new ThrowingRerankerAdapter(),
    });

    const candidates = [
      makeCandidate({ text: "A".repeat(400) }),
    ];

    const bundle = await service.buildEvidenceBundle(candidates, "test");

    assert.ok(bundle.totalTokenCount > 0);
    assert.equal(bundle.maxTokenCount, 0);
  });
});

// ---------------------------------------------------------------------------
// Input candidate count and traceId
// ---------------------------------------------------------------------------

describe("RerankerService - Phase 3: Bundle metadata", () => {
  it("includes inputCandidateCount in bundle", async () => {
    const service = createRerankerService({
      reranker: new FakeRerankerAdapter(),
    });

    const candidates = [
      makeCandidate({ text: "A" }),
      makeCandidate({ text: "B" }),
      makeCandidate({ text: "C" }),
    ];

    const bundle = await service.buildEvidenceBundle(candidates, "query");

    assert.equal(bundle.inputCandidateCount, 3);
  });

  it("includes accessPolicyVersion and createdAt", async () => {
    const service = createRerankerService({
      reranker: new FakeRerankerAdapter(),
    });

    const bundle = await service.buildEvidenceBundle(
      [makeCandidate({ text: "test" })],
      "query",
    );

    assert.equal(bundle.accessPolicyVersion, "1.0.0");
    assert.ok(bundle.createdAt);
    assert.ok(new Date(bundle.createdAt).getTime() > 0);
  });

  it("traceId defaults to unknown when not provided", async () => {
    const metrics = new InMemoryMetricRecorder();
    const service = createRerankerService({
      reranker: new FakeRerankerAdapter(),
      metrics,
    });

    await service.buildEvidenceBundle(
      [makeCandidate({ text: "test" })],
      "query",
    );

    const invoked = metrics.metrics.filter((m) => m.name === "reranker.invoked");
    assert.ok(invoked.length > 0);
    assert.equal(invoked[0]!.tags?.traceId, "unknown");
  });
});

// ---------------------------------------------------------------------------
// Reduction ratio metric
// ---------------------------------------------------------------------------

describe("RerankerService - Phase 3: Reduction ratio", () => {
  it("records reduction ratio in metrics", async () => {
    const metrics = new InMemoryMetricRecorder();
    const service = createRerankerService({
      reranker: new FakeRerankerAdapter(),
      metrics,
    });

    // 5 candidates, some duplicates — should reduce
    const candidates = [
      makeCandidate({ text: "Salary is 5000 SAR monthly for employees" }),
      makeCandidate({ text: "Salary is 5000 SAR monthly for employees" }),
      makeCandidate({ text: "Benefits include health insurance for staff" }),
      makeCandidate({ text: "Annual leave is 30 days per year" }),
      makeCandidate({ text: "Working hours are 8 hours per day" }),
    ];

    await service.buildEvidenceBundle(candidates, "salary");

    const ratio = metrics.metrics.filter((m) => m.name === "reranker.reduction_ratio");
    assert.ok(ratio.length > 0);
    assert.ok(typeof ratio[0]!.value === "number");
    assert.ok(ratio[0]!.value > 0);
    assert.ok(ratio[0]!.value <= 1);
  });
});
