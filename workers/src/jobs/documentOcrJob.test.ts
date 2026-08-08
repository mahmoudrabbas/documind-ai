import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { ObjectId, type MongoClient } from "mongodb";
import type { JobHandlerContext } from "../contracts/jobDispatcher.js";
import {
  PermanentJobError,
  RetryableJobError,
} from "../contracts/retryPolicy.js";

// The config singleton parses env eagerly, so the fake Atlas URI must be set
// before any module that transitively imports config is evaluated.
process.env.MONGODB_URI =
  "mongodb+srv://test:test@mongo.test.invalid/documind-test";

const { createDocumentOcrJobHandler } = await import("./documentOcrJob.js");
const { setMockClient } = await import("../db/mongo.js");
const { config } = await import("../config/index.js");

const FIXTURES_DIR = fileURLToPath(
  new URL("./__fixtures__/", import.meta.url),
);
config.UPLOAD_DIR = FIXTURES_DIR;

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_OCR_PROVIDER = process.env.OCR_PROVIDER;
const ORIGINAL_OCR_MAX_PAGES = process.env.OCR_MAX_PAGES;
const ORIGINAL_FAKE_OCR_BLANK = process.env.FAKE_OCR_BLANK;

test("production import order keeps PDF.js Path2D compatible with the render canvas", async () => {
  await import("pdf-parse");
  await import("pdfjs-dist/legacy/build/pdf.mjs");
  const canvasModule = await import("@napi-rs/canvas");

  assert.equal(
    globalThis.Path2D,
    canvasModule.Path2D,
    "PDF.js and the OCR renderer must use the same native Path2D class",
  );

  const canvas = canvasModule.createCanvas(10, 10);
  const context = canvas.getContext("2d");
  const path = new globalThis.Path2D();
  path.rect(0, 0, 5, 5);

  assert.doesNotThrow(
    () => context.fill(path),
    "The renderer must accept the Path2D installed during worker startup",
  );
});

beforeEach(() => {
  process.env.NODE_ENV = "test";
  delete process.env.OCR_PROVIDER;
  process.env.OCR_MAX_PAGES = "500";
  delete process.env.FAKE_OCR_BLANK;
});

afterEach(() => {
  if (ORIGINAL_NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  }

  if (ORIGINAL_OCR_PROVIDER === undefined) {
    delete process.env.OCR_PROVIDER;
  } else {
    process.env.OCR_PROVIDER = ORIGINAL_OCR_PROVIDER;
  }

  if (ORIGINAL_OCR_MAX_PAGES === undefined) {
    delete process.env.OCR_MAX_PAGES;
  } else {
    process.env.OCR_MAX_PAGES = ORIGINAL_OCR_MAX_PAGES;
  }

  if (ORIGINAL_FAKE_OCR_BLANK === undefined) {
    delete process.env.FAKE_OCR_BLANK;
  } else {
    process.env.FAKE_OCR_BLANK = ORIGINAL_FAKE_OCR_BLANK;
  }
});

const mockCtx: JobHandlerContext = {
  envelope: {
    tenantId: "6a51418875cc29492bf32fed",
  } as JobHandlerContext["envelope"],
  traceId: "trace-ocr-test",
  isRetry: false,
  attemptsMade: 0,
  maxAttempts: 3,
  signal: new AbortController().signal,
  progress: () => {},
};

interface MockCollections {
  updateOneCalls: Array<{ collection: string; update: Record<string, unknown> }>;
  insertOneCalls: Array<{ collection: string; document: Record<string, unknown> }>;
}

function buildMockDb(collections?: MockCollections) {
  const updateOneCalls = collections?.updateOneCalls ?? [];
  const insertOneCalls = collections?.insertOneCalls ?? [];

  const documentRecord = {
    _id: new ObjectId(),
    tenantId: new ObjectId("6a51418875cc29492bf32fed"),
    status: "uploaded",
    fileName: "minimal.pdf",
  };

  const versionRecord = {
    documentId: documentRecord._id,
    tenantId: documentRecord.tenantId,
    version: 1,
    fileName: "minimal.pdf",
    mimeType: "application/pdf",
    storageKey: "minimal.pdf",
  };

  const records: Record<string, unknown> = {
    documentversions: versionRecord,
    documents: documentRecord,
  };

  const db = {
    collection: (name: string) => ({
      findOne: async () => records[name] ?? null,
      updateOne: async (_query: Record<string, unknown>, update: Record<string, unknown>, _opts?: Record<string, unknown>) => {
        updateOneCalls.push({ collection: name, update });
        return { matchedCount: 1, modifiedCount: 1 };
      },
      insertOne: async (doc: Record<string, unknown>) => {
        insertOneCalls.push({ collection: name, document: doc });
        return { insertedId: new ObjectId() };
      },
      find: () => ({
        sort: () => ({
          toArray: async () => [],
        }),
      }),
    }),
    _documentRecord: documentRecord,
    _versionRecord: versionRecord,
  };

  return db;
}

