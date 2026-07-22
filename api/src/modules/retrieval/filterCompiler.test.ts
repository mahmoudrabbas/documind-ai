import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AdapterFilter } from "../../providers/embedding/adapterFilter.types.js";
import type { AccessContext, RetrievalFilter } from "./retrieval.types.js";
import {
  compileAccessFilters,
  compileQueryFilters,
  mergeFilters,
} from "./filterCompiler.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ctx(overrides: Partial<AccessContext>): AccessContext {
  return {
    tenantId: "t1",
    actorId: "actor-1",
    baseRole: "EMPLOYEE",
    ...overrides,
  };
}

function scopes(overrides: Record<string, unknown> = {}) {
  return {
    selfOnly: false,
    departmentIds: [],
    documentCategories: [],
    documentClassifications: [],
    ...overrides,
  };
}

// =========================================================================
// compileAccessFilters
// =========================================================================

describe("compileAccessFilters", () => {
  it("always sets tenantId and allowAiUse", () => {
    const f = compileAccessFilters(ctx({}));
    assert.equal(f.tenantId, "t1");
    assert.equal(f.allowAiUse, true);
  });

  it("EMPLOYEE sees public and internal by default", () => {
    const f = compileAccessFilters(ctx({ baseRole: "EMPLOYEE" }));
    assert.deepEqual(f.classification, { $in: ["public", "internal"] });
  });

  it("COMPANY_ADMIN sees all three levels by default", () => {
    const f = compileAccessFilters(ctx({ baseRole: "COMPANY_ADMIN" }));
    assert.deepEqual(f.classification, {
      $in: ["public", "internal", "confidential"],
    });
  });

  it("SUPER_ADMIN has no classification restriction", () => {
    const f = compileAccessFilters(ctx({ baseRole: "SUPER_ADMIN" }));
    assert.equal(f.classification, undefined);
  });

  it("explicit permission scopes override role defaults", () => {
    const f = compileAccessFilters(
      ctx({
        baseRole: "COMPANY_ADMIN",
        permissionScopes: scopes({ documentClassifications: ["confidential"] }),
      })
    );
    assert.deepEqual(f.classification, { $in: ["confidential"] });
  });

  it("empty permissionScopes falls back to role defaults", () => {
    const f = compileAccessFilters(
      ctx({
        baseRole: "EMPLOYEE",
        permissionScopes: scopes({ documentClassifications: [] }),
      })
    );
    assert.deepEqual(f.classification, { $in: ["public", "internal"] });
  });

  it("adds department filter when scope present", () => {
    const f = compileAccessFilters(
      ctx({
        permissionScopes: scopes({ departmentIds: ["d1", "d2"] }),
      })
    );
    assert.deepEqual(f.department, { $in: ["d1", "d2"] });
  });

  it("does NOT add department filter when scope is empty array", () => {
    const f = compileAccessFilters(
      ctx({
        permissionScopes: scopes({ departmentIds: [] }),
      })
    );
    assert.equal(f.department, undefined);
  });

  it("adds category filter when scope present", () => {
    const f = compileAccessFilters(
      ctx({
        permissionScopes: scopes({ documentCategories: ["finance", "hr"] }),
      })
    );
    assert.deepEqual(f.category, { $in: ["finance", "hr"] });
  });

  it("does NOT add category filter when scope is empty array", () => {
    const f = compileAccessFilters(
      ctx({
        permissionScopes: scopes({ documentCategories: [] }),
      })
    );
    assert.equal(f.category, undefined);
  });

  it("does NOT include documentIds or documentVersionId", () => {
    const f = compileAccessFilters(ctx({}));
    assert.equal(f.documentIds, undefined);
    assert.equal(f.documentVersionId, undefined);
  });

  it("selfOnly does NOT appear as a filter field (handled at query layer)", () => {
    const f = compileAccessFilters(
      ctx({
        permissionScopes: scopes({ selfOnly: true }),
      })
    );
    // selfOnly is NOT an AdapterFilter field — it's handled in the service layer
    const keys = Object.keys(f);
    assert.equal(keys.includes("selfOnly"), false);
  });

  it("combines all scope types together", () => {
    const f = compileAccessFilters(
      ctx({
        baseRole: "COMPANY_ADMIN",
        permissionScopes: scopes({
          documentClassifications: ["confidential"],
          departmentIds: ["d1"],
          documentCategories: ["finance"],
        }),
      })
    );
    assert.deepEqual(f.classification, { $in: ["confidential"] });
    assert.deepEqual(f.department, { $in: ["d1"] });
    assert.deepEqual(f.category, { $in: ["finance"] });
  });
});

// =========================================================================
// compileQueryFilters
// =========================================================================

