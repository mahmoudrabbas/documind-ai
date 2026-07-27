import { describe, test, expect, beforeAll, afterAll, afterEach, beforeEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import DocumentModel from "../../../../db/models/document.model.js";
import IndexGenerationModel from "../../../../db/models/indexGeneration.model.js";
import DocumentChunkModel from "../../../../db/models/documentChunk.model.js";
import ChunkEmbeddingModel from "../../../../db/models/chunkEmbedding.model.js";
import TenantModel from "../../../../db/models/tenant.model.js";
import {
  startGeneration,
  persistChunks,
  persistEmbeddings,
} from "../generation.service.js";
import { findChunksByGeneration } from "../../documentChunk.repository.js";
import { FakeVectorIndex } from "../../../../providers/vector-index/fakeVectorIndex.js";
import { FakeKeywordIndex } from "../../../../providers/keyword-index/fakeKeywordIndex.js";
import { runVerification } from "../verification.service.js";

let mongoServer: MongoMemoryServer | null = null;

const TENANT_ID = new mongoose.Types.ObjectId();
const DOC_ID = new mongoose.Types.ObjectId();

beforeAll(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "stale-access-test" });
  } else {
    mongoServer = await MongoMemoryServer.create({
      binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
      instance: { launchTimeout: 60_000 },
    });
    await mongoose.connect(mongoServer.getUri(), { dbName: "stale-access-test" });
  }
  await Promise.all([
    DocumentModel.init(),
    IndexGenerationModel.init(),
    DocumentChunkModel.init(),
    ChunkEmbeddingModel.init(),
    TenantModel.init(),
  ]);
}, 30_000);

afterAll(async () => {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  } finally {
    if (mongoServer) await mongoServer.stop();
  }
}, 30_000);

afterEach(async () => {
  await Promise.all([
    DocumentModel.deleteMany({}),
    IndexGenerationModel.deleteMany({}),
    DocumentChunkModel.deleteMany({}),
    ChunkEmbeddingModel.deleteMany({}),
    TenantModel.deleteMany({}),
  ]);
}, 30_000);

beforeEach(async () => {
  await Promise.all([
    DocumentModel.deleteMany({}),
    IndexGenerationModel.deleteMany({}),
    DocumentChunkModel.deleteMany({}),
    ChunkEmbeddingModel.deleteMany({}),
  ]);

  await TenantModel.updateOne(
    { _id: TENANT_ID },
    { $set: { name: "Test Tenant", slug: "test-tenant", status: "active", plan: "free" } },
    { upsert: true },
  );

  await DocumentModel.create({
    _id: DOC_ID,
    tenantId: TENANT_ID,
    fileName: "test.pdf",
    originalFileName: "test.pdf",
    status: "processed",
    version: 1,
    searchStatus: "READY",
    uploadedBy: new mongoose.Types.ObjectId(),
    checksum: "sha256-test",
    storageKey: "uploads/test.pdf",
    mimeType: "application/pdf",
    fileSize: 1024,
  });
}, 30_000);

async function buildAndActivateGeneration(
  tenantId: string,
  documentId: string,
  policyVersion: string | null,
  chunkText: string,
  vectorFill: number,
) {
  const gen = await startGeneration({
    tenantId,
    documentId,
    documentVersion: 1,
    triggeredBy: "INITIAL",
  });

  await persistChunks(tenantId, documentId, 1, gen._id.toString(), [
    {
      text: chunkText,
      sectionPath: ["Article 1"],
      pageStart: 1,
      pageEnd: 1,
      offsetStart: 0,
      offsetEnd: chunkText.length,
      contentType: "clause",
      language: "en",
      partIndex: null,
      partCount: null,
      tokenCount: 10,
    },
  ], null, null, policyVersion);

  await persistEmbeddings(tenantId, gen._id.toString(), documentId, [
    {
      chunkId: (await findChunksByGeneration(tenantId, documentId, gen._id.toString()))[0]._id.toString(),
      vector: new Array(1024).fill(vectorFill),
      tokenUsage: 10,
      costUsd: 0.0001,
      modelVersion: "test",
    },
  ], { providerName: "fake", modelName: "fake", dimensions: 1024 });

  const vectorIndex = new FakeVectorIndex();
  const keywordIndex = new FakeKeywordIndex();
  await vectorIndex.ensureIndex(1024);
  await keywordIndex.ensureIndex();

  await runVerification({
    tenantId,
    generationId: gen._id.toString(),
    vectorIndex,
    keywordIndex,
  });

  return gen;
}