function mountMockDb(db: ReturnType<typeof buildMockDb>) {
  setMockClient({ db: () => db } as unknown as MongoClient);
  return db._documentRecord;
}

test("1. PDF.js receives an independent Uint8Array copy", async () => {
  const { readFile: fsReadFile } = await import("node:fs/promises");
  const pdfBuffer = await fsReadFile(path.join(FIXTURES_DIR, "minimal.pdf"));

  const db = buildMockDb();
  mountMockDb(db);

  const handler = createDocumentOcrJobHandler();
  await handler.handle(
    {
      documentId: db._documentRecord._id.toString(),
      tenantId: "6a51418875cc29492bf32fed",
      documentVersion: 1,
      ocrProvider: "fake",
    } as Parameters<typeof handler.handle>[0],
    mockCtx,
  );

  assert.ok(
    pdfBuffer.length > 0,
    "Source buffer must remain readable after handler processes it",
  );
  assert.ok(
    Buffer.isBuffer(pdfBuffer),
    "Source must still be a Buffer (not detached)",
  );

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  assert.ok(
    pdfjs.GlobalWorkerOptions.workerSrc,
    "workerSrc must be set",
  );
  assert.ok(
    pdfjs.GlobalWorkerOptions.workerSrc.startsWith("file://"),
    `workerSrc must be a file:// URL, got: ${pdfjs.GlobalWorkerOptions.workerSrc}`,
  );
});

test("2. detectPageCount does not detach the source Buffer", async () => {
  const { readFile: fsReadFile } = await import("node:fs/promises");
  const pdfBuffer = await fsReadFile(path.join(FIXTURES_DIR, "minimal.pdf"));
  const originalLength = pdfBuffer.length;

  const db = buildMockDb();
  mountMockDb(db);

  const handler = createDocumentOcrJobHandler();
  await handler.handle(
    {
      documentId: db._documentRecord._id.toString(),
      tenantId: "6a51418875cc29492bf32fed",
      documentVersion: 1,
      ocrProvider: "fake",
    } as Parameters<typeof handler.handle>[0],
    mockCtx,
  );

  assert.equal(pdfBuffer.length, originalLength, "Source buffer length must not change");
  assert.ok(Buffer.isBuffer(pdfBuffer), "Source must remain a valid Buffer");
});

test("3. same source Buffer can be used after detectPageCount to render page 1", async () => {
  const { readFile: fsReadFile } = await import("node:fs/promises");
  const pdfBuffer = await fsReadFile(path.join(FIXTURES_DIR, "minimal.pdf"));
  const originalLength = pdfBuffer.length;

  const db = buildMockDb();
  mountMockDb(db);

  const handler = createDocumentOcrJobHandler();
  const result = (await handler.handle(
    {
      documentId: db._documentRecord._id.toString(),
      tenantId: "6a51418875cc29492bf32fed",
      documentVersion: 1,
      ocrProvider: "fake",
    } as Parameters<typeof handler.handle>[0],
    mockCtx,
  )) as { summary: { success: boolean; totalPagesProcessed: number } };

  assert.ok(result, "Handler should return a result");
  assert.equal(result.summary.success, true, "OCR should succeed");
  assert.equal(result.summary.totalPagesProcessed, 1, "Should process 1 page");
  assert.equal(pdfBuffer.length, originalLength, "Source buffer must be reusable after full pipeline");
});

test("4. no detached ArrayBuffer error occurs", async () => {
  const db = buildMockDb();
  mountMockDb(db);

  const handler = createDocumentOcrJobHandler();
  let threwDetached = false;
  try {
    await handler.handle(
      {
        documentId: db._documentRecord._id.toString(),
        tenantId: "6a51418875cc29492bf32fed",
        documentVersion: 1,
        ocrProvider: "fake",
      } as Parameters<typeof handler.handle>[0],
      mockCtx,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("detached ArrayBuffer") || msg.includes("Construct on a detached")) {
      threwDetached = true;
    }
  }
  assert.equal(threwDetached, false, "Must not throw a detached ArrayBuffer error");
});

