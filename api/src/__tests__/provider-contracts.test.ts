import { describe, test, expect } from "vitest";
import { FakeEmbeddingProvider } from "../providers/embedding/fakeEmbeddingProvider.js";
import { FakeVectorIndex } from "../providers/vector-index/fakeVectorIndex.js";
import { FakeKeywordIndex } from "../providers/keyword-index/fakeKeywordIndex.js";

describe("EmbeddingProvider contract — FakeEmbeddingProvider", () => {
  test("produces vectors of correct dimensionality", async () => {
    const provider = new FakeEmbeddingProvider(128);
    const results = await provider.embedBatch([
      { chunkId: "c1", text: "Hello world", idempotencyKey: "k1" },
    ]);
    expect(results.length).toBe(1);
    expect(results[0].vector.length).toBe(128);
  });

  test("is deterministic for same input", async () => {
    const provider = new FakeEmbeddingProvider(64);
    const input = { chunkId: "c1", text: "Test text", idempotencyKey: "k1" };
    const r1 = await provider.embedBatch([input]);
    const r2 = await provider.embedBatch([input]);
    expect(r1[0].vector).toEqual(r2[0].vector);
  });

  test("different inputs produce different vectors", async () => {
    const provider = new FakeEmbeddingProvider(64);
    const results = await provider.embedBatch([
      { chunkId: "c1", text: "Text A", idempotencyKey: "k1" },
      { chunkId: "c2", text: "Text B", idempotencyKey: "k2" },
    ]);
    expect(results[0].vector).not.toEqual(results[1].vector);
  });

  test("reports model metadata", () => {
    const provider = new FakeEmbeddingProvider();
    expect(provider.name).toBe("fake");
    expect(provider.model).toBeTruthy();
    expect(provider.dimensions).toBeGreaterThan(0);
  });

  test("tracks embed calls for test assertions", async () => {
    const provider = new FakeEmbeddingProvider(32);
    provider.reset();
    expect(provider.getEmbedCalls().length).toBe(0);
    await provider.embedBatch([
      { chunkId: "c1", text: "A", idempotencyKey: "k1" },
      { chunkId: "c2", text: "B", idempotencyKey: "k2" },
    ]);
    expect(provider.getEmbedCalls().length).toBe(2);
  });

  test("handles empty batch", async () => {
    const provider = new FakeEmbeddingProvider(32);
    const results = await provider.embedBatch([]);
    expect(results).toEqual([]);
  });

  test("returns token usage and cost", async () => {
    const provider = new FakeEmbeddingProvider(32, 0.0001);
    const results = await provider.embedBatch([
      { chunkId: "c1", text: "Some text with multiple words here", idempotencyKey: "k1" },
    ]);
    expect(results[0].tokenUsage).toBeGreaterThan(0);
    expect(results[0].costUsd).toBeGreaterThan(0);
  });
});

