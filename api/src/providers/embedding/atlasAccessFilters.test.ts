import assert from "node:assert/strict";
import test from "node:test";
import { buildAtlasKeywordCompoundFilter, buildAtlasKeywordSearchStage } from "./atlasKeywordSearchAdapter.js";
import { buildAtlasVectorFilter } from "./atlasVectorStoreAdapter.js";

const tenantId = "64a000000000000000000001";

test("Atlas vector prefilter uses stable fields and never allowAiUse metadata", () => {
  const filter = buildAtlasVectorFilter({ tenantId, allowAiUse: true, category: { $in: ["policies"] } });
  assert.equal(filter.tenantId.toString(), tenantId);
  assert.deepEqual(filter.category, { $in: ["policies"] });
  assert.equal(filter.allowAiUse, undefined);
});

test("Atlas keyword prefilter uses stable fields and never allowAiUse metadata", () => {
  const filter = buildAtlasKeywordCompoundFilter({
    tenantId,
    allowAiUse: true,
    classification: { $in: ["public", "internal"] },
    department: { $in: ["security"] },
  });
  assert.ok(filter.some((clause) => JSON.stringify(clause).includes('"path":"tenantId"')));
  assert.ok(filter.some((clause) => JSON.stringify(clause).includes('"text":{"path":"classification"')));
  assert.ok(filter.some((clause) => JSON.stringify(clause).includes('"text":{"path":"department"')));
  assert.ok(filter.every((clause) => !JSON.stringify(clause).includes('"in":{"path":"classification"')));
  assert.ok(filter.every((clause) => !JSON.stringify(clause).includes('"path":"allowAiUse"')));
});

test("Atlas keyword stage has one compound operator with text in must", () => {
  const stage = buildAtlasKeywordSearchStage("protected value", { tenantId, allowAiUse: false });
  assert.equal(stage.index, "kidx_chunk_text_v1");
  assert.deepEqual(stage.compound.must, [{ text: { query: "protected value", path: "text" } }]);
  assert.ok(!JSON.stringify(stage).includes('"path":"allowAiUse"'));
});
