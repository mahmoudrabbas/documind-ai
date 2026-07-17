import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId, type MongoClient } from "mongodb";
import * as path from "node:path";
import { createDocumentExtractionJobHandler } from "./documentExtractionJob.js";
import { setMockClient } from "../db/mongo.js";
import { config } from "../config/index.js";
import type { JobHandlerContext } from "../contracts/jobDispatcher.js";
import { PermanentJobError } from "../contracts/retryPolicy.js";

const FIXTURES_DIR = path.resolve(process.cwd(), "api/src/providers/extraction/__fixtures__");
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
