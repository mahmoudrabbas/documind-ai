import test, { after, afterEach, before, beforeEach } from "node:test";
import assert from "node:assert";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import DocumentModel from "../../../../db/models/document.model.js";
import IndexGenerationModel from "../../../../db/models/indexGeneration.model.js";
import DocumentChunkModel from "../../../../db/models/documentChunk.model.js";
import ChunkEmbeddingModel from "../../../../db/models/chunkEmbedding.model.js";
import TenantModel from "../../../../db/models/tenant.model.js";
import UserModel from "../../../../db/models/user.model.js";
import {
  findGenerationById,
  findActiveGenerationByDocument,
  updateGenerationStatus,
  retireActiveGeneration,
} from "../../indexGeneration.repository.js";
import {
  findChunksByGeneration,
  countChunksByGeneration,
  updateChunkStatus,
  retireChunksByGeneration,
} from "../../documentChunk.repository.js";
import {
  countEmbeddingsByGeneration,
  findEmbeddingsByGeneration,
  deleteEmbeddingsByGeneration,
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

before(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "indexing-tenant-isolation" });
  } else {
    mongoServer = await MongoMemoryServer.create({
      binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
      instance: { launchTimeout: 60_000 },
    });
    await mongoose.connect(mongoServer.getUri(), { dbName: "indexing-tenant-isolation" });
  }
});

after(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

afterEach(async () => {
  await DocumentModel.deleteMany({});
  await IndexGenerationModel.deleteMany({});
  await DocumentChunkModel.deleteMany({});
  await ChunkEmbeddingModel.deleteMany({});
  await TenantModel.deleteMany({});
  await UserModel.deleteMany({});
});

beforeEach(async () => {
  await DocumentModel.deleteMany({});
  await IndexGenerationModel.deleteMany({});
  await DocumentChunkModel.deleteMany({});
  await ChunkEmbeddingModel.deleteMany({});

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
    expectedChunkCount: 2,
    actualChunkCount: 2,
    expectedEmbeddingCount: 2,
    actualEmbeddingCount: 2,
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
    sectionPath: ["Section 1"],
    pageStart: 1,
    pageEnd: 1,
    offsetStart: 0,
    offsetEnd: 100,
    contentType: "paragraph",
    language: "en",
    department: null,
    classification: null,
    text: "Tenant A chunk content",
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
    sectionPath: ["Section 1"],
    pageStart: 1,
    pageEnd: 1,
    offsetStart: 0,
    offsetEnd: 80,
    contentType: "paragraph",
    language: "ar",
    department: null,
    classification: null,
    text: "Tenant B chunk content",
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
    classification: null,
    accessPolicyVersion: null,
    language: "en",
    contentType: "paragraph",
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
    classification: null,
    accessPolicyVersion: null,
    language: "ar",
    contentType: "paragraph",
    tokenUsage: 8,
    costUsd: 0.00008,
  });
});

