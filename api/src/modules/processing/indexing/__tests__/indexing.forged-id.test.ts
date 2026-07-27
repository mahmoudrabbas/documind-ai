import { describe, test, expect, beforeAll, afterAll, afterEach, beforeEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import DocumentModel from "../../../../db/models/document.model.js";
import IndexGenerationModel from "../../../../db/models/indexGeneration.model.js";
import DocumentChunkModel from "../../../../db/models/documentChunk.model.js";
import ChunkEmbeddingModel from "../../../../db/models/chunkEmbedding.model.js";
import TenantModel from "../../../../db/models/tenant.model.js";
import {
  findGenerationById,
  findActiveGenerationByDocument,
  updateGenerationStatus,
} from "../../indexGeneration.repository.js";
import {
  findChunksByGeneration,
  countChunksByGeneration,
  updateChunkStatus,
} from "../../documentChunk.repository.js";
import {
  countEmbeddingsByGeneration,
  findEmbeddingsByGeneration,
} from "../../chunkEmbedding.repository.js";

let mongoServer: MongoMemoryServer | null = null;

const TENANT_A = new mongoose.Types.ObjectId();
const TENANT_B = new mongoose.Types.ObjectId();
const DOC_A = new mongoose.Types.ObjectId();
const DOC_B = new mongoose.Types.ObjectId();
const GEN_A = new mongoose.Types.ObjectId();
const GEN_B = new mongoose.Types.ObjectId();
const CHUNK_A = new mongoose.Types.ObjectId();
const CHUNK_B = new mongoose.Types.ObjectId();
const EMBED_A = new mongoose.Types.ObjectId();
const EMBED_B = new mongoose.Types.ObjectId();

beforeAll(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "forged-id-test" });
  } else {
    mongoServer = await MongoMemoryServer.create({
      binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
      instance: { launchTimeout: 60_000 },
    });
    await mongoose.connect(mongoServer.getUri(), { dbName: "forged-id-test" });
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
    { _id: TENANT_A },
    { $set: { name: "Tenant A", slug: "tenant-a", status: "active", plan: "free" } },
    { upsert: true },
  );
  await TenantModel.updateOne(
    { _id: TENANT_B },
    { $set: { name: "Tenant B", slug: "tenant-b", status: "active", plan: "free" } },
    { upsert: true },
  );

  await DocumentModel.create({
    _id: DOC_A,
    tenantId: TENANT_A,
    fileName: "doc-a.pdf",
    originalFileName: "doc-a.pdf",
    status: "processed",
    version: 1,
    searchStatus: "READY",
    activeChunkGeneration: GEN_A,
    uploadedBy: new mongoose.Types.ObjectId(),
    checksum: "sha256-a",
    storageKey: "uploads/doc-a.pdf",
    mimeType: "application/pdf",
    fileSize: 1024,
  });
  await DocumentModel.create({
    _id: DOC_B,
    tenantId: TENANT_B,
    fileName: "doc-b.pdf",
    originalFileName: "doc-b.pdf",
    status: "processed",
    version: 1,
    searchStatus: "READY",
    activeChunkGeneration: GEN_B,
    uploadedBy: new mongoose.Types.ObjectId(),
    checksum: "sha256-b",
    storageKey: "uploads/doc-b.pdf",
    mimeType: "application/pdf",
    fileSize: 2048,
  });

  await IndexGenerationModel.create({
    _id: GEN_A,
    tenantId: TENANT_A,
    documentId: DOC_A,
    documentVersion: 1,
    generationNumber: 1,
    status: "ACTIVE",
    expectedChunkCount: 1,
    actualChunkCount: 1,
    expectedEmbeddingCount: 1,
    actualEmbeddingCount: 1,
    atlasIndexName: "vidx_chunk_embeddings_v1",
    atlasIndexStatus: "READY",
    triggeredBy: "INITIAL",
    chunkingConfig: { strategy: "structural", maxTokensPerChunk: 512 },
  });
  await IndexGenerationModel.create({
    _id: GEN_B,
    tenantId: TENANT_B,
    documentId: DOC_B,
    documentVersion: 1,
    generationNumber: 1,
    status: "ACTIVE",
    expectedChunkCount: 1,
    actualChunkCount: 1,
    expectedEmbeddingCount: 1,
    actualEmbeddingCount: 1,
    atlasIndexName: "vidx_chunk_embeddings_v1",
    atlasIndexStatus: "READY",
    triggeredBy: "INITIAL",
    chunkingConfig: { strategy: "structural", maxTokensPerChunk: 512 },
  });

  await DocumentChunkModel.create({
    _id: CHUNK_A,
    tenantId: TENANT_A,
    documentId: DOC_A,
    documentVersion: 1,
    generationId: GEN_A,
    chunkIndex: 0,
    sectionPath: ["Article 1", "Clause 1.1"],
    pageStart: 1,
    pageEnd: 1,
    offsetStart: 0,
    offsetEnd: 100,
    contentType: "clause",
    language: "en",
    department: null,
    classification: "confidential",
    accessPolicyVersion: "policy-a",
    text: "Tenant A confidential clause content",
    checksum: "checksum-a",
    tokenCount: 10,
    status: "ACTIVE",
    partIndex: null,
    partCount: null,
  });
  await DocumentChunkModel.create({
    _id: CHUNK_B,
    tenantId: TENANT_B,
    documentId: DOC_B,
    documentVersion: 1,
    generationId: GEN_B,
    chunkIndex: 0,
    sectionPath: ["Article 1", "Clause 1.1"],
    pageStart: 1,
    pageEnd: 1,
    offsetStart: 0,
    offsetEnd: 80,
    contentType: "clause",
    language: "ar",
    department: null,
    classification: "restricted",
    accessPolicyVersion: "policy-b",
    text: "Tenant B restricted clause content",
    checksum: "checksum-b",
    tokenCount: 8,
    status: "ACTIVE",
    partIndex: null,
    partCount: null,
  });

  await ChunkEmbeddingModel.create({
    _id: EMBED_A,
    tenantId: TENANT_A,
    documentId: DOC_A,
    chunkId: CHUNK_A,
    generationId: GEN_A,
    provider: "openai",
    modelName: "text-embedding-3-small",
    modelVersion: "2024-01-01",
    dimensions: 1536,
    vector: new Array(1536).fill(0.1),
    embeddingChecksum: "emb-checksum-a",
    department: null,
    classification: "confidential",
    accessPolicyVersion: "policy-a",
    language: "en",
    contentType: "clause",
    tokenUsage: 10,
    costUsd: 0.0001,
  });
  await ChunkEmbeddingModel.create({
    _id: EMBED_B,
    tenantId: TENANT_B,
    documentId: DOC_B,
    chunkId: CHUNK_B,
    generationId: GEN_B,
    provider: "openai",
    modelName: "text-embedding-3-small",
    modelVersion: "2024-01-01",
    dimensions: 1536,
    vector: new Array(1536).fill(0.2),
    embeddingChecksum: "emb-checksum-b",
    department: null,
    classification: "restricted",
    accessPolicyVersion: "policy-b",
    language: "ar",
    contentType: "clause",
    tokenUsage: 8,
    costUsd: 0.00008,
  });
}, 30_000);

