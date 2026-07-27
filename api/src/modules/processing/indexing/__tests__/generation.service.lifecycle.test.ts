import { describe, test, expect, vi, beforeEach } from "vitest";

const mockGenerationModel = vi.hoisted(() => ({
  create: vi.fn(),
  findOne: vi.fn(),
  find: vi.fn(),
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn(),
  countDocuments: vi.fn(),
}));

const mockChunkModel = vi.hoisted(() => ({
  insertMany: vi.fn(),
  findOne: vi.fn(),
  find: vi.fn(),
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn(),
  countDocuments: vi.fn(),
}));

const mockEmbeddingModel = vi.hoisted(() => ({
  insertMany: vi.fn(),
  findOne: vi.fn(),
  find: vi.fn(),
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn(),
  countDocuments: vi.fn(),
}));

const mockDocModel = vi.hoisted(() => ({
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
}));

vi.mock("../../../../db/models/indexGeneration.model.js", () => ({
  default: mockGenerationModel,
}));

vi.mock("../../../../db/models/documentChunk.model.js", () => ({
  default: mockChunkModel,
}));

vi.mock("../../../../db/models/chunkEmbedding.model.js", () => ({
  default: mockEmbeddingModel,
}));

vi.mock("../../../../db/models/document.model.js", () => ({
  default: mockDocModel,
}));

import {
  startGeneration,
  verifyGeneration,
  activateGeneration,
  failGeneration,
  rollbackGeneration,
} from "../generation.service.js";

function query(result: unknown) {
  const p = Promise.resolve(result);
  return {
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(result),
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  };
}

function makeGeneration(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => "gen-1" },
    documentId: { toString: () => "doc-1" },
    documentVersion: 1,
    tenantId: "tenant-1",
    generationNumber: 1,
    status: "BUILDING",
    expectedChunkCount: 0,
    actualChunkCount: 0,
    expectedEmbeddingCount: 0,
    actualEmbeddingCount: 0,
    atlasIndexName: "vidx_chunk_embeddings_v1",
    atlasIndexStatus: "UNKNOWN",
    failureReason: null,
    triggeredBy: "INITIAL",
    chunkingConfig: { targetTokens: 512, hardCeiling: 800, overlap: 50, tokenizerVersion: "cl100k_base" },
    createdAt: new Date(),
    ...overrides,
  };
}

