import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compileAccessFilters, compileQueryFilters, mergeFilters } from "./filterCompiler.js";
import { FusionEngine } from "./fusionEngine.js";
import type { AccessContext, RetrievalMethod } from "./retrieval.types.js";

// ---------------------------------------------------------------------------
// Filter Compiler
// ---------------------------------------------------------------------------

describe("FilterCompiler", () => {
  describe("compileAccessFilters", () => {
    it("SUPER_ADMIN: tenantId only, no classification restriction", () => {
      const ctx: AccessContext = {
        tenantId: "t1",
        actorId: "a1",
        baseRole: "SUPER_ADMIN",
      };
      const filter = compileAccessFilters(ctx);
      assert.equal(filter.tenantId, "t1");
      assert.equal(filter.allowAiUse, true);
      assert.equal(filter.classification, undefined);
    });

    it("COMPANY_ADMIN: tenantId + classification up to confidential", () => {
      const ctx: AccessContext = {
        tenantId: "t2",
        actorId: "a2",
        baseRole: "COMPANY_ADMIN",
      };
      const filter = compileAccessFilters(ctx);
      assert.deepEqual(filter.classification, {
        $in: ["public", "internal", "confidential"],
      });
    });

    it("EMPLOYEE: tenantId + classification public/internal only", () => {
      const ctx: AccessContext = {
        tenantId: "t3",
        actorId: "a3",
        baseRole: "EMPLOYEE",
      };
      const filter = compileAccessFilters(ctx);
      assert.deepEqual(filter.classification, {
        $in: ["public", "internal"],
      });
    });

    it("EMPLOYEE with department scopes restricts department", () => {
      const ctx: AccessContext = {
        tenantId: "t4",
        actorId: "a4",
        baseRole: "EMPLOYEE",
        permissionScopes: {
          selfOnly: false,
          departmentIds: ["d1", "d2"],
          documentCategories: [],
          documentClassifications: [],
        },
      };
      const filter = compileAccessFilters(ctx);
      assert.deepEqual(filter.department, { $in: ["d1", "d2"] });
    });

    it("EMPLOYEE with category scopes restricts category", () => {
      const ctx: AccessContext = {
        tenantId: "t5",
        actorId: "a5",
        baseRole: "EMPLOYEE",
        permissionScopes: {
          selfOnly: false,
          departmentIds: [],
          documentCategories: ["hr", "finance"],
          documentClassifications: [],
        },
      };
      const filter = compileAccessFilters(ctx);
      assert.deepEqual(filter.category, { $in: ["hr", "finance"] });
    });

    it("explicit permissionScopes override role defaults for classification", () => {
      const ctx: AccessContext = {
        tenantId: "t6",
        actorId: "a6",
        baseRole: "EMPLOYEE",
        permissionScopes: {
          selfOnly: false,
          departmentIds: [],
          documentCategories: [],
          documentClassifications: ["public"],
        },
      };
      const filter = compileAccessFilters(ctx);
      assert.deepEqual(filter.classification, { $in: ["public"] });
    });

    it("empty department/category scopes are not applied", () => {
      const ctx: AccessContext = {
        tenantId: "t7",
        actorId: "a7",
        baseRole: "EMPLOYEE",
        permissionScopes: {
          selfOnly: false,
          departmentIds: [],
          documentCategories: [],
          documentClassifications: [],
        },
      };
      const filter = compileAccessFilters(ctx);
      assert.equal(filter.department, undefined);
      assert.equal(filter.category, undefined);
    });
  });

  describe("compileQueryFilters", () => {
    it("returns empty object when no filter", () => {
      assert.deepEqual(compileQueryFilters(undefined), {});
    });

    it("converts query filter fields to adapter filter shape", () => {
      const result = compileQueryFilters({
        documentIds: ["doc1", "doc2"],
        classifications: ["internal"],
        departments: ["eng"],
        categories: ["policy"],
      });
      assert.deepEqual(result.documentIds, ["doc1", "doc2"]);
      assert.deepEqual(result.classification, { $in: ["internal"] });
      assert.deepEqual(result.department, { $in: ["eng"] });
      assert.deepEqual(result.category, { $in: ["policy"] });
    });
  });

  describe("mergeFilters", () => {
    it("tenantId always from mandatory", () => {
      const mandatory = { tenantId: "t1", allowAiUse: true };
      const query = { tenantId: "t2", documentIds: ["d1"] };
      const merged = mergeFilters(mandatory, query);
      assert.equal(merged.tenantId, "t1");
    });

    it("classification intersects when both present", () => {
      const mandatory = {
        tenantId: "t1",
        classification: { $in: ["public", "internal", "confidential"] },
      };
      const query = { classification: { $in: ["internal", "confidential"] } };
      const merged = mergeFilters(mandatory, query);
      assert.deepEqual(merged.classification, {
        $in: ["internal", "confidential"],
      });
    });

    it("documentIds unions when both present", () => {
      const mandatory = { tenantId: "t1", documentIds: ["a", "b"] };
      const query = { documentIds: ["b", "c"] };
      const merged = mergeFilters(mandatory, query);
      assert.deepEqual(merged.documentIds, ["a", "b", "c"]);
    });

    it("documentVersionId from mandatory wins", () => {
      const mandatory = { tenantId: "t1", documentVersionId: "v1" };
      const query = { documentVersionId: "v2" };
      const merged = mergeFilters(mandatory, query);
      assert.equal(merged.documentVersionId, "v1");
    });

    it("falls back to query when mandatory has no value", () => {
      const mandatory = { tenantId: "t1", allowAiUse: true };
      const query = { classification: { $in: ["public"] } };
      const merged = mergeFilters(mandatory, query);
      assert.deepEqual(merged.classification, { $in: ["public"] });
    });
  });
});

