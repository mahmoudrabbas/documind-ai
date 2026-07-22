import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FakeVectorStoreAdapter } from "./fakeVectorStoreAdapter.js";
import FakeKeywordAdapter from "./fakeKeywordAdapter.js";
import type { VectorStoreAdapter } from "./vectorStoreAdapter.js";
import type { KeywordAdapter } from "./keywordAdapter.js";
import type { AdapterFilter } from "./adapterFilter.types.js";

// ---------------------------------------------------------------------------
// VectorStoreAdapter contract tests
// ---------------------------------------------------------------------------

function runVectorStoreContract(
  name: string,
  createAdapter: () => VectorStoreAdapter & { _reset(): void },
) {
  describe(name, () => {
    let adapter: VectorStoreAdapter & { _reset(): void };

    beforeEach(() => {
      adapter = createAdapter();
      adapter._reset();
    });

    it("stores and retrieves chunks by vector similarity", async () => {
      await adapter.storeChunks([
        {
          chunkId: "c1",
          vector: [1, 0, 0],
          metadata: { tenantId: "test-tenant", classification: "public" },
        },
        {
          chunkId: "c2",
          vector: [0, 1, 0],
          metadata: { tenantId: "test-tenant", classification: "internal" },
        },
        {
          chunkId: "c3",
          vector: [0, 0, 1],
          metadata: { tenantId: "test-tenant", classification: "confidential" },
        },
      ]);

      const results = await adapter.search({
        vector: [1, 0, 0],
        topK: 3,
        filter: { tenantId: "test-tenant" },
      });

      assert.equal(results.length, 3);
      // c1 is most similar (cosine similarity = 1.0)
      assert.equal(results[0].chunkId, "c1");
      assert.equal(results[0].score, 1.0);
      // c2 and c3 are orthogonal, score = 0.0
      assert.equal(results[1].score, 0.0);
      assert.equal(results[2].score, 0.0);
    });

    it("metadata filter correctly excludes chunks", async () => {
      await adapter.storeChunks([
        {
          chunkId: "c1",
          vector: [1, 0, 0],
          metadata: { tenantId: "test-tenant", classification: "public" },
        },
        {
          chunkId: "c2",
          vector: [0, 1, 0],
          metadata: { tenantId: "test-tenant", classification: "internal" },
        },
        {
          chunkId: "c3",
          vector: [0, 0, 1],
          metadata: { tenantId: "test-tenant", classification: "confidential" },
        },
      ]);

      const results = await adapter.search({
        vector: [1, 0, 0],
        topK: 10,
        filter: {
          tenantId: "test-tenant",
          classification: { $in: ["public"] },
        },
      });

      assert.equal(results.length, 1);
      assert.equal(results[0].chunkId, "c1");
    });

    it("empty store returns empty search results", async () => {
      const results = await adapter.search({
        vector: [1, 0, 0],
        topK: 3,
        filter: { tenantId: "test-tenant" },
      });

      assert.deepEqual(results, []);
    });

    it("deterministic results for same input", async () => {
      await adapter.storeChunks([
        {
          chunkId: "c1",
          vector: [1, 0, 0],
          metadata: { tenantId: "test-tenant" },
        },
        {
          chunkId: "c2",
          vector: [0, 1, 0],
          metadata: { tenantId: "test-tenant" },
        },
        {
          chunkId: "c3",
          vector: [0, 0, 1],
          metadata: { tenantId: "test-tenant" },
        },
      ]);

      const query = {
        vector: [1, 0, 0],
        topK: 3,
        filter: { tenantId: "test-tenant" } as AdapterFilter,
      };

      const first = await adapter.search(query);
      const second = await adapter.search(query);

      assert.equal(first.length, second.length);
      for (let i = 0; i < first.length; i++) {
        assert.equal(first[i].chunkId, second[i].chunkId);
        assert.equal(first[i].score, second[i].score);
      }
    });

    it("topK parameter limits results", async () => {
      await adapter.storeChunks([
        {
          chunkId: "c1",
          vector: [1, 0, 0, 0, 0],
          metadata: { tenantId: "test-tenant" },
        },
        {
          chunkId: "c2",
          vector: [0.9, 0.1, 0, 0, 0],
          metadata: { tenantId: "test-tenant" },
        },
        {
          chunkId: "c3",
          vector: [0.8, 0.2, 0.1, 0, 0],
          metadata: { tenantId: "test-tenant" },
        },
        {
          chunkId: "c4",
          vector: [0.7, 0.3, 0.2, 0.1, 0],
          metadata: { tenantId: "test-tenant" },
        },
        {
          chunkId: "c5",
          vector: [0.6, 0.4, 0.3, 0.2, 0.1],
          metadata: { tenantId: "test-tenant" },
        },
      ]);

      const results = await adapter.search({
        vector: [1, 0, 0, 0, 0],
        topK: 2,
        filter: { tenantId: "test-tenant" },
      });

      assert.equal(results.length, 2);
    });

    it("delete removes chunks from index", async () => {
      await adapter.storeChunks([
        {
          chunkId: "c1",
          vector: [1, 0, 0],
          metadata: { tenantId: "test-tenant", documentId: "doc1" },
        },
        {
          chunkId: "c2",
          vector: [0, 1, 0],
          metadata: { tenantId: "test-tenant", documentId: "doc2" },
        },
        {
          chunkId: "c3",
          vector: [0, 0, 1],
          metadata: { tenantId: "test-tenant", documentId: "doc3" },
        },
      ]);

      await adapter.deleteChunks({
        tenantId: "test-tenant",
        documentIds: ["doc2"],
      });

      const results = await adapter.search({
        vector: [0, 1, 0],
        topK: 10,
        filter: { tenantId: "test-tenant" },
      });

      assert.ok(!results.some((r) => r.chunkId === "c2"));
    });
  });
}