describe("generation.service — lifecycle", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockGenerationModel.findOne.mockReturnValue(query({ generationNumber: 0 }));
    mockGenerationModel.create.mockResolvedValue(makeGeneration());
    mockGenerationModel.updateOne.mockResolvedValue(undefined);

    mockDocModel.findOne.mockResolvedValue({ searchStatus: "NOT_INDEXED" });
    mockDocModel.findOneAndUpdate.mockResolvedValue(undefined);

    mockChunkModel.countDocuments.mockResolvedValue(0);
    mockEmbeddingModel.countDocuments.mockResolvedValue(0);
  });

  describe("startGeneration", () => {
    test("creates generation with BUILDING status and increments generation number", async () => {
      mockGenerationModel.findOne.mockReturnValue(query({ generationNumber: 2 }));

      const gen = await startGeneration({
        tenantId: "t1",
        documentId: "doc-1",
        documentVersion: 1,
        triggeredBy: "INITIAL",
      });

      expect(mockGenerationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: "BUILDING", generationNumber: 3 }),
      );
      expect(gen.status).toBe("BUILDING");
    });

    test("sets searchStatus to STALE when document was READY", async () => {
      mockDocModel.findOne.mockResolvedValue({ searchStatus: "READY" });

      await startGeneration({
        tenantId: "t1",
        documentId: "doc-1",
        documentVersion: 1,
        triggeredBy: "REINDEX",
      });

      expect(mockDocModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ _id: "doc-1" }),
        expect.objectContaining({ $set: { searchStatus: "STALE" } }),
      );
    });

    test("sets searchStatus to INDEXING when document was NOT_INDEXED", async () => {
      await startGeneration({
        tenantId: "t1",
        documentId: "doc-1",
        documentVersion: 1,
        triggeredBy: "INITIAL",
      });

      expect(mockDocModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ _id: "doc-1" }),
        expect.objectContaining({ $set: { searchStatus: "INDEXING" } }),
      );
    });

    test("merges chunking config with defaults", async () => {
      await startGeneration({
        tenantId: "t1",
        documentId: "doc-1",
        documentVersion: 1,
        triggeredBy: "INITIAL",
        chunkingConfig: { targetTokens: 256, hardCeiling: 800, overlap: 50, tokenizerVersion: "cl100k_base" },
      });

      expect(mockGenerationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          chunkingConfig: expect.objectContaining({ targetTokens: 256 }),
        }),
      );
    });
  });

  describe("verifyGeneration", () => {
    test("returns verified=true when counts match", async () => {
      mockGenerationModel.findOne.mockReturnValue(
        query(makeGeneration({ expectedChunkCount: 10, expectedEmbeddingCount: 10 })),
      );
      mockChunkModel.countDocuments.mockResolvedValue(10);
      mockEmbeddingModel.countDocuments.mockResolvedValue(10);

      const result = await verifyGeneration("t1", "gen-1");

      expect(result.verified).toBe(true);
      expect(result.actualChunkCount).toBe(10);
      expect(result.actualEmbeddingCount).toBe(10);
      expect(mockGenerationModel.updateOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ $set: expect.objectContaining({ status: "VERIFIED" }) }),
        undefined,
      );
    });

    test("returns verified=false when chunk count mismatches", async () => {
      mockGenerationModel.findOne.mockReturnValue(
        query(makeGeneration({ expectedChunkCount: 10, expectedEmbeddingCount: 10 })),
      );
      mockChunkModel.countDocuments.mockResolvedValue(8);
      mockEmbeddingModel.countDocuments.mockResolvedValue(10);

      const result = await verifyGeneration("t1", "gen-1");

      expect(result.verified).toBe(false);
      expect(result.failureReason?.code).toBe("COUNT_MISMATCH");
      expect(mockGenerationModel.updateOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ $set: expect.objectContaining({ status: "FAILED" }) }),
        undefined,
      );
      expect(mockDocModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ $set: { searchStatus: "FAILED" } }),
      );
    });

    test("returns verified=false when embedding count mismatches", async () => {
      mockGenerationModel.findOne.mockReturnValue(
        query(makeGeneration({ expectedChunkCount: 10, expectedEmbeddingCount: 10 })),
      );
      mockChunkModel.countDocuments.mockResolvedValue(10);
      mockEmbeddingModel.countDocuments.mockResolvedValue(5);

      const result = await verifyGeneration("t1", "gen-1");

      expect(result.verified).toBe(false);
      expect(result.failureReason?.code).toBe("COUNT_MISMATCH");
    });

    test("returns failure when generation not found", async () => {
      mockGenerationModel.findOne.mockReturnValue(query(null));

      const result = await verifyGeneration("t1", "missing-gen");

      expect(result.verified).toBe(false);
      expect(result.failureReason?.code).toBe("GENERATION_NOT_FOUND");
    });
  });

  describe("activateGeneration", () => {
    test("retires previous active and sets status to ACTIVE", async () => {
      mockGenerationModel.findOne.mockReturnValue(
        query(makeGeneration({ status: "VERIFIED" })),
      );

      await activateGeneration("t1", "gen-1");

      expect(mockGenerationModel.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({ documentId: "doc-1", status: "ACTIVE" }),
        expect.objectContaining({ $set: expect.objectContaining({ status: "RETIRED" }) }),
        undefined,
      );
      expect(mockGenerationModel.updateOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ $set: expect.objectContaining({ status: "ACTIVE" }) }),
        undefined,
      );
      expect(mockDocModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ $set: expect.objectContaining({ searchStatus: "READY" }) }),
      );
    });

    test("throws when generation is not in VERIFIED status", async () => {
      mockGenerationModel.findOne.mockReturnValue(
        query(makeGeneration({ status: "BUILDING" })),
      );

      await expect(activateGeneration("t1", "gen-1")).rejects.toThrow(
        "Cannot activate generation in status BUILDING",
      );
    });

    test("throws when generation not found", async () => {
      mockGenerationModel.findOne.mockReturnValue(query(null));

      await expect(activateGeneration("t1", "missing")).rejects.toThrow(
        "Generation not found",
      );
    });
  });

  describe("failGeneration", () => {
    test("marks generation as FAILED with failure reason", async () => {
      mockGenerationModel.findOne.mockReturnValue(query(makeGeneration()));

      await failGeneration("t1", "gen-1", "embed", "PROVIDER_ERROR", "Rate limited");

      expect(mockGenerationModel.updateOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({
            status: "FAILED",
            failureReason: { stage: "embed", code: "PROVIDER_ERROR", message: "Rate limited" },
          }),
        }),
        undefined,
      );
    });

    test("updates document searchStatus to FAILED", async () => {
      mockGenerationModel.findOne.mockReturnValue(query(makeGeneration()));

      await failGeneration("t1", "gen-1", "chunk", "INTERNAL", "Oops");

      expect(mockDocModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ _id: "doc-1" }),
        expect.objectContaining({ $set: { searchStatus: "FAILED" } }),
      );
    });
  });

  describe("rollbackGeneration", () => {
    test("marks generation as FAILED with ROLLBACK reason", async () => {
      let callCount = 0;
      mockGenerationModel.findOne.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return query(makeGeneration());
        return query(null);
      });

      await rollbackGeneration("t1", "gen-1");

      expect(mockGenerationModel.updateOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({
            status: "FAILED",
            failureReason: { stage: "rollback", code: "ROLLBACK", message: "Generation rolled back" },
          }),
        }),
        undefined,
      );
    });

    test("restores searchStatus to READY when active generation exists", async () => {
      let callCount = 0;
      mockGenerationModel.findOne.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return query(makeGeneration());
        return query(makeGeneration({ status: "ACTIVE" }));
      });

      await rollbackGeneration("t1", "gen-1");

      expect(mockDocModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ _id: "doc-1" }),
        expect.objectContaining({ $set: { searchStatus: "READY" } }),
      );
    });

    test("sets searchStatus to NOT_INDEXED when no active generation exists", async () => {
      let callCount = 0;
      mockGenerationModel.findOne.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return query(makeGeneration());
        return query(null);
      });

      await rollbackGeneration("t1", "gen-1");

      expect(mockDocModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ _id: "doc-1" }),
        expect.objectContaining({ $set: { searchStatus: "NOT_INDEXED" } }),
      );
    });

    test("no-ops when generation not found", async () => {
      mockGenerationModel.findOne.mockReturnValue(query(null));

      await rollbackGeneration("t1", "missing");

      expect(mockGenerationModel.updateOne).not.toHaveBeenCalled();
      expect(mockDocModel.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });
});
