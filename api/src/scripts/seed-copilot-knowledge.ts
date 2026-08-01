import mongoose from "mongoose";
import { createHash } from "node:crypto";
import { COPILOT_KNOWLEDGE_CORPUS } from "../modules/copilot/knowledge/corpus.js";
import DocumentModel from "../db/models/document.model.js";
import DocumentChunkModel from "../db/models/documentChunk.model.js";
import DocumentAccessPolicyModel from "../db/models/documentAccessPolicy.model.js";
import IndexGenerationModel from "../db/models/indexGeneration.model.js";
import { getEmbeddingAdapter } from "../providers/embedding/atlasEmbeddingAdapter.js";
import { getVectorStoreAdapter, getKeywordAdapter } from "../providers/embedding/adapterLoader.js";

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://mongodb:27017/docsai";

const GUIDE_FILENAME = "documind-copilot-guide.md";

async function seedForTenant(
  tenant: { _id: mongoose.Types.ObjectId; name: string; slug: string },
) {
  const tenantId = tenant._id;
  console.log(`\nSeeding copilot knowledge for tenant "${tenant.name}" (${tenant.slug})`);

  // 1. Upsert the guide document
  const now = new Date();
  let doc = await DocumentModel.findOne({
    tenantId,
    originalFileName: GUIDE_FILENAME,
  });

  if (!doc) {
    doc = await DocumentModel.create({
      tenantId,
      fileName: GUIDE_FILENAME,
      originalFileName: GUIDE_FILENAME,
      fileSize: 0,
      mimeType: "text/markdown",
      storageKey: `system/copilot/${GUIDE_FILENAME}`,
      checksum: createHash("sha256").update(GUIDE_FILENAME).digest("hex"),
      status: "processed",
      metadata: {
        title: "DocuMind Copilot Guide",
        description: "Internal knowledge base describing the platform features, roles, and workflows for the AI copilot.",
        tags: ["copilot", "guide", "help"],
      },
      category: null,
      department: null,
      classification: "internal",
      owner: null,
      effectiveDate: now,
      expiryDate: null,
      version: 1,
      versionLabel: "v1",
      isArchived: false,
      archivedAt: null,
      archivedBy: null,
      deletedAt: null,
      deletedBy: null,
      quarantineStatus: "none",
      scanResult: {
        scanner: "system",
        scannedAt: now,
        result: "clean",
      },
      uploadedBy: new mongoose.Types.ObjectId("000000000000000000000000"),
      activeChunkGeneration: null,
      currentGeneration: null,
      pendingGeneration: null,
      searchStatus: "NOT_INDEXED",
      lastSearchStatusChange: now,
      lastProcessingError: null,
    });
    console.log("  Created guide document:", doc._id.toString());
  } else {
    console.log("  Guide document already exists:", doc._id.toString());
  }

  const documentId = doc._id as mongoose.Types.ObjectId;

  // 2. Ensure the guide document has an active access policy so it is discoverable
  const activePolicy = await DocumentAccessPolicyModel.findOne({
    tenantId,
    documentId,
    status: "active",
  })
    .sort({ policyVersion: -1 })
    .select("policyId policyVersion")
    .lean()
    .exec();

  if (activePolicy) {
    console.log("  Access policy already exists:", activePolicy.policyId.toString());
  } else {
    const policyId = new mongoose.Types.ObjectId();
    const policyVersion = 1;
    await DocumentAccessPolicyModel.create({
      tenantId,
      documentId,
      policyId,
      policyVersion,
      contractVersion: 1,
      status: "active",
      effectiveFrom: now,
      effectiveUntil: null,
      inherits: null,
      rules: [
        {
          ruleId: "tenant-member-full-read",
          effect: "allow",
          subject: { type: "tenant_member" },
          actions: ["discover", "read", "use_in_ai"],
        },
      ],
      provenance: {
        createdBy: new mongoose.Types.ObjectId("000000000000000000000000"),
        createdAt: now,
        reason: "System seed: default access for the copilot guide document",
      },
      indexMetadata: {
        policyId,
        policyVersion,
        classificationId: null,
        categoryId: null,
        departmentId: null,
      },
      createdAt: now,
    });
    await DocumentModel.updateOne(
      { _id: documentId, tenantId },
      {
        $set: {
          activePolicyId: policyId,
          activePolicyVersion: policyVersion,
        },
      },
    );
    console.log("  Created default access policy:", policyId.toString());
  }

  // 4. Retire old generations + chunks so the seed is idempotent
  await DocumentChunkModel.updateMany(
    { tenantId, documentId, status: { $in: ["DRAFT", "EMBEDDED", "INDEXED", "ACTIVE"] } },
    { $set: { status: "RETIRED" } },
  );
  await IndexGenerationModel.updateMany(
    { tenantId, documentId, status: { $in: ["BUILDING", "VERIFYING", "VERIFIED", "ACTIVE"] } },
    { $set: { status: "RETIRED", retiredAt: now } },
  );

  // 5. Create generation + chunks
  const generationNumber =
    ((await IndexGenerationModel.findOne({ tenantId, documentId }).sort({ generationNumber: -1 }).select("generationNumber").lean().exec())?.generationNumber ?? 0) + 1;

  const generation = await IndexGenerationModel.create({
    documentId,
    documentVersion: 1,
    tenantId,
    generationNumber,
    status: "ACTIVE",
    expectedChunkCount: COPILOT_KNOWLEDGE_CORPUS.length,
    actualChunkCount: COPILOT_KNOWLEDGE_CORPUS.length,
    expectedEmbeddingCount: COPILOT_KNOWLEDGE_CORPUS.length,
    actualEmbeddingCount: COPILOT_KNOWLEDGE_CORPUS.length,
    atlasIndexName: "vidx_chunk_embeddings_v1",
    atlasIndexStatus: "UNKNOWN",
    failureReason: null,
    triggeredBy: "INITIAL",
    chunkingConfig: {
      targetTokens: 400,
      hardCeiling: 800,
      overlap: 50,
      tokenizerVersion: "cl100k_base",
    },
    activatedAt: now,
  });

  console.log(`  Created generation #${generationNumber}:`, generation._id.toString());

  // 5. Embed each corpus entry and persist chunks
  const embeddingAdapter = await getEmbeddingAdapter();
  const texts = COPILOT_KNOWLEDGE_CORPUS.map((entry) => entry.content);
  const embedResult = await embeddingAdapter.embed({ inputs: texts });

  const vectorDocs: { chunkId: string; vector: number[]; metadata: Record<string, unknown> }[] = [];
  const keywordDocs: { chunkId: string; text: string; metadata: Record<string, unknown> }[] = [];
  const chunkDocs = COPILOT_KNOWLEDGE_CORPUS.map((entry, index) => {
    const text = entry.content;
    const vector = embedResult.vectors[index] ?? [];
    const chunkId = new mongoose.Types.ObjectId();
    vectorDocs.push({ chunkId: chunkId.toString(), vector, metadata: { tenantId: tenantId.toString(), documentId: documentId.toString(), classification: "internal", allowAiUse: true } });
    keywordDocs.push({ chunkId: chunkId.toString(), text, metadata: { tenantId: tenantId.toString(), documentId: documentId.toString(), classification: "internal", allowAiUse: true } });
    return {
      tenantId,
      documentId,
      documentVersion: 1,
      generationId: generation._id as mongoose.Types.ObjectId,
      chunkIndex: index,
      sectionPath: [entry.title],
      pageStart: 1,
      pageEnd: 1,
      offsetStart: 0,
      offsetEnd: text.length,
      contentType: "paragraph" as const,
      language: "en" as const,
      department: null,
      classification: "internal" as const,
      accessPolicyVersion: null,
      confidenceScore: 1,
      text,
      checksum: createHash("sha256").update(text).digest("hex"),
      tokenCount: Math.ceil(text.split(/\s+/).length * 1.3),
      status: "ACTIVE" as const,
      partIndex: null,
      partCount: null,
      vector,
      category: entry.tags[0] ?? null,
      allowAiUse: true,
      documentVersionId: null,
      pageNumber: 1,
      sectionTitle: entry.title,
    };
  });

  await DocumentChunkModel.insertMany(chunkDocs);
  console.log(`  Persisted ${chunkDocs.length} chunks with embeddings.`);

  // 6. Index into vector + keyword stores
  const vectorStore = await getVectorStoreAdapter();
  const keywordAdapter = await getKeywordAdapter();
  await vectorStore.storeChunks(vectorDocs);
  await keywordAdapter.indexChunks(keywordDocs);
  console.log("  Indexed chunks into vector store and keyword index.");

  // 7. Mark document READY
  await DocumentModel.updateOne(
    { _id: documentId, tenantId },
    {
      $set: {
        activeChunkGeneration: generation._id as mongoose.Types.ObjectId,
        currentGeneration: null,
        pendingGeneration: null,
        searchStatus: "READY",
        lastSearchStatusChange: now,
        lastProcessingError: null,
      },
    },
  );
  console.log("  Guide document marked READY.");
}

async function run() {
  const tenantSlug = process.argv[2];

  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("Connected.\n");

  const tenants = await mongoose.connection.db!.collection("tenants")
    .find(tenantSlug ? { slug: tenantSlug } : {})
    .project({ _id: 1, name: 1, slug: 1 })
    .toArray();

  if (tenants.length === 0) {
    console.error(
      tenantSlug
        ? `No tenant found with slug "${tenantSlug}".`
        : "No tenants found to seed.",
    );
    process.exit(1);
  }

  for (const tenant of tenants as Array<{ _id: mongoose.Types.ObjectId; name: string; slug: string }>) {
    await seedForTenant(tenant);
  }

  console.log("\n\n=== COPILOT KNOWLEDGE SEED COMPLETE ===\n");
  await mongoose.disconnect();
  console.log("Disconnected.");
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