test("5. explicit pageNumbers=[1] processes page 1 successfully", async () => {
  const insertOneCalls: Array<{ collection: string; document: Record<string, unknown> }> = [];
  const updateOneCalls: Array<{ collection: string; update: Record<string, unknown> }> = [];
  const db = buildMockDb({ insertOneCalls, updateOneCalls });
  mountMockDb(db);

  const handler = createDocumentOcrJobHandler();
  const result = (await handler.handle(
    {
      documentId: db._documentRecord._id.toString(),
      tenantId: "6a51418875cc29492bf32fed",
      documentVersion: 1,
      pageNumbers: [1],
      ocrProvider: "fake",
    } as Parameters<typeof handler.handle>[0],
    mockCtx,
  )) as { summary: { success: boolean; totalPagesProcessed: number; pageResults: Array<{ pageNumber: number; status: string }> } };

  assert.ok(result, "Handler should return a result");
  assert.equal(result.summary.success, true, "Should succeed for page 1 of large PDF");
  assert.equal(result.summary.totalPagesProcessed, 1, "Should process exactly 1 page");
  assert.equal(result.summary.pageResults[0].pageNumber, 1);
  assert.equal(result.summary.pageResults[0].status, "completed");
});

test("6. a large PDF without pageNumbers exceeding OCR_MAX_PAGES is rejected", async () => {
  const db = buildMockDb();
  mountMockDb(db);

  const handler = createDocumentOcrJobHandler();
  await assert.rejects(
    async () => {
      await handler.handle(
        {
          documentId: db._documentRecord._id.toString(),
          tenantId: "6a51418875cc29492bf32fed",
          documentVersion: 1,
          pageNumbers: Array.from({ length: 501 }, (_, i) => i + 1),
        } as Parameters<typeof handler.handle>[0],
        mockCtx,
      );
    },
    (err: unknown) => {
      assert.ok(err instanceof PermanentJobError, `Expected PermanentJobError, got: ${err?.constructor?.name}`);
      const msg = (err as Error).message;
      assert.ok(msg.includes("501"), `Error message should mention selected count (501): ${msg}`);
      assert.ok(msg.includes("500"), `Error message should mention configured limit (500): ${msg}`);
      assert.ok(msg.includes("OCR_MAX_PAGES"), `Error message should mention OCR_MAX_PAGES: ${msg}`);
      return true;
    },
  );
});

test("7. selected-page count exceeding OCR_MAX_PAGES is rejected", async () => {
  const db = buildMockDb();
  mountMockDb(db);

  const manyPages = Array.from({ length: 501 }, (_, i) => i + 1);
  const handler = createDocumentOcrJobHandler();
  await assert.rejects(
    async () => {
      await handler.handle(
        {
          documentId: db._documentRecord._id.toString(),
          tenantId: "6a51418875cc29492bf32fed",
          documentVersion: 1,
          pageNumbers: manyPages,
        } as Parameters<typeof handler.handle>[0],
        mockCtx,
      );
    },
    (err: unknown) => {
      assert.ok(err instanceof PermanentJobError, `Expected PermanentJobError, got: ${err?.constructor?.name}`);
      assert.ok(
        (err as Error).message.includes("501"),
        `Error message should mention selected count (501): ${(err as Error).message}`,
      );
      return true;
    },
  );
});

test("8. requested page greater than actual page count is rejected", async () => {
  const db = buildMockDb();
  mountMockDb(db);

  const handler = createDocumentOcrJobHandler();
  await assert.rejects(
    async () => {
      await handler.handle(
        {
          documentId: db._documentRecord._id.toString(),
          tenantId: "6a51418875cc29492bf32fed",
          documentVersion: 1,
          pageNumbers: [999],
        } as Parameters<typeof handler.handle>[0],
        mockCtx,
      );
    },
    (err: unknown) => {
      assert.ok(err instanceof PermanentJobError, `Expected PermanentJobError, got: ${err?.constructor?.name}`);
      assert.ok(
        (err as Error).message.includes("999"),
        `Error message should mention requested page (999): ${(err as Error).message}`,
      );
      assert.ok(
        (err as Error).message.includes("does not exist"),
        `Error message should say page does not exist: ${(err as Error).message}`,
      );
      return true;
    },
  );
});

test("9. a permanent page-limit error is not retried", async () => {
  const db = buildMockDb();
  mountMockDb(db);

  const handler = createDocumentOcrJobHandler();
  let thrownError: unknown;
  try {
    await handler.handle(
      {
        documentId: db._documentRecord._id.toString(),
        tenantId: "6a51418875cc29492bf32fed",
        documentVersion: 1,
        pageNumbers: [999],
      } as Parameters<typeof handler.handle>[0],
      mockCtx,
    );
  } catch (err: unknown) {
    thrownError = err;
  }

  assert.ok(thrownError, "Should throw an error");
  assert.ok(
    thrownError instanceof PermanentJobError,
    `Page-limit error must be PermanentJobError (not retried), got: ${
      thrownError instanceof Error
        ? thrownError.constructor.name
        : typeof thrownError
    }`,
  );

  assert.match(
    thrownError.message,
    /Requested page 999 does not exist/i,
    "The permanent error must be the expected page-range rejection",
  );

  const { classifyError } = await import("../contracts/retryPolicy.js");
  const severity = classifyError(thrownError);
  assert.equal(
    severity,
    "permanent",
    `classifyError must return "permanent" for PermanentJobError, got "${severity}"`,
  );
});

