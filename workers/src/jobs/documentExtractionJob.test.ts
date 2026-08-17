import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { ObjectId, type MongoClient } from "mongodb";
import * as path from "node:path";
import type { JobHandlerContext } from "../contracts/jobDispatcher.js";
import { PermanentJobError } from "../contracts/retryPolicy.js";
import { parserRegistry } from "../providers/extraction/parserRegistry.js";

// The config singleton parses env eagerly, so the fake Atlas URI must be set
// before any module that transitively imports config is evaluated.
process.env.MONGODB_URI =
  "mongodb+srv://test:test@mongo.test.invalid/documind-test";

const { createDocumentExtractionJobHandler } = await import(
  "./documentExtractionJob.js"
);
const { setMockClient } = await import("../db/mongo.js");
const { config } = await import("../config/index.js");

const FIXTURES_DIR = path.resolve(process.cwd(), "src/providers/extraction/__fixtures__");
config.UPLOAD_DIR = FIXTURES_DIR; // Override upload dir for testing

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

test("documentExtractionJob - happy path: enqueues parser, extracts pages, sets status processed", async () => {
  const documentId = new ObjectId();
  const tenantId = new ObjectId("6a51418875cc29492bf32fed");

  const mockDocument = {
    _id: documentId,
    tenantId,
    status: "uploaded",
    fileName: "sample-plain.txt",
    version: 1,
  };

  const mockVersion = {
    documentId,
    tenantId,
    version: 1,
    fileName: "sample-plain.txt",
    mimeType: "text/plain",
    storageKey: "sample-plain.txt",
    checksum: "hash-checksum",
  };

  const findOneCalls: Array<{ name: string; query: Record<string, unknown> }> = [];
  const updateOneCalls: Array<{ name: string; query: Record<string, unknown>; update: Record<string, unknown> }> = [];

  const mockDb = {
    collection: (name: string) => {
      return {
        findOne: async (query: Record<string, unknown>) => {
          findOneCalls.push({ name, query });
          if (name === "documents") return mockDocument;
          if (name === "documentversions") return mockVersion;
          if (name === "extractionartifacts") return null;
          return null;
        },
        updateOne: async (query: Record<string, unknown>, update: Record<string, unknown>) => {
          updateOneCalls.push({ name, query, update });
          if (name === "documents") {
            const $set = update.$set as { status?: string } | undefined;
            if ($set && $set.status) {
              mockDocument.status = $set.status;
            }
          }
          return { matchedCount: 1, modifiedCount: 1 };
        },
      };
    },
  };

  const mockClient = {
    db: () => mockDb,
  } as unknown as MongoClient;

  setMockClient(mockClient);

  const handler = createDocumentExtractionJobHandler();
  const payload = {
    documentId: documentId.toString(),
    tenantId: tenantId.toString(),
    documentVersion: 1,
  };

  const result = (await handler.handle(payload, mockCtx)) as { summary: { success: boolean; pages: number; characters: number } } | undefined;

  assert.ok(result);
  assert.equal(result.summary.success, true);
  assert.equal(result.summary.pages, 1);
  assert.equal(mockDocument.status, "processed");

  const artifactUpdate = updateOneCalls.find(
    c => c.name === "extractionartifacts" && (c.update.$set as { status?: string } | undefined)?.status === "completed"
  );
  assert.ok(artifactUpdate);
});

