import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { ObjectId, type MongoClient } from "mongodb";
import { createDocumentOcrJobHandler } from "./documentOcrJob.js";
import { setMockClient } from "../db/mongo.js";
import { config } from "../config/index.js";
import type { JobHandlerContext } from "../contracts/jobDispatcher.js";
import { PermanentJobError } from "../contracts/retryPolicy.js";

const FIXTURES_DIR = fileURLToPath(
  new URL("./__fixtures__/", import.meta.url),
);
config.UPLOAD_DIR = FIXTURES_DIR;

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_OCR_PROVIDER = process.env.OCR_PROVIDER;
const ORIGINAL_OCR_MAX_PAGES = process.env.OCR_MAX_PAGES;

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