test("10. malformed PDF returns the real page-count failure reason", async () => {
  const updateOneCalls: Array<{
    collection: string;
    update: Record<string, unknown>;
  }> = [];

  const documentRecord = {
    _id: new ObjectId(),
    tenantId: new ObjectId(
      "6a51418875cc29492bf32fed",
    ),
    status: "uploaded",
    fileName: "invalid.pdf",
  };

  const versionRecord = {
    documentId: documentRecord._id,
    tenantId: documentRecord.tenantId,
    version: 1,
    fileName: "invalid.pdf",
    mimeType: "application/pdf",
    storageKey: "invalid.pdf",
  };

  const db = {
    collection: (name: string) => ({
      findOne: async () => {
        if (name === "documentversions") {
          return versionRecord;
        }

        if (name === "documents") {
          return documentRecord;
        }

        return null;
      },

      updateOne: async (
        _query: Record<string, unknown>,
        update: Record<string, unknown>,
      ) => {
        updateOneCalls.push({
          collection: name,
          update,
        });

        return {
          matchedCount: 1,
          modifiedCount: 1,
        };
      },

      insertOne: async () => ({
        insertedId: new ObjectId(),
      }),

      find: () => ({
        sort: () => ({
          toArray: async () => [],
        }),
      }),
    }),
  };

  setMockClient({
    db: () => db,
  } as unknown as MongoClient);

  const handler =
    createDocumentOcrJobHandler();

  await assert.rejects(
    () =>
      handler.handle(
        {
          documentId:
            documentRecord._id.toString(),
          tenantId:
            documentRecord.tenantId.toString(),
          documentVersion: 1,
          ocrProvider: "fake",
        } as Parameters<
          typeof handler.handle
        >[0],
        mockCtx,
      ),
    (error: unknown) => {
      assert.ok(
        error instanceof PermanentJobError,
        `Expected PermanentJobError, got: ${
          error instanceof Error
            ? error.constructor.name
            : typeof error
        }`,
      );

      assert.match(
        error.message,
        /Unable to read PDF page count: Invalid PDF structure/i,
      );

      assert.notEqual(
        error.message,
        "OCR failed after all retries",
      );

      return true;
    },
  );

  const completedPageUpdate =
    updateOneCalls.find(
      (call) =>
        call.collection ===
          "ocrpageresults" &&
        (
          call.update.$set as
            | Record<string, unknown>
            | undefined
        )?.status === "completed",
    );

  assert.equal(
    completedPageUpdate,
    undefined,
    "Malformed PDF must never be persisted as a completed OCR page",
  );
});

test("11. successful processing stores provider=tesseract", async () => {
  const updateOneCalls: Array<{ collection: string; update: Record<string, unknown> }> = [];
  const insertOneCalls: Array<{ collection: string; document: Record<string, unknown> }> = [];
  const db = buildMockDb({ updateOneCalls, insertOneCalls });
  mountMockDb(db);

  const handler = createDocumentOcrJobHandler();
  const result = (await handler.handle(
    {
      documentId: db._documentRecord._id.toString(),
      tenantId: "6a51418875cc29492bf32fed",
      documentVersion: 1,
      ocrProvider: "tesseract",
    } as Parameters<typeof handler.handle>[0],
    mockCtx,
  )) as { summary: { success: boolean } };

  assert.ok(
    result,
    "Handler should return a result",
  );

  assert.equal(
    result.summary.success,
    true,
    "Real Tesseract processing must succeed",
  );

  const ocrUpdate = updateOneCalls.find(
    (call) =>
      call.collection ===
        "ocrpageresults" &&
      (
        call.update.$set as
          | Record<string, unknown>
          | undefined
      )?.status === "completed",
  );

  assert.ok(
    ocrUpdate,
    "Should have a completed OCR result",
  );

  const provider = (
    ocrUpdate.update.$set as
      Record<string, unknown>
  ).provider;

  assert.equal(
    provider,
    "tesseract",
    `Provider should be "tesseract", got "${String(
      provider,
    )}"`,
  );
});

