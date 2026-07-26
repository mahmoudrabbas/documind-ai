import { describe, test, expect, vi, beforeEach } from "vitest";
import { runVerification } from "../verification.service.js";
import { FakeVectorIndex } from "../../../../providers/vector-index/fakeVectorIndex.js";
import { FakeKeywordIndex } from "../../../../providers/keyword-index/fakeKeywordIndex.js";
import * as generationService from "../generation.service.js";

vi.mock("../generation.service.js", () => ({
  verifyGeneration: vi.fn(),
  activateGeneration: vi.fn(),
}));

describe("verification.service", () => {
  let vectorIndex: FakeVectorIndex;
  let keywordIndex: FakeKeywordIndex;

  beforeEach(() => {
    vi.clearAllMocks();
    vectorIndex = new FakeVectorIndex();
    keywordIndex = new FakeKeywordIndex();
  });

  test("returns success when all conditions met", async () => {
    vi.mocked(generationService.verifyGeneration).mockResolvedValue({
      verified: true,
      expectedChunkCount: 10,
      actualChunkCount: 10,
      expectedEmbeddingCount: 10,
      actualEmbeddingCount: 10,
    });
    vi.mocked(generationService.activateGeneration).mockResolvedValue(undefined);

    await vectorIndex.ensureIndex(1536);
    await keywordIndex.ensureIndex();

    const result = await runVerification({
      tenantId: "t1",
      generationId: "g1",
      vectorIndex,
      keywordIndex,
    });

    expect(result.success).toBe(true);
    expect(result.countsVerified).toBe(true);
    expect(result.atlasVectorReady).toBe(true);
    expect(result.atlasKeywordReady).toBe(true);
    expect(generationService.activateGeneration).toHaveBeenCalledWith("t1", "g1");
  });

  test("returns failure when counts don't match", async () => {
    vi.mocked(generationService.verifyGeneration).mockResolvedValue({
      verified: false,
      expectedChunkCount: 10,
      actualChunkCount: 8,
      expectedEmbeddingCount: 10,
      actualEmbeddingCount: 10,
    });

    await vectorIndex.ensureIndex(1536);
    await keywordIndex.ensureIndex();

    const result = await runVerification({
      tenantId: "t1",
      generationId: "g1",
      vectorIndex,
      keywordIndex,
    });

    expect(result.success).toBe(false);
    expect(result.countsVerified).toBe(false);
    expect(result.error).toContain("Count mismatch");
    expect(generationService.activateGeneration).not.toHaveBeenCalled();
  });

  test("returns failure when vector index not ready", async () => {
    vi.mocked(generationService.verifyGeneration).mockResolvedValue({
      verified: true,
      expectedChunkCount: 10,
      actualChunkCount: 10,
      expectedEmbeddingCount: 10,
      actualEmbeddingCount: 10,
    });

    const result = await runVerification({
      tenantId: "t1",
      generationId: "g1",
      vectorIndex,
      keywordIndex,
    });

    expect(result.success).toBe(false);
    expect(result.atlasVectorReady).toBe(false);
  });

  test("returns failure when keyword index not ready", async () => {
    vi.mocked(generationService.verifyGeneration).mockResolvedValue({
      verified: true,
      expectedChunkCount: 10,
      actualChunkCount: 10,
      expectedEmbeddingCount: 10,
      actualEmbeddingCount: 10,
    });

    await vectorIndex.ensureIndex(1536);

    const result = await runVerification({
      tenantId: "t1",
      generationId: "g1",
      vectorIndex,
      keywordIndex,
    });

    expect(result.success).toBe(false);
    expect(result.atlasKeywordReady).toBe(false);
  });
});
