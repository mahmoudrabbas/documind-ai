import { describe, test, expect, beforeEach } from "vitest";
import { FakeVectorIndex } from "../fakeVectorIndex.js";

describe("FakeVectorIndex", () => {
  let index: FakeVectorIndex;

  beforeEach(() => {
    index = new FakeVectorIndex();
  });

  test("returns NOT_FOUND status when empty", async () => {
    const status = await index.getIndexStatus();
    expect(status.exists).toBe(false);
    expect(status.status).toBe("UNKNOWN");
  });

  test("returns READY status after ensureIndex", async () => {
    await index.ensureIndex(1536);
    const status = await index.getIndexStatus();
    expect(status.exists).toBe(true);
    expect(status.status).toBe("READY");
  });

  test("stores and retrieves vectors by tenant", async () => {
    await index.upsertVector("c1", [1, 0, 0], {
      tenantId: "t1",
      generationId: "g1",
      documentId: "d1",
      text: "hello",
    });

    const results = await index.search({
      vector: [1, 0, 0],
      topK: 10,
      tenantId: "t1",
      generationId: "g1",
    });

    expect(results).toHaveLength(1);
    expect(results[0].chunkId).toBe("c1");
    expect(results[0].similarityScore).toBeCloseTo(1.0);
  });

  test("filters by tenantId", async () => {
    await index.upsertVector("c1", [1, 0, 0], {
      tenantId: "t1",
      generationId: "g1",
      documentId: "d1",
    });
    await index.upsertVector("c2", [1, 0, 0], {
      tenantId: "t2",
      generationId: "g1",
      documentId: "d1",
    });

    const results = await index.search({
      vector: [1, 0, 0],
      topK: 10,
      tenantId: "t1",
      generationId: "g1",
    });

    expect(results).toHaveLength(1);
    expect(results[0].chunkId).toBe("c1");
  });

  test("filters by documentId", async () => {
    await index.upsertVector("c1", [1, 0, 0], {
      tenantId: "t1",
      generationId: "g1",
      documentId: "d1",
    });
    await index.upsertVector("c2", [1, 0, 0], {
      tenantId: "t1",
      generationId: "g1",
      documentId: "d2",
    });

    const results = await index.search({
      vector: [1, 0, 0],
      topK: 10,
      tenantId: "t1",
      generationId: "g1",
      filters: { documentId: "d1" },
    });

    expect(results).toHaveLength(1);
    expect(results[0].documentId).toBe("d1");
  });

  test("respects topK limit", async () => {
    for (let i = 0; i < 10; i++) {
      await index.upsertVector(`c${i}`, [1, 0, 0], {
        tenantId: "t1",
        generationId: "g1",
        documentId: "d1",
      });
    }

    const results = await index.search({
      vector: [1, 0, 0],
      topK: 3,
      tenantId: "t1",
      generationId: "g1",
    });

    expect(results).toHaveLength(3);
  });

  test("ranks by similarity score", async () => {
    await index.upsertVector("c_far", [0, 1, 0], {
      tenantId: "t1",
      generationId: "g1",
      documentId: "d1",
      text: "far",
    });
    await index.upsertVector("c_close", [1, 0, 0], {
      tenantId: "t1",
      generationId: "g1",
      documentId: "d1",
      text: "close",
    });

    const results = await index.search({
      vector: [1, 0, 0],
      topK: 10,
      tenantId: "t1",
      generationId: "g1",
    });

    expect(results[0].chunkId).toBe("c_close");
    expect(results[1].chunkId).toBe("c_far");
  });

  test("deleteByGeneration removes matching entries", async () => {
    await index.upsertVector("c1", [1, 0, 0], {
      tenantId: "t1",
      generationId: "g1",
      documentId: "d1",
    });
    await index.upsertVector("c2", [1, 0, 0], {
      tenantId: "t1",
      generationId: "g2",
      documentId: "d1",
    });

    await index.deleteByGeneration("t1", "g1");

    const results = await index.search({
      vector: [1, 0, 0],
      topK: 10,
      tenantId: "t1",
      generationId: "g1",
    });

    expect(results).toHaveLength(0);
  });

  test("reset clears all state", async () => {
    await index.ensureIndex(1536);
    await index.upsertVector("c1", [1, 0, 0], {
      tenantId: "t1",
      generationId: "g1",
      documentId: "d1",
    });
    index.reset();

    const status = await index.getIndexStatus();
    expect(status.exists).toBe(false);
  });
});
