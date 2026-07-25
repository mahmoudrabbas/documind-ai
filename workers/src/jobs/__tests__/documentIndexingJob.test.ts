import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId, type MongoClient } from "mongodb";
import { createDocumentIndexingJobHandler } from "../documentIndexingJob.js";
import { setMockClient } from "../../db/mongo.js";
import type { JobHandlerContext } from "../../contracts/jobDispatcher.js";
import { PermanentJobError } from "../../contracts/retryPolicy.js";

const mockCtx: JobHandlerContext = {
  envelope: {
    tenantId: "6a51418875cc29492bf32fed",
  } as JobHandlerContext["envelope"],
  traceId: "trace-1",
  isRetry: false,
  attemptsMade: 0,
  maxAttempts: 3,
  signal: new AbortController().signal,
  progress: () => {},
};

test("documentIndexingJob - happy path: verifies counts and activates generation", async () => {
  const documentId = new ObjectId();
  const tenantId = new ObjectId("6a51418875cc29492bf32fed");
  const generationId = new ObjectId();

  const mockGeneration = {
    _id: generationId,
    tenantId,
    documentId,
    documentVersion: 1,
    expectedChunkCount: 2,
    expectedEmbeddingCount: 2,
    status: "BUILDING",
  };

  let searchIndexCreated = false;
  const updateOneCalls: Array<{ name: string; query: unknown; update: unknown }> = [];

  const mockDb = {
    collection: (name: string) => ({
      findOne: async (query: Record<string, unknown>) => {
        if (name === "indexgenerations") return mockGeneration;
        return null;
      },
      countDocuments: async () => 2,
      createSearchIndex: async (options: Record<string, unknown>) => {
        searchIndexCreated = true;
        return { name: options.name };
      },
      listSearchIndexes: () => ({
        toArray: async () => [
          { name: "vidx_chunk_embeddings_v1", status: "READY" },
          { name: "kidx_chunk_text_v1", status: "READY" },
        ],
      }),
      updateOne: async (query: Record<string, unknown>, update: Record<string, unknown>) => {
        updateOneCalls.push({ name, query, update });
        return { matchedCount: 1, modifiedCount: 1 };
      },
      updateMany: async (query: Record<string, unknown>, update: Record<string, unknown>) => {
        updateOneCalls.push({ name, query, update });
        return { matchedCount: 0, modifiedCount: 0 };
      },
    }),
  };

  const mockClient = { db: () => mockDb } as unknown as MongoClient;
  setMockClient(mockClient);

  const handler = createDocumentIndexingJobHandler();
  const result = await handler.handle(
    {
      documentId: documentId.toString(),
      tenantId: tenantId.toString(),
      documentVersion: 1,
      generationId: generationId.toString(),
    },
    mockCtx,
  );

  assert.ok(result?.summary, "Should return summary");
  assert.equal((result.summary as Record<string, unknown>).success, true);
  assert.equal((result.summary as Record<string, unknown>).activated, true);
  assert.ok(searchIndexCreated, "Should create search indexes");
  assert.ok(updateOneCalls.some((c) => c.name === "documents"), "Should update document searchStatus");

  setMockClient(null);
});

test("documentIndexingJob - fails when generation not found", async () => {
  const mockDb = {
    collection: () => ({
      findOne: async () => null,
    }),
  };

  const mockClient = { db: () => mockDb } as unknown as MongoClient;
  setMockClient(mockClient);

  const handler = createDocumentIndexingJobHandler();
  await assert.rejects(
    () =>
      handler.handle(
        {
          documentId: new ObjectId().toString(),
          tenantId: new ObjectId().toString(),
          documentVersion: 1,
          generationId: new ObjectId().toString(),
        },
        mockCtx,
      ),
    (err: unknown) => err instanceof PermanentJobError,
    "Should throw PermanentJobError when generation not found",
  );

  setMockClient(null);
});

test("documentIndexingJob - fails when count mismatch", async () => {
  const documentId = new ObjectId();
  const tenantId = new ObjectId("6a51418875cc29492bf32fed");
  const generationId = new ObjectId();

  const mockGeneration = {
    _id: generationId,
    tenantId,
    documentId,
    documentVersion: 1,
    expectedChunkCount: 10,
    expectedEmbeddingCount: 10,
    status: "BUILDING",
  };

  let callCount = 0;
  const mockDb = {
    collection: (name: string) => ({
      findOne: async () => {
        if (name === "indexgenerations") return mockGeneration;
        return null;
      },
      countDocuments: async () => {
        callCount++;
        return 2;
      },
      createSearchIndex: async () => ({}),
      listSearchIndexes: () => ({
        toArray: async () => [],
      }),
      updateOne: async () => ({ matchedCount: 1, modifiedCount: 1 }),
      updateMany: async () => ({ matchedCount: 0, modifiedCount: 0 }),
    }),
  };

  const mockClient = { db: () => mockDb } as unknown as MongoClient;
  setMockClient(mockClient);

  const handler = createDocumentIndexingJobHandler();
  await assert.rejects(
    () =>
      handler.handle(
        {
          documentId: documentId.toString(),
          tenantId: tenantId.toString(),
          documentVersion: 1,
          generationId: generationId.toString(),
        },
        mockCtx,
      ),
    (err: unknown) => err instanceof PermanentJobError,
    "Should throw PermanentJobError when count mismatch",
  );

  setMockClient(null);
});