test("documentExtractionJob - fails permanently for malformed files", async () => {
  const documentId = new ObjectId();
  const tenantId = new ObjectId("6a51418875cc29492bf32fed");

  const mockDocument = {
    _id: documentId,
    tenantId,
    status: "uploaded",
    fileName: "sample-malformed.pdf",
    version: 1,
  };

  const mockVersion = {
    documentId,
    tenantId,
    version: 1,
    fileName: "sample-malformed.pdf",
    mimeType: "application/pdf",
    storageKey: "sample-malformed.pdf",
    checksum: "hash-checksum",
  };

  const updateOneCalls: Array<{ name: string; query: Record<string, unknown>; update: Record<string, unknown> }> = [];

  const mockDb = {
    collection: (name: string) => {
      return {
        findOne: async (_query: Record<string, unknown>) => {
          if (name === "documents") return mockDocument;
          if (name === "documentversions") return mockVersion;
          return null;
        },
        updateOne: async (query: Record<string, unknown>, update: Record<string, unknown>) => {
          updateOneCalls.push({ name, query, update });
          if (name === "documents") {
            const $set = update.$set as { status?: string } | undefined;
            if ($set && $set.status) {
              mockDocument.status = $set.status;
            }
          }
          return { matchedCount: 1, modifiedCount: 1 };
        },
      };
    },
  };

  const mockClient = {
    db: () => mockDb,
  } as unknown as MongoClient;

  setMockClient(mockClient);

  const handler = createDocumentExtractionJobHandler();
  const payload = {
    documentId: documentId.toString(),
    tenantId: tenantId.toString(),
    documentVersion: 1,
  };

  await assert.rejects(
    async () => {
      await handler.handle(payload, mockCtx);
    },
    (err: unknown) => err instanceof PermanentJobError
  );

  assert.ok(artifactIdentifierUpdate(updateOneCalls));
  assert.equal(mockDocument.status, "failed");
});

function artifactIdentifierUpdate(calls: Array<{ name: string; update: Record<string, unknown> }>) {
  return calls.some(c => c.name === "extractionartifacts" && (c.update.$set as { status?: string } | undefined)?.status === "failed");
}

test("documentExtractionJob - image-only doc enqueues document.ocr and stays processing", async () => {
  const documentId = new ObjectId();
  const tenantId = new ObjectId("6a51418875cc29492bf32fed");

  const mockDocument = {
    _id: documentId,
    tenantId,
    status: "uploaded",
    fileName: "sample-plain.txt",
    version: 1,
    department: "Engineering",
    classification: "internal",
  };

  const mockVersion = {
    documentId,
    tenantId,
    version: 1,
    fileName: "sample-plain.txt",
    mimeType: "text/plain",
    storageKey: "sample-plain.txt",
    checksum: "hash-checksum",
  };

  const enqueued: Array<Record<string, unknown>> = [];
  const updateOneCalls: Array<{ name: string; query: Record<string, unknown>; update: Record<string, unknown> }> = [];

  const mockDb = {
    collection: (name: string) => {
      if (name === "indexgenerations") {
        return {
          find: () => ({
            sort: () => ({ limit: () => ({ toArray: async () => [] }) }),
          }),
          findOne: async () => null,
          insertOne: async () => ({}),
        };
      }
      return {
        findOne: async (_query: Record<string, unknown>) => {
          if (name === "documents") return mockDocument;
          if (name === "documentversions") return mockVersion;
          return null;
        },
        updateOne: async (query: Record<string, unknown>, update: Record<string, unknown>) => {
          updateOneCalls.push({ name, query, update });
          if (name === "documents") {
            const $set = update.$set as { status?: string } | undefined;
            if ($set && $set.status) {
              mockDocument.status = $set.status;
            }
          }
          return { matchedCount: 1, modifiedCount: 1 };
        },
      };
    },
  };

  const mockClient = {
    db: () => mockDb,
  } as unknown as MongoClient;

  setMockClient(mockClient);

  // Simulate an image-only scanned document: no extractable text on any page.
  const parseMock = mock.method(parserRegistry, "parse", async () => ({
    pages: [
      { pageNumber: 1, blocks: [] },
      { pageNumber: 2, blocks: [] },
    ],
    metadata: {
      totalPages: 2,
      totalCharacters: 0,
      detectedLanguages: [],
      warnings: [],
      hasImageOnlyPages: true,
    },
    parserName: "pdf",
    parserVersion: "1.0.0",
  }));

  try {
    const handler = createDocumentExtractionJobHandler();
    const ctx = {
      ...mockCtx,
      enqueue: async (job: unknown) => {
        enqueued.push(job as Record<string, unknown>);
      },
    } as unknown as JobHandlerContext;
    const payload = {
      documentId: documentId.toString(),
      tenantId: tenantId.toString(),
      documentVersion: 1,
    };

    const result = (await handler.handle(payload, ctx)) as {
      summary: { success: boolean; pages: number };
    } | undefined;

    assert.ok(result);
    assert.equal(result.summary.success, true);
    assert.equal(result.summary.pages, 2);

    // OCR is required, so the document must not settle on "processed" yet.
    assert.equal(mockDocument.status, "processing");

    const ocrJob = enqueued.find((job) => job.jobType === "document.ocr");
    assert.ok(ocrJob, "document.ocr job should be enqueued for image-only docs");
    const ocrPayload = ocrJob.payload as Record<string, unknown>;
    assert.equal(ocrPayload.documentId, payload.documentId);
    assert.equal(ocrPayload.documentVersion, 1);
    assert.ok(
      typeof ocrPayload.generationId === "string" &&
        ocrPayload.generationId.length > 0,
      "OCR job must carry the generationId so it can merge results and hand off",
    );
    assert.deepEqual(ocrPayload.pageNumbers, [1, 2]);
    assert.equal(ocrPayload.department, "Engineering");
    assert.equal(ocrPayload.classification, "internal");
    assert.ok(
      ocrPayload.idempotencyKey === undefined &&
        ocrJob.idempotencyKey?.includes("-ocr-"),
      "OCR job should be enqueued with a generation-scoped idempotency key",
    );

    // Chunking must wait until OCR has run.
    assert.ok(
      !enqueued.some((job) => job.jobType === "document.chunk"),
      "document.chunk must not be enqueued before OCR completes",
    );

    const artifactUpdate = updateOneCalls.find(
      (call) =>
        call.name === "extractionartifacts" &&
        (call.update.$set as { status?: string } | undefined)?.status === "completed"
    );
    assert.ok(artifactUpdate);
  } finally {
    parseMock.mock.restore();
  }
});

