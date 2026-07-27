import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId, type MongoClient } from "mongodb";
import { createDocumentEmbeddingJobHandler, type EmbeddingProviderFactory } from "../documentEmbeddingJob.js";
import { setMockClient } from "../../db/mongo.js";
import type { JobHandlerContext } from "../../contracts/jobDispatcher.js";

process.env.NODE_ENV = "test";

const mockCtx: JobHandlerContext = {
  envelope: {
    tenantId: "6a51418875cc29492bf32fed",
  } as JobHandlerContext["envelope"],
  traceId: "trace-partial-failure",
  isRetry: false,
  attemptsMade: 0,
  maxAttempts: 3,
  signal: new AbortController().signal,
  progress: () => {},
};

function buildMockDb(chunks: unknown[]) {
  const insertManyCalls: Array<{ name: string; docs: unknown[] }> = [];
  const updateCalls: Array<{ name: string; query: unknown; update: unknown }> = [];

  const mockDb = {
    collection: (name: string) => ({
      find: () => ({
        toArray: async () => {
          if (name === "documentchunks") return chunks;
          return [];
        },
      }),
      insertMany: async (docs: unknown[]) => {
        insertManyCalls.push({ name, docs });
        return { insertedCount: docs.length };
      },
      insertOne: async (doc: unknown) => {
        return { insertedId: new ObjectId() };
      },
      updateOne: async (query: Record<string, unknown>, update: Record<string, unknown>) => {
        updateCalls.push({ name, query, update });
        return { matchedCount: 1, modifiedCount: 1 };
      },
      updateMany: async (query: Record<string, unknown>, update: Record<string, unknown>) => {
        updateCalls.push({ name, query, update });
        return { matchedCount: 1, modifiedCount: 1 };
      },
    }),
  };

  return { mockDb, insertManyCalls, updateCalls };
}

function makeChunks(count: number, tenantId: ObjectId, generationId: ObjectId, documentId: ObjectId) {
  const chunks: Array<{
    _id: ObjectId;
    tenantId: ObjectId;
    generationId: ObjectId;
    documentId: ObjectId;
    text: string;
    status: string;
    language: string;
    contentType: string;
    department: null;
    classification: null;
  }> = [];

  for (let i = 0; i < count; i++) {
    chunks.push({
      _id: new ObjectId(),
      tenantId,
      generationId,
      documentId,
      text: `Chunk ${i} content for embedding.`,
      status: "DRAFT",
      language: "en",
      contentType: "paragraph",
      department: null,
      classification: null,
    });
  }

  return chunks;
}

function makeProviderFactory(
  filterFn: (chunkId: string) => boolean,
): EmbeddingProviderFactory {
  return () => ({
    name: "fake-partial",
    model: "fake-model",
    dimensions: 8,
    embedBatch: async (inputs) => {
      return inputs
        .filter((input) => filterFn(input.chunkId))
        .map((input) => ({
          chunkId: input.chunkId,
          vector: new Array(8).fill(0.1),
          tokenUsage: 5,
          costUsd: 0.00001,
          modelVersion: "fake-v1",
        }));
    },
  });
}

test("partial failure: 97 success out of 100, 3 remain DRAFT", async () => {
  const documentId = new ObjectId();
  const tenantId = new ObjectId("6a51418875cc29492bf32fed");
  const generationId = new ObjectId();
  const chunks = makeChunks(100, tenantId, generationId, documentId);

  const failedIds = new Set([chunks[10]._id.toString(), chunks[50]._id.toString(), chunks[99]._id.toString()]);

  const { mockDb, insertManyCalls, updateCalls } = buildMockDb(chunks);
  setMockClient({ db: () => mockDb } as unknown as MongoClient);

  try {
    const handler = createDocumentEmbeddingJobHandler(
      makeProviderFactory((chunkId) => !failedIds.has(chunkId)),
    );

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
    const summary = result.summary as Record<string, unknown>;
    assert.equal(summary.success, false, "Should report partial success");
    assert.equal(summary.embeddedCount, 97, "Should embed 97 of 100 chunks");
    assert.equal(summary.failedCount, 3, "Should report 3 failures");

    const embedInserts = insertManyCalls.filter((c) => c.name === "chunkembeddings");
    assert.ok(embedInserts.length > 0, "Should insert embeddings");
    assert.equal(embedInserts[0].docs.length, 97, "Should insert exactly 97 embeddings");

    const chunkUpdates = updateCalls.filter((c) => c.name === "documentchunks");
    assert.ok(chunkUpdates.length > 0, "Should update chunk statuses");

    const genUpdates = updateCalls.filter((c) => c.name === "indexgenerations");
    assert.ok(genUpdates.length > 0, "Should update generation counts");
    const genSet = (genUpdates[0].update as Record<string, unknown>).$set as Record<string, unknown>;
    assert.equal(genSet.expectedEmbeddingCount, 100);
    assert.equal(genSet.actualEmbeddingCount, 97);
  } finally {
    setMockClient(null);
  }
});

test("all 100 succeed: full success", async () => {
  const documentId = new ObjectId();
  const tenantId = new ObjectId("6a51418875cc29492bf32fed");
  const generationId = new ObjectId();
  const chunks = makeChunks(100, tenantId, generationId, documentId);

  const { mockDb, insertManyCalls } = buildMockDb(chunks);
  setMockClient({ db: () => mockDb } as unknown as MongoClient);

  try {
    const handler = createDocumentEmbeddingJobHandler(
      makeProviderFactory(() => true),
    );

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
    const summary = result.summary as Record<string, unknown>;
    assert.equal(summary.success, true, "Should report full success");
    assert.equal(summary.embeddedCount, 100, "Should embed all 100 chunks");
    assert.equal(summary.failedCount, 0, "Should report 0 failures");

    const embedInserts = insertManyCalls.filter((c) => c.name === "chunkembeddings");
    assert.ok(embedInserts.length > 0, "Should insert embeddings");
    assert.equal(embedInserts[0].docs.length, 100, "Should insert all 100 embeddings");
  } finally {
    setMockClient(null);
  }
});

test("partial failure: 50 success out of 100, provider returns only half", async () => {
  const documentId = new ObjectId();
  const tenantId = new ObjectId("6a51418875cc29492bf32fed");
  const generationId = new ObjectId();
  const chunks = makeChunks(100, tenantId, generationId, documentId);

  const successIds = new Set(chunks.slice(0, 50).map((c) => c._id.toString()));

  const { mockDb, insertManyCalls, updateCalls } = buildMockDb(chunks);
  setMockClient({ db: () => mockDb } as unknown as MongoClient);

  try {
    const handler = createDocumentEmbeddingJobHandler(
      makeProviderFactory((chunkId) => successIds.has(chunkId)),
    );

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
    const summary = result.summary as Record<string, unknown>;
    assert.equal(summary.success, false, "Should report partial success");
    assert.equal(summary.embeddedCount, 50, "Should embed 50 of 100 chunks");
    assert.equal(summary.failedCount, 50, "Should report 50 failures");

    const embedInserts = insertManyCalls.filter((c) => c.name === "chunkembeddings");
    assert.ok(embedInserts.length > 0, "Should insert embeddings");
    assert.equal(embedInserts[0].docs.length, 50, "Should insert exactly 50 embeddings");

    const genUpdates = updateCalls.filter((c) => c.name === "indexgenerations");
    const genSet = (genUpdates[0].update as Record<string, unknown>).$set as Record<string, unknown>;
    assert.equal(genSet.expectedEmbeddingCount, 100);
    assert.equal(genSet.actualEmbeddingCount, 50);
  } finally {
    setMockClient(null);
  }
});