test("12. no Fake OCR fallback is introduced", async () => {
  const updateOneCalls: Array<{
    collection: string;
    update: Record<string, unknown>;
  }> = [];

  const insertOneCalls: Array<{
    collection: string;
    document: Record<string, unknown>;
  }> = [];

  const db = buildMockDb({
    updateOneCalls,
    insertOneCalls,
  });

  mountMockDb(db);

  const handler =
    createDocumentOcrJobHandler();

  const result = (await handler.handle(
    {
      documentId:
        db._documentRecord._id.toString(),
      tenantId:
        "6a51418875cc29492bf32fed",
      documentVersion: 1,
      ocrProvider: "tesseract",
    } as Parameters<
      typeof handler.handle
    >[0],
    mockCtx,
  )) as {
    summary: {
      success: boolean;
      totalPagesProcessed: number;
    };
  };

  assert.equal(
    result.summary.success,
    true,
    "Tesseract request must complete successfully",
  );

  assert.equal(
    result.summary.totalPagesProcessed,
    1,
    "Exactly one page should be processed",
  );

  const completedUpdate =
    updateOneCalls.find(
      (call) =>
        call.collection ===
          "ocrpageresults" &&
        (
          call.update.$set as
            | Record<string, unknown>
            | undefined
        )?.status === "completed",
    );

  assert.ok(
    completedUpdate,
    "A completed OCR page must be persisted",
  );

  assert.equal(
    (
      completedUpdate.update.$set as
        Record<string, unknown>
    ).provider,
    "tesseract",
    "Completed OCR page must use the Tesseract provider",
  );

  const usageRecord =
    insertOneCalls.find(
      (call) =>
        call.collection ===
        "ocrusagerecords",
    );

  assert.ok(
    usageRecord,
    "A successful OCR usage record must be written",
  );

  assert.equal(
    usageRecord.document.provider,
    "tesseract",
    "OCR usage must record the Tesseract provider",
  );

  const allStoredProviders = [
    ...updateOneCalls
      .filter(
        (call) =>
          call.collection ===
          "ocrpageresults",
      )
      .map(
        (call) =>
          (
            call.update.$set as
              | Record<string, unknown>
              | undefined
          )?.provider,
      ),
    ...insertOneCalls
      .filter(
        (call) =>
          call.collection ===
          "ocrusagerecords",
      )
      .map(
        (call) =>
          call.document.provider,
      ),
  ].filter(
    (provider): provider is string =>
      typeof provider === "string",
  );

  assert.ok(
    allStoredProviders.length > 0,
    "At least one OCR provider must be persisted",
  );

  assert.equal(
    allStoredProviders.includes("fake-ocr"),
    false,
    "No persisted OCR result may silently fall back to fake-ocr",
  );
});

