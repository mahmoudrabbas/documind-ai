import { describe, test, expect } from "vitest";

const CLASSIFICATIONS_BLOCKED_FROM_EXTERNAL_EMBEDDING = new Set([
  "TOP_SECRET",
  "RESTRICTED",
]);

function isClassificationAllowedForEmbedding(classification: string | null): boolean {
  if (!classification) return true;
  return !CLASSIFICATIONS_BLOCKED_FROM_EXTERNAL_EMBEDDING.has(classification);
}

describe("Classification gate — data residency enforcement", () => {
  test("null classification is allowed", () => {
    expect(isClassificationAllowedForEmbedding(null)).toBe(true);
  });

  test("undefined classification is allowed", () => {
    expect(isClassificationAllowedForEmbedding(undefined as unknown as null)).toBe(true);
  });

  test("empty string classification is allowed", () => {
    expect(isClassificationAllowedForEmbedding("")).toBe(true);
  });

  test("TOP_SECRET classification is blocked", () => {
    expect(isClassificationAllowedForEmbedding("TOP_SECRET")).toBe(false);
  });

  test("RESTRICTED classification is blocked", () => {
    expect(isClassificationAllowedForEmbedding("RESTRICTED")).toBe(false);
  });

  test("CONFIDENTIAL classification is allowed", () => {
    expect(isClassificationAllowedForEmbedding("CONFIDENTIAL")).toBe(true);
  });

  test("INTERNAL classification is allowed", () => {
    expect(isClassificationAllowedForEmbedding("INTERNAL")).toBe(true);
  });

  test("PUBLIC classification is allowed", () => {
    expect(isClassificationAllowedForEmbedding("PUBLIC")).toBe(true);
  });

  test("case-sensitive: top_secret is not blocked", () => {
    expect(isClassificationAllowedForEmbedding("top_secret")).toBe(true);
  });
});

describe("Tenant isolation — fake vector index", () => {
  test("tenant A cannot see tenant B's vectors", async () => {
    const { FakeVectorIndex } = await import("../providers/vector-index/fakeVectorIndex.js");
    const index = new FakeVectorIndex();

    await index.upsertVector("c_a", [1, 0, 0], {
      tenantId: "tenant-a",
      generationId: "g1",
      text: "secret A",
    });
    await index.upsertVector("c_b", [1, 0, 0], {
      tenantId: "tenant-b",
      generationId: "g1",
      text: "secret B",
    });

    const resultsA = await index.search({
      vector: [1, 0, 0],
      tenantId: "tenant-a",
      generationId: "g1",
      topK: 10,
    });
    expect(resultsA.length).toBe(1);
    expect(resultsA[0].chunkId).toBe("c_a");

    const resultsB = await index.search({
      vector: [1, 0, 0],
      tenantId: "tenant-b",
      generationId: "g1",
      topK: 10,
    });
    expect(resultsB.length).toBe(1);
    expect(resultsB[0].chunkId).toBe("c_b");
  });

  test("forged generationId from another tenant returns empty", async () => {
    const { FakeVectorIndex } = await import("../providers/vector-index/fakeVectorIndex.js");
    const index = new FakeVectorIndex();

    await index.upsertVector("c1", [1, 0, 0], {
      tenantId: "tenant-a",
      generationId: "real-gen",
      text: "data",
    });

    const results = await index.search({
      vector: [1, 0, 0],
      tenantId: "tenant-a",
      generationId: "forged-gen-from-tenant-b",
      topK: 10,
    });
    expect(results.length).toBe(0);
  });
});

describe("Tenant isolation — fake keyword index", () => {
  test("tenant A cannot see tenant B's keyword index entries", async () => {
    const { FakeKeywordIndex } = await import("../providers/keyword-index/fakeKeywordIndex.js");
    const index = new FakeKeywordIndex();

    await index.indexDocument("c_a", "Confidential contract terms", {
      tenantId: "tenant-a",
      generationId: "g1",
    });
    await index.indexDocument("c_b", "Confidential contract terms", {
      tenantId: "tenant-b",
      generationId: "g1",
    });

    const resultsA = await index.search({
      query: "confidential",
      tenantId: "tenant-a",
      generationId: "g1",
      topK: 10,
    });
    expect(resultsA.length).toBe(1);
    expect(resultsA[0].chunkId).toBe("c_a");

    const resultsB = await index.search({
      query: "confidential",
      tenantId: "tenant-b",
      generationId: "g1",
      topK: 10,
    });
    expect(resultsB.length).toBe(1);
    expect(resultsB[0].chunkId).toBe("c_b");
  });

  test("forged generationId from another tenant returns empty", async () => {
    const { FakeKeywordIndex } = await import("../providers/keyword-index/fakeKeywordIndex.js");
    const index = new FakeKeywordIndex();

    await index.indexDocument("c1", "Secret data", {
      tenantId: "tenant-a",
      generationId: "real-gen",
    });

    const results = await index.search({
      query: "secret",
      tenantId: "tenant-a",
      generationId: "forged-gen",
      topK: 10,
    });
    expect(results.length).toBe(0);
  });
});