test("indexing tenant isolation", async (t) => {
  await t.test("IndexGeneration: tenant A cannot read tenant B generation by ID", async () => {
    const gen = await findGenerationById(TENANT_A.toString(), GEN_B.toString());
    assert.equal(gen, null, "Tenant A should not see tenant B generation");
  });

  await t.test("IndexGeneration: tenant B cannot read tenant A generation by ID", async () => {
    const gen = await findGenerationById(TENANT_B.toString(), GEN_A.toString());
    assert.equal(gen, null, "Tenant B should not see tenant A generation");
  });

  await t.test("IndexGeneration: tenant A can read its own generation", async () => {
    const gen = await findGenerationById(TENANT_A.toString(), GEN_A.toString());
    assert.ok(gen, "Tenant A should see its own generation");
    assert.equal(gen.documentId.toString(), DOC_A.toString());
  });

  await t.test("IndexGeneration: findActiveGenerationByDocument is tenant-scoped", async () => {
    const activeA = await findActiveGenerationByDocument(TENANT_A.toString(), DOC_A.toString());
    assert.ok(activeA, "Tenant A should find its active generation");
    assert.equal(activeA._id.toString(), GEN_A.toString());

    const crossA = await findActiveGenerationByDocument(TENANT_A.toString(), DOC_B.toString());
    assert.equal(crossA, null, "Tenant A should not find active generation for tenant B document");
  });

  await t.test("IndexGeneration: updateGenerationStatus only affects matching tenant", async () => {
    const result = await updateGenerationStatus(
      TENANT_A.toString(),
      GEN_A.toString(),
      { status: "FAILED" },
    );
    assert.equal(result.matchedCount, 1);

    const genA = await IndexGenerationModel.findById(GEN_A).lean();
    assert.equal(genA?.status, "FAILED", "Tenant A generation should be FAILED");

    const genB = await IndexGenerationModel.findById(GEN_B).lean();
    assert.equal(genB?.status, "ACTIVE", "Tenant B generation should remain ACTIVE");
  });

  await t.test("IndexGeneration: retireActiveGeneration only affects matching tenant", async () => {
    await retireActiveGeneration(TENANT_A.toString(), DOC_A.toString());

    const genA = await IndexGenerationModel.findById(GEN_A).lean();
    assert.equal(genA?.status, "RETIRED", "Tenant A generation should be RETIRED");

    const genB = await IndexGenerationModel.findById(GEN_B).lean();
    assert.equal(genB?.status, "ACTIVE", "Tenant B generation should remain ACTIVE");
  });

  await t.test("DocumentChunk: tenant A cannot find tenant B chunks", async () => {
    const chunks = await findChunksByGeneration(TENANT_A.toString(), DOC_B.toString(), GEN_B.toString());
    assert.equal(chunks.length, 0, "Tenant A should not see tenant B chunks");
  });

  await t.test("DocumentChunk: tenant A can find its own chunks", async () => {
    const chunks = await findChunksByGeneration(TENANT_A.toString(), DOC_A.toString(), GEN_A.toString());
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].text, "Tenant A chunk content");
  });

  await t.test("DocumentChunk: countChunksByGeneration is tenant-scoped", async () => {
    const countA = await countChunksByGeneration(TENANT_A.toString(), DOC_A.toString(), GEN_A.toString());
    assert.equal(countA, 1);

    const countCross = await countChunksByGeneration(TENANT_A.toString(), DOC_B.toString(), GEN_B.toString());
    assert.equal(countCross, 0, "Tenant A should count 0 chunks for tenant B document");
  });

  await t.test("DocumentChunk: updateChunkStatus only affects matching tenant", async () => {
    await updateChunkStatus(TENANT_A.toString(), CHUNK_A.toString(), "RETIRED");

    const chunkA = await DocumentChunkModel.findById(CHUNK_A).lean();
    assert.equal(chunkA?.status, "RETIRED");

    const chunkB = await DocumentChunkModel.findById(CHUNK_B).lean();
    assert.equal(chunkB?.status, "ACTIVE", "Tenant B chunk should remain ACTIVE");
  });

  await t.test("DocumentChunk: retireChunksByGeneration only affects matching tenant", async () => {
    await retireChunksByGeneration(TENANT_A.toString(), DOC_A.toString(), GEN_A.toString());

    const chunkA = await DocumentChunkModel.findById(CHUNK_A).lean();
    assert.equal(chunkA?.status, "RETIRED");

    const chunkB = await DocumentChunkModel.findById(CHUNK_B).lean();
    assert.equal(chunkB?.status, "ACTIVE", "Tenant B chunk should remain ACTIVE");
  });

  await t.test("ChunkEmbedding: tenant A cannot find tenant B embeddings", async () => {
    const embeddings = await findEmbeddingsByGeneration(TENANT_B.toString(), GEN_A.toString());
    assert.equal(embeddings.length, 0, "Tenant B should not see tenant A embeddings");
  });

  await t.test("ChunkEmbedding: tenant A can find its own embeddings", async () => {
    const embeddings = await findEmbeddingsByGeneration(TENANT_A.toString(), GEN_A.toString());
    assert.equal(embeddings.length, 1);
    assert.equal(embeddings[0].embeddingChecksum, "emb-checksum-a");
  });

  await t.test("ChunkEmbedding: countEmbeddingsByGeneration is tenant-scoped", async () => {
    const countA = await countEmbeddingsByGeneration(TENANT_A.toString(), GEN_A.toString());
    assert.equal(countA, 1);

    const countCross = await countEmbeddingsByGeneration(TENANT_A.toString(), GEN_B.toString());
    assert.equal(countCross, 0, "Tenant A should count 0 embeddings for tenant B generation");
  });

  await t.test("ChunkEmbedding: deleteEmbeddingsByGeneration only affects matching tenant", async () => {
    await deleteEmbeddingsByGeneration(TENANT_A.toString(), GEN_A.toString());

    const countA = await ChunkEmbeddingModel.countDocuments({ tenantId: TENANT_A });
    assert.equal(countA, 0, "Tenant A embeddings should be deleted");

    const countB = await ChunkEmbeddingModel.countDocuments({ tenantId: TENANT_B });
    assert.equal(countB, 1, "Tenant B embeddings should remain");
  });

  await t.test("Document: searchStatus is per-tenant", async () => {
    await DocumentModel.findOneAndUpdate(
      { _id: DOC_A, tenantId: TENANT_A },
      { $set: { searchStatus: "STALE" } },
    );

    const docA = await DocumentModel.findById(DOC_A).lean();
    assert.equal(docA?.searchStatus, "STALE");

    const docB = await DocumentModel.findById(DOC_B).lean();
    assert.equal(docB?.searchStatus, "READY", "Tenant B document should remain READY");
  });
});