test("documentExtractionJob - idempotent re-run of image-only doc re-enqueues OCR", async () => {
  const documentId = new ObjectId();
  const tenantId = new ObjectId("6a51418875cc29492bf32fed");

  const mockDocument = {
    _id: documentId,
    tenantId,
    status: "processing",
    fileName: "sample-plain.txt",
    version: 1,
  };

  const mockVersion = {
    documentId,
    tenantId,
    version: 1,
    fileName: "sample-plain.txt",
    mimeType: "text/plain",
    storageKey: "sample-plain.txt",
    checksum: "hash-checksum",
  };

  const completedArtifact = {
    _id: new ObjectId(),
    tenantId,
    documentId,
    documentVersion: 1,
    status: "completed",
    sourceChecksum: "hash-checksum",
    pages: [
      { pageNumber: 1, blocks: [] },
      { pageNumber: 2, blocks: [] },
    ],
    metadata: { hasImageOnlyPages: true },
  };

  const enqueued: Array<Record<string, unknown>> = [];

  const mockDb = {
    collection: (name: string) => {
      if (name === "indexgenerations") {
        return {
          find: () => ({
            sort: () => ({ limit: () => ({ toArray: async () => [] }) }),
          }),
          findOne: async () => null,
          insertOne: async () => ({}),
        };
      }
      return {
        findOne: async (_query: Record<string, unknown>) => {
          if (name === "documents") return mockDocument;
          if (name === "documentversions") return mockVersion;
          if (name === "extractionartifacts") return completedArtifact;
          return null;
        },
        updateOne: async () => ({ matchedCount: 1, modifiedCount: 1 }),
      };
    },
  };

  const mockClient = {
    db: () => mockDb,
  } as unknown as MongoClient;

  setMockClient(mockClient);

  const handler = createDocumentExtractionJobHandler();
  const ctx = {
    ...mockCtx,
    enqueue: async (job: unknown) => {
      enqueued.push(job as Record<string, unknown>);
    },
  } as unknown as JobHandlerContext;
  const payload = {
    documentId: documentId.toString(),
    tenantId: tenantId.toString(),
    documentVersion: 1,
  };

  const result = (await handler.handle(payload, ctx)) as {
    summary: { skipped: boolean; reason: string };
  } | undefined;

  assert.ok(result);
  assert.equal(result.summary.skipped, true);

  const ocrJob = enqueued.find((job) => job.jobType === "document.ocr");
  assert.ok(ocrJob, "idempotent re-run must still enqueue document.ocr");
  assert.ok(!enqueued.some((job) => job.jobType === "document.chunk"));
});
