import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId, type MongoClient } from "mongodb";
import type { JobHandlerContext } from "../../contracts/jobDispatcher.js";
import { PermanentJobError } from "../../contracts/retryPolicy.js";

// The config singleton parses env eagerly, so the fake Atlas URI must be set
// before any module that transitively imports config is evaluated.
process.env.MONGODB_URI =
  "mongodb+srv://test:test@mongo.test.invalid/documind-test";

const { createDocumentChunkingJobHandler } = await import(
  "../documentChunkingJob.js"
);
const { setMockClient } = await import("../../db/mongo.js");

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

test("documentChunkingJob - happy path: chunks extraction artifact and persists chunks", async () => {
  const documentId = new ObjectId();
  const tenantId = new ObjectId("6a51418875cc29492bf32fed");
  const generationId = new ObjectId();

  const mockArtifact = {
    _id: new ObjectId(),
    tenantId,
    documentId,
    documentVersion: 1,
    status: "completed",
    pages: [
      {
        pageNumber: 1,
        blocks: [
          { type: "paragraph", text: "This is a test paragraph with enough words to create a meaningful chunk for the chunking algorithm." },
          { type: "paragraph", text: "Another paragraph with content that should be chunked properly." },
        ],
      },
    ],
  };

  const insertManyCalls: Array<{ name: string; docs: unknown[] }> = [];
  const updateOneCalls: Array<{ name: string; query: unknown; update: unknown }> = [];

  const mockDb = {
    collection: (name: string) => ({
      findOne: async (_query: Record<string, unknown>) => {
        if (name === "extractionartifacts") return mockArtifact;
        return null;
      },
      insertMany: async (docs: unknown[], _options?: unknown) => {
        insertManyCalls.push({ name, docs: docs as unknown[] });
        return { insertedCount: docs.length };
      },
      updateOne: async (query: Record<string, unknown>, update: Record<string, unknown>) => {
        updateOneCalls.push({ name, query, update });
        return { matchedCount: 1, modifiedCount: 1 };
      },
    }),
  };

  const mockClient = { db: () => mockDb } as unknown as MongoClient;
  setMockClient(mockClient);

  const handler = createDocumentChunkingJobHandler();
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
  assert.ok(insertManyCalls.some((c) => c.name === "documentchunks"), "Should insert chunks");
  assert.ok(updateOneCalls.some((c) => c.name === "indexgenerations"), "Should update generation");

  setMockClient(null);
});

test("documentChunkingJob - fails when extraction artifact not found", async () => {
  const mockDb = {
    collection: (_name: string) => ({
      findOne: async () => null,
    }),
  };

  const mockClient = { db: () => mockDb } as unknown as MongoClient;
  setMockClient(mockClient);

  const handler = createDocumentChunkingJobHandler();
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
    "Should throw PermanentJobError when artifact not found",
  );

  setMockClient(null);
});

test("documentChunkingJob - fails when no pages in artifact", async () => {
  const mockArtifact = {
    _id: new ObjectId(),
    status: "completed",
    pages: [],
  };

  const mockDb = {
    collection: () => ({
      findOne: async () => mockArtifact,
    }),
  };

  const mockClient = { db: () => mockDb } as unknown as MongoClient;
  setMockClient(mockClient);

  const handler = createDocumentChunkingJobHandler();
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
    "Should throw PermanentJobError when no pages",
  );

  setMockClient(null);
});