// ---------------------------------------------------------------------------
// Fusion Engine
// ---------------------------------------------------------------------------

describe("FusionEngine", () => {
  it("RRF: two lists merged correctly with default k=60", () => {
    const engine = new FusionEngine();
    const results = new Map<RetrievalMethod, { chunkId: string; score: number }[]>([
      ["vector", [
        { chunkId: "c1", score: 0.9 },
        { chunkId: "c2", score: 0.7 },
      ]],
      ["keyword", [
        { chunkId: "c1", score: 0.8 },
        { chunkId: "c3", score: 0.6 },
      ]],
    ]);
    const fused = engine.fuse(results);

    // c1 appears in both, should have highest score
    assert.equal(fused[0].chunkId, "c1");
    assert.equal(fused.length, 3);

    // Verify c1 has scoreBreakdown with both vector and keyword
    const c1 = fused.find((c) => c.chunkId === "c1");
    assert.ok(c1!.scoreBreakdown!.vectorScore! > 0);
    assert.ok(c1!.scoreBreakdown!.keywordScore! > 0);
  });

  it("passthrough: single method returns without fusion overhead", () => {
    const engine = new FusionEngine();
    const results = new Map<RetrievalMethod, { chunkId: string; score: number }[]>([
      ["vector", [
        { chunkId: "c1", score: 0.9 },
        { chunkId: "c2", score: 0.5 },
      ]],
    ]);
    const fused = engine.fuse(results);
    assert.equal(fused.length, 2);
    assert.equal(fused[0].chunkId, "c1");
    assert.equal(fused[0].score, 0.9);
    assert.equal(fused[0].retrievalMethod, "vector");
  });

  it("empty results returns empty array", () => {
    const engine = new FusionEngine();
    const fused = engine.fuse(new Map());
    assert.deepEqual(fused, []);
  });

  it("respects maxCandidates", () => {
    const engine = new FusionEngine({ maxCandidates: 2 });
    const results = new Map<RetrievalMethod, { chunkId: string; score: number }[]>([
      ["vector", [
        { chunkId: "c1", score: 0.9 },
        { chunkId: "c2", score: 0.7 },
        { chunkId: "c3", score: 0.5 },
      ]],
    ]);
    const fused = engine.fuse(results);
    assert.equal(fused.length, 2);
  });

  it("respects custom rrfK", () => {
    const engineA = new FusionEngine({ rrfK: 1 });
    const engineB = new FusionEngine({ rrfK: 100 });

    const results = new Map<RetrievalMethod, { chunkId: string; score: number }[]>([
      ["vector", [
        { chunkId: "c1", score: 1 },
        { chunkId: "c2", score: 0.9 },
      ]],
      ["keyword", [
        { chunkId: "c2", score: 1 },
        { chunkId: "c1", score: 0.9 },
      ]],
    ]);

    const fusedA = engineA.fuse(results);
    const fusedB = engineB.fuse(results);

    assert.notEqual(fusedA[0].score, fusedB[0].score);
  });

  it("determinism: same input produces same output", () => {
    const engine = new FusionEngine();
    const results = new Map<RetrievalMethod, { chunkId: string; score: number }[]>([
      ["vector", [
        { chunkId: "c1", score: 0.9 },
        { chunkId: "c2", score: 0.7 },
      ]],
      ["keyword", [
        { chunkId: "c1", score: 0.8 },
        { chunkId: "c3", score: 0.6 },
      ]],
    ]);

    const fused1 = engine.fuse(results);
    const fused2 = engine.fuse(results);

    assert.deepEqual(
      fused1.map((c) => ({ chunkId: c.chunkId, score: c.score })),
      fused2.map((c) => ({ chunkId: c.chunkId, score: c.score })),
    );
  });

  it("weighted strategies: weight > 1 gives higher score", () => {
    const engineA = new FusionEngine({
      strategies: [
        { method: "vector", weight: 2 },
        { method: "keyword", weight: 1 },
      ],
    });
    const engineB = new FusionEngine({
      strategies: [
        { method: "vector", weight: 1 },
        { method: "keyword", weight: 1 },
      ],
    });

    const results = new Map<RetrievalMethod, { chunkId: string; score: number }[]>([
      ["vector", [{ chunkId: "c1", score: 1 }]],
      ["keyword", [{ chunkId: "c1", score: 1 }]],
    ]);

    const fusedA = engineA.fuse(results);
    const fusedB = engineB.fuse(results);

    assert.ok(fusedA[0].score > fusedB[0].score);
  });

  it("minScore filters out low-scoring candidates", () => {
    const engine = new FusionEngine({ minScore: 0.01 });
    const results = new Map<RetrievalMethod, { chunkId: string; score: number }[]>([
      ["vector", [{ chunkId: "c1", score: 0.9 }]],
    ]);
    const fused = engine.fuse(results);
    assert.ok(fused[0].score >= 0.01);
  });
});
