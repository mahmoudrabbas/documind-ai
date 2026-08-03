import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId, type MongoClient } from "mongodb";
import type { JobHandlerContext } from "../../contracts/jobDispatcher.js";

// The config singleton parses env eagerly, so the fake Atlas URI must be set
// before any module that transitively imports config is evaluated.
process.env.MONGODB_URI =
  "mongodb+srv://test:test@mongo.test.invalid/documind-test";

const { createDocumentEmbeddingJobHandler } = await import(
  "../documentEmbeddingJob.js"
);
const { setMockClient } = await import("../../db/mongo.js");

process.env.NODE_ENV = "test";

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

test("documentEmbeddingJob - happy path: embeds DRAFT chunks and persists embeddings", async () => {
  const documentId = new ObjectId();
  const tenantId = new ObjectId("6a51418875cc29492bf32fed");
  const generationId = new ObjectId();

  const mockChunks = [
    {
      _id: new ObjectId(),
      tenantId,
      generationId,
      documentId,
      text: "This is test chunk text for embedding.",
      status: "DRAFT",
      language: "en",
      contentType: "paragraph",
      department: null,
      classification: null,
    },
    {
      _id: new ObjectId(),
      tenantId,
      generationId,
      documentId,
      text: "Another chunk with different content for embedding.",
      status: "DRAFT",
      language: "en",
      contentType: "paragraph",
      department: null,
      classification: null,
    },
  ];

  const insertManyCalls: Array<{ name: string; docs: unknown[] }> = [];
  const updateCalls: Array<{ name: string; query: unknown; update: unknown }> = [];

  const mockDb = {
    collection: (name: string) => ({
      find: (_query: Record<string, unknown>) => ({
        toArray: async () => {
          if (name === "documentchunks") return mockChunks;
          return [];
        },
      }),
      insertMany: async (docs: unknown[]) => {
        insertManyCalls.push({ name, docs });
        return { insertedCount: docs.length };
      },
      updateOne: async (query: Record<string, unknown>, update: Record<string, unknown>) => {
        updateCalls.push({ name, query, update });
        return { matchedCount: 1, modifiedCount: 1 };
      },
      updateMany: async (query: Record<string, unknown>, update: Record<string, unknown>) => {
        updateCalls.push({ name, query, update });
        return { matchedCount: 2, modifiedCount: 2 };
      },
    }),
  };

  const mockClient = { db: () => mockDb } as unknown as MongoClient;
  setMockClient(mockClient);

  const handler = createDocumentEmbeddingJobHandler();
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
  assert.equal((result.summary as Record<string, unknown>).embeddedCount, 2);
  assert.ok(insertManyCalls.some((c) => c.name === "chunkembeddings"), "Should insert embeddings");
  assert.ok(updateCalls.some((c) => c.name === "documentchunks"), "Should update chunk status");
  assert.ok(updateCalls.some((c) => c.name === "indexgenerations"), "Should update generation counts");

  setMockClient(null);
});

test("documentEmbeddingJob - throws RetryableJobError when no DRAFT chunks", async () => {
  const mockDb = {
    collection: () => ({
      find: () => ({
        toArray: async () => [],
      }),
    }),
  };

  const mockClient = { db: () => mockDb } as unknown as MongoClient;
  setMockClient(mockClient);

  const handler = createDocumentEmbeddingJobHandler();
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
    { message: "No DRAFT chunks found; chunking may not have completed" },
    "Should throw RetryableJobError when no DRAFT chunks exist",
  );

  setMockClient(null);
});