// ---------------------------------------------------------------------------
// KeywordAdapter contract tests
// ---------------------------------------------------------------------------

function runKeywordContract(
  name: string,
  createAdapter: () => KeywordAdapter & { _reset(): void },
) {
  describe(name, () => {
    let adapter: KeywordAdapter & { _reset(): void };

    beforeEach(() => {
      adapter = createAdapter();
      adapter._reset();
    });

    it("stores and retrieves chunks by keyword relevance", async () => {
      await adapter.indexChunks([
        {
          chunkId: "c1",
          text: "employment contract salary terms monthly payment",
          metadata: { tenantId: "test-tenant" },
        },
        {
          chunkId: "c2",
          text: "health insurance benefits annual leave vacation",
          metadata: { tenantId: "test-tenant" },
        },
        {
          chunkId: "c3",
          text: "proprietary information confidential clause restricted",
          metadata: { tenantId: "test-tenant" },
        },
      ]);

      const results = await adapter.search({
        queryText: "salary",
        topK: 3,
        filter: { tenantId: "test-tenant" },
      });

      assert.ok(results.length >= 1);
      // c1 contains "salary", so it should be ranked first
      assert.equal(results[0].chunkId, "c1");
    });

    it("metadata filter correctly excludes chunks", async () => {
      await adapter.indexChunks([
        {
          chunkId: "c1",
          text: "employment contract salary terms monthly payment",
          metadata: { tenantId: "test-tenant" },
        },
        {
          chunkId: "c2",
          text: "health insurance benefits annual leave vacation",
          metadata: { tenantId: "other-tenant" },
        },
      ]);

      const results = await adapter.search({
        queryText: "salary",
        topK: 10,
        filter: { tenantId: "test-tenant" },
      });

      // Only c1 from test-tenant should match
      assert.equal(results.length, 1);
      assert.equal(results[0].chunkId, "c1");
    });

    it("empty store returns empty search results", async () => {
      const results = await adapter.search({
        queryText: "salary",
        topK: 3,
        filter: { tenantId: "test-tenant" },
      });

      assert.deepEqual(results, []);
    });

    it("deterministic results for same input", async () => {
      await adapter.indexChunks([
        {
          chunkId: "c1",
          text: "employment contract salary terms monthly payment",
          metadata: { tenantId: "test-tenant" },
        },
        {
          chunkId: "c2",
          text: "health insurance benefits annual leave vacation",
          metadata: { tenantId: "test-tenant" },
        },
        {
          chunkId: "c3",
          text: "proprietary information confidential clause restricted",
          metadata: { tenantId: "test-tenant" },
        },
      ]);

      const query = {
        queryText: "salary",
        topK: 3,
        filter: { tenantId: "test-tenant" } as AdapterFilter,
      };

      const first = await adapter.search(query);
      const second = await adapter.search(query);

      assert.equal(first.length, second.length);
      for (let i = 0; i < first.length; i++) {
        assert.equal(first[i].chunkId, second[i].chunkId);
        assert.equal(first[i].score, second[i].score);
      }
    });

    it("topK parameter limits results", async () => {
      await adapter.indexChunks([
        {
          chunkId: "c1",
          text: "employment contract salary terms payment",
          metadata: { tenantId: "test-tenant" },
        },
        {
          chunkId: "c2",
          text: "health insurance benefits annual leave",
          metadata: { tenantId: "test-tenant" },
        },
        {
          chunkId: "c3",
          text: "proprietary information confidential clause",
          metadata: { tenantId: "test-tenant" },
        },
        {
          chunkId: "c4",
          text: "employment policy contract hybrid remote",
          metadata: { tenantId: "test-tenant" },
        },
        {
          chunkId: "c5",
          text: "performance review quarterly benefits goals",
          metadata: { tenantId: "test-tenant" },
        },
      ]);

      // "employment" appears in c1 and c4 → enough for topK=2
      const results = await adapter.search({
        queryText: "employment",
        topK: 2,
        filter: { tenantId: "test-tenant" },
      });

      assert.equal(results.length, 2);
    });

    it("delete removes chunks from index", async () => {
      await adapter.indexChunks([
        {
          chunkId: "c1",
          text: "employment contract salary terms monthly payment",
          metadata: { tenantId: "test-tenant", documentId: "doc1" },
        },
        {
          chunkId: "c2",
          text: "health insurance benefits annual leave vacation",
          metadata: { tenantId: "test-tenant", documentId: "doc2" },
        },
        {
          chunkId: "c3",
          text: "proprietary information confidential clause restricted",
          metadata: { tenantId: "test-tenant", documentId: "doc3" },
        },
      ]);

      await adapter.removeChunks({
        tenantId: "test-tenant",
        documentIds: ["doc2"],
      });

      const results = await adapter.search({
        queryText: "vacation",
        topK: 10,
        filter: { tenantId: "test-tenant" },
      });

      // c2 had "vacation" and was removed → no results
      assert.equal(results.length, 0);
    });
  });
}

// ---------------------------------------------------------------------------
// Run contracts against fake adapters
// ---------------------------------------------------------------------------

runVectorStoreContract("FakeVectorStoreAdapter", () => {
  return new FakeVectorStoreAdapter();
});

runKeywordContract("FakeKeywordAdapter", () => {
  return new FakeKeywordAdapter();
});