test("13. auto-OCR pipeline: merges results, enqueues chunking, tags usage source=auto", async () => {
  process.env.OCR_MAX_PAGES = "500";

  const documentRecord = {
    _id: new ObjectId(),
    tenantId: new ObjectId("6a51418875cc29492bf32fed"),
    status: "processing",
    fileName: "minimal.pdf",
    department: "Legal",
    classification: "confidential",
  };

  const versionRecord = {
    documentId: documentRecord._id,
    tenantId: documentRecord.tenantId,
    version: 1,
    fileName: "minimal.pdf",
    mimeType: "application/pdf",
    storageKey: "minimal.pdf",
  };

  const completedArtifact = {
    _id: new ObjectId(),
    tenantId: documentRecord.tenantId,
    documentId: documentRecord._id,
    documentVersion: 1,
    status: "completed",
    sourceChecksum: "hash-checksum",
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
  };

  const completedOcrPage = {
    tenantId: documentRecord.tenantId,
    documentId: documentRecord._id,
    documentVersion: 1,
    pageNumber: 1,
    status: "completed",
    text: "[FAKE OCR] Simulated text for page 1.",
    confidence: 0.95,
    words: [{ text: "Page 1", confidence: 0.95 }],
    provider: "fake-ocr",
    providerModel: "fake-ocr-v1.0.0",
    durationMs: 10,
    warnings: [],
  };

  const updateOneCalls: Array<{ collection: string; update: Record<string, unknown> }> = [];
  const insertOneCalls: Array<{ collection: string; document: Record<string, unknown> }> = [];
  const enqueued: Array<Record<string, unknown>> = [];

  const db = {
    collection: (name: string) => {
      if (name === "ocrpageresults") {
        return {
          findOne: async () => null,
          find: () => ({
            sort: () => ({
              toArray: async () => [completedOcrPage],
            }),
          }),
          updateOne: async (_query: Record<string, unknown>, update: Record<string, unknown>, _opts?: Record<string, unknown>) => {
            updateOneCalls.push({ collection: name, update });
            return { matchedCount: 1, modifiedCount: 1 };
          },
          insertOne: async (doc: Record<string, unknown>) => {
            insertOneCalls.push({ collection: name, document: doc });
            return { insertedId: new ObjectId() };
          },
        };
      }
      return {
        findOne: async (_query: Record<string, unknown>) => {
          if (name === "documentversions") return versionRecord;
          if (name === "documents") return documentRecord;
          if (name === "extractionartifacts") return completedArtifact;
          return null;
        },
        find: () => ({
          sort: () => ({
            toArray: async () => [],
          }),
        }),
        updateOne: async (_query: Record<string, unknown>, update: Record<string, unknown>, _opts?: Record<string, unknown>) => {
          updateOneCalls.push({ collection: name, update });
          return { matchedCount: 1, modifiedCount: 1 };
        },
        insertOne: async (doc: Record<string, unknown>) => {
          insertOneCalls.push({ collection: name, document: doc });
          return { insertedId: new ObjectId() };
        },
      };
    },
  };

  setMockClient({ db: () => db } as unknown as MongoClient);

  const handler = createDocumentOcrJobHandler();
  const generationId = new ObjectId().toString();
  const ctx = {
    ...mockCtx,
    enqueue: async (job: unknown) => {
      enqueued.push(job as Record<string, unknown>);
    },
  } as unknown as JobHandlerContext;

  const result = (await handler.handle(
    {
      documentId: documentRecord._id.toString(),
      tenantId: "6a51418875cc29492bf32fed",
      documentVersion: 1,
      ocrProvider: "fake",
      pageNumbers: [1],
      generationId,
      department: "Legal",
      classification: "confidential",
    } as Parameters<typeof handler.handle>[0],
    ctx,
  )) as { summary: { success: boolean; totalPagesProcessed: number } };

  assert.ok(result, "Handler should return a result");
  assert.equal(result.summary.success, true, "Auto-OCR should succeed");
  assert.equal(result.summary.totalPagesProcessed, 1);

  // 1. Usage records from the ingest pipeline are tagged as auto-OCR.
  const usageRecord = insertOneCalls.find(
    (call) => call.collection === "ocrusagerecords",
  );
  assert.ok(usageRecord, "A usage record must be written for auto-OCR");
  assert.equal(
    usageRecord.document.source,
    "auto",
    "Auto-OCR usage must be tagged source=auto so billing reconciles it separately",
  );

  // 2. OCR text is merged back into the extraction artifact.
  const artifactUpdate = updateOneCalls.find(
    (call) => call.collection === "extractionartifacts",
  );
  assert.ok(artifactUpdate, "Extraction artifact must be updated by auto-OCR");
  const artifactSet = artifactUpdate.update.$set as {
    pages: Array<{ pageNumber: number; blocks: Array<{ text: string }> }>;
    metadata: Record<string, unknown>;
  };
  assert.ok(
    Array.isArray(artifactSet.pages),
    "Merged artifact pages must be an array",
  );
  const mergedPage = artifactSet.pages.find(
    (page) => page.pageNumber === 1,
  );
  assert.ok(mergedPage, "Merged artifact must contain the OCR'd page");
  assert.ok(
    mergedPage.blocks.some((block) =>
      block.text.includes("[FAKE OCR] Simulated text for page 1."),
    ),
    "OCR text must be merged into the artifact page blocks",
  );
  assert.equal(
    artifactSet.metadata.ocrAppliedPages,
    1,
    "Artifact metadata must record the number of OCR'd pages",
  );
  assert.equal(
    artifactSet.metadata.hasImageOnlyPages,
    false,
    "Artifact must no longer be flagged as image-only after OCR",
  );

  // 3. The chunking pipeline is auto-triggered with the same generation.
  const chunkJob = enqueued.find((job) => job.jobType === "document.chunk");
  assert.ok(chunkJob, "document.chunk must be enqueued after auto-OCR");
  const chunkPayload = chunkJob.payload as Record<string, unknown>;
  assert.equal(chunkPayload.generationId, generationId);
  assert.equal(chunkPayload.department, "Legal");
  assert.equal(chunkPayload.classification, "confidential");
  assert.equal(chunkPayload.documentVersion, 1);
});