describe("VectorIndex contract — FakeVectorIndex", () => {
  test("search returns empty before any vectors are inserted", async () => {
    const index = new FakeVectorIndex();
    const results = await index.search({
      vector: new Array(32).fill(0.1),
      tenantId: "t1",
      generationId: "g1",
      topK: 10,
    });
    expect(results).toEqual([]);
  });

  test("search respects tenant isolation", async () => {
    const index = new FakeVectorIndex();
    await index.upsertVector("c1", [1, 0, 0], { tenantId: "t1", generationId: "g1", text: "doc" });
    await index.upsertVector("c2", [1, 0, 0], { tenantId: "t2", generationId: "g1", text: "doc" });

    const results = await index.search({
      vector: [1, 0, 0],
      tenantId: "t1",
      generationId: "g1",
      topK: 10,
    });
    expect(results.length).toBe(1);
    expect(results[0].chunkId).toBe("c1");
  });

  test("search respects generation isolation", async () => {
    const index = new FakeVectorIndex();
    await index.upsertVector("c1", [1, 0, 0], { tenantId: "t1", generationId: "g1", text: "old" });
    await index.upsertVector("c2", [1, 0, 0], { tenantId: "t1", generationId: "g2", text: "new" });

    const results = await index.search({
      vector: [1, 0, 0],
      tenantId: "t1",
      generationId: "g2",
      topK: 10,
    });
    expect(results.length).toBe(1);
    expect(results[0].generationId).toBe("g2");
  });

  test("search respects topK limit", async () => {
    const index = new FakeVectorIndex();
    for (let i = 0; i < 20; i++) {
      await index.upsertVector(`c${i}`, [1, 0, 0], { tenantId: "t1", generationId: "g1", text: `doc${i}` });
    }
    const results = await index.search({
      vector: [1, 0, 0],
      tenantId: "t1",
      generationId: "g1",
      topK: 5,
    });
    expect(results.length).toBe(5);
  });

  test("deleteByGeneration removes only matching vectors", async () => {
    const index = new FakeVectorIndex();
    await index.upsertVector("c1", [1, 0, 0], { tenantId: "t1", generationId: "g1" });
    await index.upsertVector("c2", [1, 0, 0], { tenantId: "t1", generationId: "g2" });
    await index.deleteByGeneration("t1", "g1");

    const results = await index.search({
      vector: [1, 0, 0],
      tenantId: "t1",
      generationId: "g1",
      topK: 10,
    });
    expect(results.length).toBe(0);

    const remaining = await index.search({
      vector: [1, 0, 0],
      tenantId: "t1",
      generationId: "g2",
      topK: 10,
    });
    expect(remaining.length).toBe(1);
  });

  test("getIndexStatus reports unknown before ensureIndex", async () => {
    const index = new FakeVectorIndex();
    const status = await index.getIndexStatus();
    expect(status.exists).toBe(false);
    expect(status.status).toBe("UNKNOWN");
  });

  test("getIndexStatus reports ready after ensureIndex", async () => {
    const index = new FakeVectorIndex();
    await index.ensureIndex(128);
    const status = await index.getIndexStatus();
    expect(status.exists).toBe(true);
    expect(status.status).toBe("READY");
  });
});

describe("KeywordIndex contract — FakeKeywordIndex", () => {
  test("search returns empty before any documents are indexed", async () => {
    const index = new FakeKeywordIndex();
    const results = await index.search({
      query: "test",
      tenantId: "t1",
      generationId: "g1",
      topK: 10,
    });
    expect(results).toEqual([]);
  });

  test("search respects tenant isolation", async () => {
    const index = new FakeKeywordIndex();
    await index.indexDocument("c1", "Contract terms and conditions", { tenantId: "t1", generationId: "g1" });
    await index.indexDocument("c2", "Contract terms and conditions", { tenantId: "t2", generationId: "g1" });

    const results = await index.search({
      query: "contract",
      tenantId: "t1",
      generationId: "g1",
      topK: 10,
    });
    expect(results.length).toBe(1);
    expect(results[0].chunkId).toBe("c1");
  });

  test("search respects generation isolation", async () => {
    const index = new FakeKeywordIndex();
    await index.indexDocument("c1", "old version text", { tenantId: "t1", generationId: "g1" });
    await index.indexDocument("c2", "new version text", { tenantId: "t1", generationId: "g2" });

    const results = await index.search({
      query: "version",
      tenantId: "t1",
      generationId: "g2",
      topK: 10,
    });
    expect(results.length).toBe(1);
    expect(results[0].generationId).toBe("g2");
  });

  test("search respects topK limit", async () => {
    const index = new FakeKeywordIndex();
    for (let i = 0; i < 15; i++) {
      await index.indexDocument(`c${i}`, "unique keyword match", { tenantId: "t1", generationId: "g1" });
    }
    const results = await index.search({
      query: "keyword",
      tenantId: "t1",
      generationId: "g1",
      topK: 5,
    });
    expect(results.length).toBe(5);
  });

  test("search returns results sorted by score descending", async () => {
    const index = new FakeKeywordIndex();
    await index.indexDocument("c1", "test", { tenantId: "t1", generationId: "g1" });
    await index.indexDocument("c2", "test test test", { tenantId: "t1", generationId: "g1" });

    const results = await index.search({
      query: "test",
      tenantId: "t1",
      generationId: "g1",
      topK: 10,
    });
    expect(results.length).toBe(2);
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });

  test("getIndexStatus reports unknown before ensureIndex", async () => {
    const index = new FakeKeywordIndex();
    const status = await index.getIndexStatus();
    expect(status.exists).toBe(false);
  });

  test("getIndexStatus reports ready after ensureIndex", async () => {
    const index = new FakeKeywordIndex();
    await index.ensureIndex();
    const status = await index.getIndexStatus();
    expect(status.exists).toBe(true);
    expect(status.status).toBe("READY");
  });
});
