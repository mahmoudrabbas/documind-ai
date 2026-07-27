import { describe, test, expect, beforeEach } from "vitest";
import { FakeKeywordIndex } from "../fakeKeywordIndex.js";

describe("FakeKeywordIndex", () => {
  let index: FakeKeywordIndex;

  beforeEach(() => {
    index = new FakeKeywordIndex();
  });

  test("returns NOT_FOUND status when empty", async () => {
    const status = await index.getIndexStatus();
    expect(status.exists).toBe(false);
  });

  test("returns READY after ensureIndex", async () => {
    await index.ensureIndex();
    const status = await index.getIndexStatus();
    expect(status.exists).toBe(true);
    expect(status.status).toBe("READY");
  });

  test("searches by keyword match", async () => {
    await index.indexDocument("c1", "The quick brown fox jumps", {
      tenantId: "t1",
      generationId: "g1",
      documentId: "d1",
    });

    const results = await index.search({
      query: "fox",
      topK: 10,
      tenantId: "t1",
      generationId: "g1",
    });

    expect(results).toHaveLength(1);
    expect(results[0].chunkId).toBe("c1");
    expect(results[0].score).toBeGreaterThan(0);
  });

  test("filters by tenantId", async () => {
    await index.indexDocument("c1", "hello world", {
      tenantId: "t1",
      generationId: "g1",
      documentId: "d1",
    });
    await index.indexDocument("c2", "hello world", {
      tenantId: "t2",
      generationId: "g1",
      documentId: "d1",
    });

    const results = await index.search({
      query: "hello",
      topK: 10,
      tenantId: "t1",
      generationId: "g1",
    });

    expect(results).toHaveLength(1);
    expect(results[0].chunkId).toBe("c1");
  });

  test("filters by documentId", async () => {
    await index.indexDocument("c1", "hello world", {
      tenantId: "t1",
      generationId: "g1",
      documentId: "d1",
    });
    await index.indexDocument("c2", "hello world", {
      tenantId: "t1",
      generationId: "g1",
      documentId: "d2",
    });

    const results = await index.search({
      query: "hello",
      topK: 10,
      tenantId: "t1",
      generationId: "g1",
      filters: { documentId: "d1" },
    });

    expect(results).toHaveLength(1);
    expect(results[0].documentId).toBe("d1");
  });

  test("returns empty for non-matching query", async () => {
    await index.indexDocument("c1", "hello world", {
      tenantId: "t1",
      generationId: "g1",
      documentId: "d1",
    });

    const results = await index.search({
      query: "xyz",
      topK: 10,
      tenantId: "t1",
      generationId: "g1",
    });

    expect(results).toHaveLength(0);
  });

  test("respects topK", async () => {
    for (let i = 0; i < 5; i++) {
      await index.indexDocument(`c${i}`, "hello world test", {
        tenantId: "t1",
        generationId: "g1",
        documentId: "d1",
      });
    }

    const results = await index.search({
      query: "hello",
      topK: 2,
      tenantId: "t1",
      generationId: "g1",
    });

    expect(results).toHaveLength(2);
  });

  test("reset clears all entries", async () => {
    await index.indexDocument("c1", "hello", {
      tenantId: "t1",
      generationId: "g1",
      documentId: "d1",
    });
    index.reset();

    const results = await index.search({
      query: "hello",
      topK: 10,
      tenantId: "t1",
      generationId: "g1",
    });

    expect(results).toHaveLength(0);
  });
});