describe("compileQueryFilters", () => {
  it("returns empty object when no filter provided", () => {
    const f = compileQueryFilters(undefined);
    assert.deepEqual(f, {});
  });

  it("converts documentIds", () => {
    const f = compileQueryFilters({ documentIds: ["doc1", "doc2"] });
    assert.deepEqual(f.documentIds, ["doc1", "doc2"]);
  });

  it("converts classifications to $in", () => {
    const f = compileQueryFilters({ classifications: ["public"] });
    assert.deepEqual(f.classification, { $in: ["public"] });
  });

  it("converts departments to $in", () => {
    const f = compileQueryFilters({ departments: ["d3"] });
    assert.deepEqual(f.department, { $in: ["d3"] });
  });

  it("converts categories to $in", () => {
    const f = compileQueryFilters({ categories: ["legal"] });
    assert.deepEqual(f.category, { $in: ["legal"] });
  });

  it("converts all fields together", () => {
    const f = compileQueryFilters({
      documentIds: ["d1"],
      classifications: ["internal"],
      departments: ["dept1"],
      categories: ["cat1"],
    });
    assert.deepEqual(f, {
      documentIds: ["d1"],
      classification: { $in: ["internal"] },
      department: { $in: ["dept1"] },
      category: { $in: ["cat1"] },
    });
  });

  it("omits empty arrays", () => {
    const f = compileQueryFilters({
      documentIds: [],
      classifications: [],
      departments: [],
      categories: [],
    });
    assert.deepEqual(f, {});
  });

  it("does NOT set tenantId or allowAiUse (those are access-level only)", () => {
    const f = compileQueryFilters({ documentIds: ["d1"] });
    assert.equal(f.tenantId, undefined);
    assert.equal(f.allowAiUse, undefined);
  });
});

// =========================================================================
// mergeFilters
// =========================================================================

describe("mergeFilters", () => {
  const mandatory: AdapterFilter = {
    tenantId: "t1",
    allowAiUse: true,
    classification: { $in: ["public", "internal"] },
  };

  it("tenantId always comes from mandatory", () => {
    const m = mergeFilters({ ...mandatory, tenantId: "t-mand" }, {});
    assert.equal(m.tenantId, "t-mand");
  });

  it("allowAiUse from mandatory wins over query", () => {
    const m = mergeFilters(
      { ...mandatory, allowAiUse: true },
      { allowAiUse: false }
    );
    assert.equal(m.allowAiUse, true);
  });

  it("allowAiUse falls back to query when mandatory is undefined", () => {
    const m = mergeFilters({ tenantId: "t1" }, { allowAiUse: false });
    assert.equal(m.allowAiUse, false);
  });

  it("documentVersionId from mandatory wins", () => {
    const m = mergeFilters(
      { ...mandatory, documentVersionId: "v1" },
      { documentVersionId: "v2" }
    );
    assert.equal(m.documentVersionId, "v1");
  });

  it("documentVersionId falls back to query when mandatory is undefined", () => {
    const m = mergeFilters({ tenantId: "t1" }, { documentVersionId: "v2" });
    assert.equal(m.documentVersionId, "v2");
  });

  describe("classification intersection", () => {
    it("uses mandatory only when query has none", () => {
      const m = mergeFilters(mandatory, {});
      assert.deepEqual(m.classification, { $in: ["public", "internal"] });
    });

    it("uses query only when mandatory has none (SUPER_ADMIN)", () => {
      const m = mergeFilters(
        { tenantId: "t1", allowAiUse: true },
        { classification: { $in: ["confidential"] } }
      );
      assert.deepEqual(m.classification, { $in: ["confidential"] });
    });

    it("intersects when both are present", () => {
      const m = mergeFilters(mandatory, {
        classification: { $in: ["internal", "confidential"] },
      });
      // intersection of ["public","internal"] and ["internal","confidential"] = ["internal"]
      assert.deepEqual(m.classification, { $in: ["internal"] });
    });

    it("returns empty $in when intersection is empty", () => {
      const m = mergeFilters(mandatory, {
        classification: { $in: ["confidential"] },
      });
      // intersection of ["public","internal"] and ["confidential"] = []
      assert.deepEqual(m.classification, { $in: [] });
    });
  });

  describe("department intersection", () => {
    it("intersects departments when both present", () => {
      const m = mergeFilters(
        { ...mandatory, department: { $in: ["d1", "d2"] } },
        { department: { $in: ["d2", "d3"] } }
      );
      assert.deepEqual(m.department, { $in: ["d2"] });
    });
  });

  describe("category intersection", () => {
    it("intersects categories when both present", () => {
      const m = mergeFilters(
        { ...mandatory, category: { $in: ["cat-a", "cat-b"] } },
        { category: { $in: ["cat-b", "cat-c"] } }
      );
      assert.deepEqual(m.category, { $in: ["cat-b"] });
    });
  });

  describe("documentIds union", () => {
    it("uses mandatory only when query has none", () => {
      const m = mergeFilters({ ...mandatory, documentIds: ["doc1"] }, {});
      assert.deepEqual(m.documentIds, ["doc1"]);
    });

    it("uses query only when mandatory has none", () => {
      const m = mergeFilters(mandatory, { documentIds: ["doc2"] });
      assert.deepEqual(m.documentIds, ["doc2"]);
    });

    it("unions when both are present", () => {
      const m = mergeFilters(
        { ...mandatory, documentIds: ["doc1", "doc2"] },
        { documentIds: ["doc2", "doc3"] }
      );
      assert.deepEqual(m.documentIds, ["doc1", "doc2", "doc3"]);
    });

    it("no duplicates in union", () => {
      const m = mergeFilters(
        { ...mandatory, documentIds: ["doc1"] },
        { documentIds: ["doc1"] }
      );
      assert.deepEqual(m.documentIds, ["doc1"]);
    });
  });
});
