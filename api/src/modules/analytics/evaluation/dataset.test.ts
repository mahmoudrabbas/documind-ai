import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadEvaluationDataset, MIN_DATASET_CASES, validateEvaluationDataset } from "./dataset.js";
import type { EvaluationDataset } from "./dataset.js";

describe("evaluation dataset", () => {
  const dataset = loadEvaluationDataset();

  it(`contains at least ${MIN_DATASET_CASES} synthetic cases`, () => {
    assert.ok(dataset.cases.length >= MIN_DATASET_CASES, `expected >= ${MIN_DATASET_CASES}, got ${dataset.cases.length}`);
  });

  it("declares a schema version and description", () => {
    assert.equal(typeof dataset.schemaVersion, "string");
    assert.ok(dataset.schemaVersion.length > 0);
    assert.equal(typeof dataset.description, "string");
  });

  it("uses unique case ids", () => {
    const ids = dataset.cases.map((entry) => entry.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("every case is self-contained with inline evidence", () => {
    for (const entry of dataset.cases) {
      assert.ok(entry.question.trim().length > 0, `${entry.id}: question`);
      assert.ok(entry.groundTruthAnswer.trim().length > 0, `${entry.id}: groundTruthAnswer`);
      assert.ok(entry.evidenceChunks.length > 0, `${entry.id}: evidenceChunks`);
      for (const chunk of entry.evidenceChunks) {
        assert.ok(chunk.text.trim().length > 0, `${entry.id}: chunk text`);
        assert.ok(chunk.documentId.trim().length > 0, `${entry.id}: chunk documentId`);
        assert.ok(chunk.documentTitle.trim().length > 0, `${entry.id}: chunk documentTitle`);
        assert.ok(chunk.chunkId.trim().length > 0, `${entry.id}: chunk chunkId`);
      }
    }
  });

  it("every case declares expected topics and documents", () => {
    for (const entry of dataset.cases) {
      assert.ok(entry.expectedTopics.length > 0, `${entry.id}: expectedTopics`);
      assert.ok(entry.expectedDocuments.length > 0, `${entry.id}: expectedDocuments`);
    }
  });

  it("validation rejects duplicate ids", () => {
    const bad = structuredClone(dataset);
    (bad as EvaluationDataset).cases[1]!.id = (bad as EvaluationDataset).cases[0]!.id;
    assert.throws(() => validateEvaluationDataset(bad), /Duplicate evaluation case id/);
  });

  it("validation rejects datasets with fewer than the minimum cases", () => {
    assert.throws(
      () => validateEvaluationDataset({ schemaVersion: "1.0.0", description: "x", cases: dataset.cases.slice(0, MIN_DATASET_CASES - 1) }),
      /expected at least/,
    );
  });

  it("validation rejects a case without evidence", () => {
    const bad = structuredClone(dataset);
    (bad as EvaluationDataset).cases[0]!.evidenceChunks = [];
    assert.throws(() => validateEvaluationDataset(bad), /missing evidenceChunks/);
  });
});