describe("stale-access: after permission revocation and re-generation", () => {
  const tenantId = () => TENANT_ID.toString();
  const documentId = () => DOC_ID.toString();

  test("build v1, then revoke access and build v2 — old generation is retired", async () => {
    const tid = tenantId();
    const did = documentId();

    const gen1 = await buildAndActivateGeneration(tid, did, "policy-v1", "Secret clause A - v1 content", 0.1);

    const doc1 = await DocumentModel.findById(DOC_ID).lean();
    expect(doc1?.searchStatus).toBe("READY");
    expect(doc1?.activeChunkGeneration?.toString()).toBe(gen1._id.toString());

    const gen2 = await startGeneration({
      tenantId: tid,
      documentId: did,
      documentVersion: 1,
      triggeredBy: "ACCESS_POLICY_CHANGE",
    });

    const doc2 = await DocumentModel.findById(DOC_ID).lean();
    expect(doc2?.searchStatus).toBe("STALE");
    expect(doc2?.currentGeneration?.toString()).toBe(gen2._id.toString());

    await persistChunks(tid, did, 1, gen2._id.toString(), [
      {
        text: "Secret clause A - v2 content with restricted access",
        sectionPath: ["Article 1"],
        pageStart: 1,
        pageEnd: 1,
        offsetStart: 0,
        offsetEnd: 50,
        contentType: "clause",
        language: "en",
        partIndex: null,
        partCount: null,
        tokenCount: 12,
      },
    ], null, null, "policy-v2");

    await persistEmbeddings(tid, gen2._id.toString(), did, [
      {
        chunkId: (await findChunksByGeneration(tid, did, gen2._id.toString()))[0]._id.toString(),
        vector: new Array(1024).fill(0.2),
        tokenUsage: 12,
        costUsd: 0.00012,
        modelVersion: "test",
      },
    ], { providerName: "fake", modelName: "fake", dimensions: 1024 });

    const vectorIndex = new FakeVectorIndex();
    const keywordIndex = new FakeKeywordIndex();
    await vectorIndex.ensureIndex(1024);
    await keywordIndex.ensureIndex();

    await runVerification({ tenantId: tid, generationId: gen2._id.toString(), vectorIndex, keywordIndex });

    const doc3 = await DocumentModel.findById(DOC_ID).lean();
    expect(doc3?.searchStatus).toBe("READY");
    expect(doc3?.activeChunkGeneration?.toString()).toBe(gen2._id.toString());
    expect(doc3?.currentGeneration).toBeNull();

    const gen1After = await IndexGenerationModel.findById(gen1._id).lean();
    expect(gen1After?.status).toBe("RETIRED");

    const gen2After = await IndexGenerationModel.findById(gen2._id).lean();
    expect(gen2After?.status).toBe("ACTIVE");

    const v2Chunks = await findChunksByGeneration(tid, did, gen2._id.toString());
    expect(v2Chunks.length).toBe(1);
    expect(v2Chunks[0].accessPolicyVersion).toBe("policy-v2");
  }, 30_000);

  test("rollback leaves old generation active and clears currentGeneration", async () => {
    const tid = tenantId();
    const did = documentId();

    const gen1 = await buildAndActivateGeneration(tid, did, null, "Content for v1", 0.1);

    const doc1 = await DocumentModel.findById(DOC_ID).lean();
    expect(doc1?.searchStatus).toBe("READY");

    const gen2 = await startGeneration({
      tenantId: tid,
      documentId: did,
      documentVersion: 1,
      triggeredBy: "REINDEX",
    });

    const docDuring = await DocumentModel.findById(DOC_ID).lean();
    expect(docDuring?.searchStatus).toBe("STALE");
    expect(docDuring?.currentGeneration?.toString()).toBe(gen2._id.toString());

    const { rollbackGeneration } = await import("../generation.service.js");
    await rollbackGeneration(tid, gen2._id.toString());

    const docAfter = await DocumentModel.findById(DOC_ID).lean();
    expect(docAfter?.searchStatus).toBe("READY");
    expect(docAfter?.activeChunkGeneration?.toString()).toBe(gen1._id.toString());
    expect(docAfter?.currentGeneration).toBeNull();
    expect(docAfter?.lastProcessingError).toBeNull();

    const gen1Final = await IndexGenerationModel.findById(gen1._id).lean();
    expect(gen1Final?.status).toBe("ACTIVE");

    const gen2Final = await IndexGenerationModel.findById(gen2._id).lean();
    expect(gen2Final?.status).toBe("FAILED");
    expect(gen2Final?.failureReason?.code).toBe("ROLLBACK");
  }, 30_000);

  test("startGeneration sets currentGeneration and lastSearchStatusChange", async () => {
    const tid = tenantId();
    const did = documentId();

    const before = new Date();
    const gen = await startGeneration({
      tenantId: tid,
      documentId: did,
      documentVersion: 1,
      triggeredBy: "INITIAL",
    });

    const doc = await DocumentModel.findById(DOC_ID).lean();
    expect(doc?.searchStatus).toBe("STALE");
    expect(doc?.currentGeneration?.toString()).toBe(gen._id.toString());
    expect(doc?.lastSearchStatusChange).toBeDefined();
    expect(doc!.lastSearchStatusChange.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  test("activateGeneration clears currentGeneration and lastProcessingError", async () => {
    const tid = tenantId();
    const did = documentId();

    await DocumentModel.findOneAndUpdate(
      { _id: DOC_ID },
      { $set: { lastProcessingError: { stage: "test", code: "TEST", message: "test error" } } },
    );

    await buildAndActivateGeneration(tid, did, null, "content", 0.1);

    const doc = await DocumentModel.findById(DOC_ID).lean();
    expect(doc?.currentGeneration).toBeNull();
    expect(doc?.lastProcessingError).toBeNull();
  });

  test("failGeneration sets lastProcessingError and lastSearchStatusChange", async () => {
    const tid = tenantId();
    const did = documentId();

    const gen = await startGeneration({
      tenantId: tid,
      documentId: did,
      documentVersion: 1,
      triggeredBy: "INITIAL",
    });

    const { failGeneration } = await import("../generation.service.js");
    const before = new Date();
    await failGeneration(tid, gen._id.toString(), "embed", "PROVIDER_ERROR", "Rate limited");

    const doc = await DocumentModel.findById(DOC_ID).lean();
    expect(doc?.searchStatus).toBe("FAILED");
    expect(doc?.lastProcessingError).toEqual({ stage: "embed", code: "PROVIDER_ERROR", message: "Rate limited" });
    expect(doc!.lastSearchStatusChange.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });
});