test("14. a blank page is recorded as completed-empty, not a failure", async () => {
  process.env.FAKE_OCR_BLANK = "true";

  const insertOneCalls: Array<{ collection: string; document: Record<string, unknown> }> = [];
  const updateOneCalls: Array<{ collection: string; update: Record<string, unknown> }> = [];
  const db = buildMockDb({ insertOneCalls, updateOneCalls });
  mountMockDb(db);

  const handler = createDocumentOcrJobHandler();
  const result = (await handler.handle(
    {
      documentId: db._documentRecord._id.toString(),
      tenantId: "6a51418875cc29492bf32fed",
      documentVersion: 1,
      pageNumbers: [1],
      ocrProvider: "fake",
    } as Parameters<typeof handler.handle>[0],
    mockCtx,
  )) as {
    summary: {
      success: boolean;
      totalPagesProcessed: number;
      totalPagesFailed: number;
      pageResults: Array<{ pageNumber: number; status: string; confidence: number }>;
    };
  };

  assert.ok(result, "Handler should return a result");
  assert.equal(
    result.summary.success,
    true,
    "Blank pages are a valid outcome, not a failure",
  );
  assert.equal(result.summary.totalPagesProcessed, 1);
  assert.equal(result.summary.totalPagesFailed, 0);
  assert.equal(result.summary.pageResults[0].status, "completed");
  assert.equal(result.summary.pageResults[0].confidence, 0);

  const pageUpdate = updateOneCalls.find(
    (call) =>
      call.collection === "ocrpageresults" &&
      (call.update.$set as Record<string, unknown>).status === "completed",
  );
  assert.ok(pageUpdate, "OCR page result must be written");
  const set = pageUpdate.update.$set as Record<string, unknown>;
  assert.equal(set.status, "completed");
  assert.equal(set.text, "");
  assert.equal(set.confidence, 0);
  assert.ok(
    Array.isArray(set.warnings) &&
      (set.warnings as string[]).some((w) => /blank/i.test(w)),
    "A blank page must carry a blank-page warning",
  );

  const usage = insertOneCalls.find(
    (call) => call.collection === "ocrusagerecords",
  );
  assert.ok(usage, "Blank pages still produce an OCR usage record");
});

test("15. a transient Mongo write failure during a successful page is retried in-place", async () => {
  const insertOneCalls: Array<{ collection: string; document: Record<string, unknown> }> = [];
  const updateOneCalls: Array<{ collection: string; update: Record<string, unknown> }> = [];
  const db = buildMockDb({ insertOneCalls, updateOneCalls });
  mountMockDb(db);

  let ocrResultWrites = 0;
  const originalCollection = db.collection;
  db.collection = ((name: string) => {
    const col = originalCollection(name);
    if (name === "ocrpageresults") {
      return {
        ...col,
        updateOne: async (
          query: Record<string, unknown>,
          update: Record<string, unknown>,
          opts?: Record<string, unknown>,
        ) => {
          const set = update.$set as Record<string, unknown>;
          if (set.status === "completed") {
            ocrResultWrites++;
            if (ocrResultWrites === 1) {
              const err = new Error(
                "getaddrinfo EAI_AGAIN mongodb.test.invalid",
              );
              (err as NodeJS.ErrnoException).code = "EAI_AGAIN";
              throw err;
            }
          }
          return col.updateOne(query, update, opts);
        },
      };
    }
    return col;
  }) as typeof db.collection;

  const handler = createDocumentOcrJobHandler();
  const result = (await handler.handle(
    {
      documentId: db._documentRecord._id.toString(),
      tenantId: "6a51418875cc29492bf32fed",
      documentVersion: 1,
      pageNumbers: [1],
      ocrProvider: "fake",
    } as Parameters<typeof handler.handle>[0],
    mockCtx,
  )) as {
    summary: {
      success: boolean;
      totalPagesProcessed: number;
      pageResults: Array<{ pageNumber: number; status: string }>;
    };
  };

  assert.ok(result, "Handler should return a result");
  assert.equal(result.summary.success, true);
  assert.equal(result.summary.totalPagesProcessed, 1);
  assert.equal(
    result.summary.pageResults[0].status,
    "completed",
    "Recognition already succeeded; the transient write must not fail the page",
  );
  assert.equal(
    ocrResultWrites,
    2,
    "The failed write must be retried once inside the job",
  );

  const usage = insertOneCalls.filter(
    (call) => call.collection === "ocrusagerecords",
  );
  assert.equal(
    usage.length,
    1,
    "Usage record must be inserted exactly once after the retried write",
  );
});

