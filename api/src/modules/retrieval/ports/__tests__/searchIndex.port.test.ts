import { describe, test, expect } from "vitest";
import { FakeVectorIndex } from "../../../../providers/vector-index/fakeVectorIndex.js";
import { FakeKeywordIndex } from "../../../../providers/keyword-index/fakeKeywordIndex.js";
import type { VectorIndex } from "../../../../providers/vector-index/vectorIndex.port.js";
import type { KeywordIndex } from "../../../../providers/keyword-index/keywordIndex.port.js";

describe("search-index port contract", () => {
  describe("VectorIndex contract", () => {
    test("FakeVectorIndex implements VectorIndex interface", () => {
      const index: VectorIndex = new FakeVectorIndex();
      expect(typeof index.search).toBe("function");
      expect(typeof index.ensureIndex).toBe("function");
      expect(typeof index.getIndexStatus).toBe("function");
      expect(typeof index.indexName).toBe("string");
    });

    test("search returns VectorSearchResult[]", async () => {
      const index = new FakeVectorIndex();
      await index.upsertVector("c1", [1, 0, 0], {
        tenantId: "t1",
        generationId: "g1",
        documentId: "d1",
        text: "test",
        sectionPath: [],
        pageStart: 1,
        pageEnd: 1,
        contentType: "paragraph",
        language: "en",
      });

      const results = await index.search({
        vector: [1, 0, 0],
        topK: 5,
        tenantId: "t1",
        generationId: "g1",
      });

      expect(Array.isArray(results)).toBe(true);
      for (const r of results) {
        expect(typeof r.chunkId).toBe("string");
        expect(typeof r.documentId).toBe("string");
        expect(typeof r.generationId).toBe("string");
        expect(typeof r.similarityScore).toBe("number");
        expect(typeof r.text).toBe("string");
        expect(Array.isArray(r.sectionPath)).toBe(true);
        expect(typeof r.pageStart).toBe("number");
        expect(typeof r.pageEnd).toBe("number");
        expect(typeof r.contentType).toBe("string");
        expect(typeof r.language).toBe("string");
      }
    });
  });

  describe("KeywordIndex contract", () => {
    test("FakeKeywordIndex implements KeywordIndex interface", () => {
      const index: KeywordIndex = new FakeKeywordIndex();
      expect(typeof index.search).toBe("function");
      expect(typeof index.ensureIndex).toBe("function");
      expect(typeof index.getIndexStatus).toBe("function");
    });

    test("search returns KeywordSearchResult[]", async () => {
      const index = new FakeKeywordIndex();
      await index.indexDocument("c1", "hello world", {
        tenantId: "t1",
        generationId: "g1",
        documentId: "d1",
        text: "hello world",
        sectionPath: [],
        pageStart: 1,
        pageEnd: 1,
        contentType: "paragraph",
        language: "en",
      });

      const results = await index.search({
        query: "hello",
        topK: 5,
        tenantId: "t1",
        generationId: "g1",
      });

      expect(Array.isArray(results)).toBe(true);
      for (const r of results) {
        expect(typeof r.chunkId).toBe("string");
        expect(typeof r.documentId).toBe("string");
        expect(typeof r.generationId).toBe("string");
        expect(typeof r.score).toBe("number");
        expect(typeof r.text).toBe("string");
        expect(typeof r.pageStart).toBe("number");
        expect(typeof r.pageEnd).toBe("number");
      }
    });
  });
});