describe("forged-ID cross-tenant isolation", () => {
  test("tenant A cannot read tenant B generation with forged ID", async () => {
    const gen = await findGenerationById(TENANT_A.toString(), GEN_B.toString());
    expect(gen).toBeNull();
  });

  test("tenant A cannot find active generation for tenant B document", async () => {
    const active = await findActiveGenerationByDocument(TENANT_A.toString(), DOC_B.toString());
    expect(active).toBeNull();
  });

  test("tenant A cannot read tenant B chunks with forged generation ID", async () => {
    const chunks = await findChunksByGeneration(TENANT_A.toString(), DOC_B.toString(), GEN_B.toString());
    expect(chunks.length).toBe(0);
  });

  test("tenant A counts 0 chunks for tenant B document", async () => {
    const count = await countChunksByGeneration(TENANT_A.toString(), DOC_B.toString(), GEN_B.toString());
    expect(count).toBe(0);
  });

  test("tenant A cannot read tenant B embeddings with forged ID", async () => {
    const embeddings = await findEmbeddingsByGeneration(TENANT_A.toString(), GEN_B.toString());
    expect(embeddings.length).toBe(0);
  });

  test("tenant A counts 0 embeddings for tenant B generation", async () => {
    const count = await countEmbeddingsByGeneration(TENANT_A.toString(), GEN_B.toString());
    expect(count).toBe(0);
  });

  test("updateGenerationStatus with forged ID affects 0 documents", async () => {
    const result = await updateGenerationStatus(TENANT_A.toString(), GEN_B.toString(), { status: "FAILED" });
    expect(result.matchedCount).toBe(0);

    const genB = await IndexGenerationModel.findById(GEN_B).lean();
    expect(genB?.status).toBe("ACTIVE");
  });

  test("updateChunkStatus with forged ID affects 0 documents", async () => {
    const result = await updateChunkStatus(TENANT_A.toString(), CHUNK_B.toString(), "RETIRED");
    expect(result.matchedCount).toBe(0);

    const chunkB = await DocumentChunkModel.findById(CHUNK_B).lean();
    expect(chunkB?.status).toBe("ACTIVE");
  });

  test("tenant A can still read its own data normally", async () => {
    const gen = await findGenerationById(TENANT_A.toString(), GEN_A.toString());
    expect(gen).not.toBeNull();
    expect(gen?.status).toBe("ACTIVE");

    const chunks = await findChunksByGeneration(TENANT_A.toString(), DOC_A.toString(), GEN_A.toString());
    expect(chunks.length).toBe(1);
    expect(chunks[0].accessPolicyVersion).toBe("policy-a");

    const embeddings = await findEmbeddingsByGeneration(TENANT_A.toString(), GEN_A.toString());
    expect(embeddings.length).toBe(1);
  });

  test("schema enforces required tenantId field on DocumentChunk", async () => {
    await expect(
      DocumentChunkModel.create({
        documentId: DOC_A,
        documentVersion: 1,
        generationId: GEN_A,
        chunkIndex: 99,
        sectionPath: [],
        pageStart: 1,
        pageEnd: 1,
        offsetStart: 0,
        offsetEnd: 10,
        contentType: "paragraph",
        language: "en",
        text: "forged chunk",
        checksum: "forged",
        tokenCount: 1,
        status: "DRAFT",
      }),
    ).rejects.toThrow(/tenantId/);
  });

  test("DocumentChunk carries accessPolicyVersion from chunk-build time", async () => {
    const chunk = await DocumentChunkModel.findById(CHUNK_A).lean();
    expect(chunk?.accessPolicyVersion).toBe("policy-a");

    const chunkB = await DocumentChunkModel.findById(CHUNK_B).lean();
    expect(chunkB?.accessPolicyVersion).toBe("policy-b");
  });

  test("ChunkEmbedding carries accessPolicyVersion from its chunk", async () => {
    const embedA = await ChunkEmbeddingModel.findById(EMBED_A).lean();
    expect(embedA?.accessPolicyVersion).toBe("policy-a");

    const embedB = await ChunkEmbeddingModel.findById(EMBED_B).lean();
    expect(embedB?.accessPolicyVersion).toBe("policy-b");
  });
});