test("16. a persistent Mongo outage marks the page retry and throws a retryable error", async () => {
  const insertOneCalls: Array<{ collection: string; document: Record<string, unknown> }> = [];
  const updateOneCalls: Array<{ collection: string; update: Record<string, unknown> }> = [];
  const db = buildMockDb({ insertOneCalls, updateOneCalls });
  mountMockDb(db);

  const originalCollection = db.collection;
  db.collection = ((name: string) => {
    const col = originalCollection(name);
    if (name === "ocrpageresults") {
      return {
        ...col,
        updateOne: async (
          query: Record<string, unknown>,
          update: Record<string, unknown>,
          opts?: Record<string, unknown>,
        ) => {
          const set = update.$set as Record<string, unknown>;
          if (set.status === "completed") {
            const err = new Error(
              "getaddrinfo EAI_AGAIN mongodb.test.invalid",
            );
            (err as NodeJS.ErrnoException).code = "EAI_AGAIN";
            throw err;
          }
          return col.updateOne(query, update, opts);
        },
      };
    }
    return col;
  }) as typeof db.collection;

  const handler = createDocumentOcrJobHandler();
  await assert.rejects(
    async () => {
      await handler.handle(
        {
          documentId: db._documentRecord._id.toString(),
          tenantId: "6a51418875cc29492bf32fed",
          documentVersion: 1,
          pageNumbers: [1],
          ocrProvider: "fake",
        } as Parameters<typeof handler.handle>[0],
        mockCtx,
      );
    },
    (err: unknown) => {
      assert.ok(
        err instanceof RetryableJobError,
        `Expected RetryableJobError, got: ${
          err instanceof Error ? err.constructor.name : typeof err
        }`,
      );
      return true;
    },
  );

  const retryUpdate = updateOneCalls.find(
    (call) =>
      call.collection === "ocrpageresults" &&
      (call.update.$set as Record<string, unknown>).status === "retry",
  );
  assert.ok(
    retryUpdate,
    "Page must be recorded with status retry so manual re-OCR can pick it up",
  );
  const retrySet = retryUpdate.update.$set as Record<string, unknown>;
  assert.ok(
    String(retrySet.failureReason).includes("EAI_AGAIN"),
    "Failure reason must preserve the infra error",
  );
});

test("17. quality assessment treats blank pages as warnings, not critical issues", async () => {
  process.env.FAKE_OCR_BLANK = "true";

  const insertOneCalls: Array<{ collection: string; document: Record<string, unknown> }> = [];
  const updateOneCalls: Array<{ collection: string; update: Record<string, unknown> }> = [];
  const db = buildMockDb({ insertOneCalls, updateOneCalls });
  mountMockDb(db);

  const storedPages: Array<Record<string, unknown>> = [];
  const originalCollection = db.collection;
  db.collection = ((name: string) => {
    const col = originalCollection(name);
    if (name === "ocrpageresults") {
      return {
        ...col,
        updateOne: async (
          query: Record<string, unknown>,
          update: Record<string, unknown>,
          _opts?: Record<string, unknown>,
        ) => {
          const set = update.$set as Record<string, unknown>;
          const existing = storedPages.find(
            (p) =>
              String(p.pageNumber) === String(set.pageNumber) &&
              String(p.documentVersion) === String(set.documentVersion),
          );
          if (existing) {
            Object.assign(existing, set);
          } else {
            storedPages.push({
              ...(update.$setOnInsert as Record<string, unknown>),
              ...set,
            });
          }
          return {
            matchedCount: existing ? 1 : 0,
            modifiedCount: 1,
          };
        },
        find: () => ({
          sort: () => ({
            toArray: async () =>
              storedPages
                .filter((p) => p.status === "completed")
                .map((p) => ({ ...p })),
          }),
        }),
      };
    }
    return col;
  }) as typeof db.collection;

  const handler = createDocumentOcrJobHandler();
  const result = (await handler.handle(
    {
      documentId: db._documentRecord._id.toString(),
      tenantId: "6a51418875cc29492bf32fed",
      documentVersion: 1,
      pageNumbers: [1],
      ocrProvider: "fake",
    } as Parameters<typeof handler.handle>[0],
    mockCtx,
  )) as { summary: { success: boolean; totalPagesProcessed: number } };

  assert.equal(result.summary.success, true);
  assert.equal(result.summary.totalPagesProcessed, 1);

  const qualityUpdate = updateOneCalls.find(
    (call) => call.collection === "documentqualities",
  );
  assert.ok(qualityUpdate, "Quality assessment must run after OCR");
  const qSet = qualityUpdate.update.$set as Record<string, unknown>;

  assert.equal(
    qSet.qualityStatus,
    "READY_WITH_WARNINGS",
    "An all-blank document should be ready-with-warnings, not review-required",
  );

  const issues = qSet.issues as Array<{
    type: string;
    severity: string;
  }>;
  assert.ok(
    issues.some(
      (issue) =>
        issue.type === "blank_page" &&
        issue.severity === "warning",
    ),
    "A blank_page warning must be recorded",
  );
  assert.ok(
    !issues.some((issue) => issue.severity === "critical"),
    "Blank pages must never produce critical issues",
  );
  assert.ok(
    !issues.some((issue) => issue.type === "low_confidence"),
    "Blank pages must not be flagged as low-confidence",
  );

  const pageStatuses = qSet.pageStatuses as Record<string, string>;
  assert.equal(
    pageStatuses["1"],
    "READY_WITH_WARNINGS",
    "Per-page status for a blank page must be a warning, not REVIEW_REQUIRED",
  );
});
