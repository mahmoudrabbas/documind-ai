import { ObjectId, type Db } from "mongodb";
import type { DerivedAccessMetadataV1 } from "../contracts/documentPolicyPropagation.js";

export interface DocumentPolicyPropagationTargetPort {
  updateAccessMetadata(metadata: DerivedAccessMetadataV1): Promise<{ affectedRecords: number }>;
  requestReindex(metadata: DerivedAccessMetadataV1, eventId: string): Promise<{ durable: boolean }>;
  markGenerationCurrent(metadata: DerivedAccessMetadataV1, eventId: string): Promise<{ completed: boolean }>;
}

export class MongoDocumentPolicyPropagationTarget implements DocumentPolicyPropagationTargetPort {
  constructor(private readonly db: Db) {}
  async updateAccessMetadata(metadata: DerivedAccessMetadataV1) {
    const tenantId = new ObjectId(metadata.tenantId); const documentId = new ObjectId(metadata.documentId);
    const document = await this.db.collection("documents").findOne({ _id: documentId, tenantId,
      version: metadata.documentVersion, deletedAt: null, isArchived: { $ne: true } },
      { projection: { activeChunkGeneration: 1, department: 1, category: 1, classification: 1 } });
    if (!document) throw new Error("DOCUMENT_POLICY_PROPAGATION_DOCUMENT_NOT_CURRENT");

    const filter = { tenantId, documentId, documentVersion: metadata.documentVersion,
      $or: [{ "accessMetadata.policyVersion": { $exists: false } }, { "accessMetadata.policyVersion": { $lte: metadata.policyVersion } }] };
    const stored = { ...metadata, tenantId, documentId, policyId: new ObjectId(metadata.policyId),
      classificationId: metadata.classificationId ? new ObjectId(metadata.classificationId) : null,
      categoryId: metadata.categoryId ? new ObjectId(metadata.categoryId) : null,
      departmentId: metadata.departmentId ? new ObjectId(metadata.departmentId) : null,
      updatedAt: new Date(metadata.updatedAt) };
    const collections = ["documentchunks", "extractionartifacts", "ocrpageresults"];
    let affectedRecords = 0;
    for (const collection of collections) {
      const result = await this.db.collection(collection).updateMany(filter, { $set: { accessMetadata: stored } });
      affectedRecords += result.modifiedCount;
    }

    if (document.activeChunkGeneration) {
      const activeGenerationId = toObjectId(document.activeChunkGeneration);
      const generation = await this.db.collection("indexgenerations").findOne({ _id: activeGenerationId, tenantId, documentId,
        documentVersion: metadata.documentVersion, status: { $nin: ["RETIRED", "FAILED"] } },
        { projection: { expectedChunkCount: 1, expectedEmbeddingCount: 1, actualChunkCount: 1, actualEmbeddingCount: 1 } });
      if (!generation) throw new Error("DOCUMENT_POLICY_PROPAGATION_ACTIVE_GENERATION_NOT_CURRENT");

      const generationFilter = { tenantId, documentId, generationId: activeGenerationId, status: { $ne: "RETIRED" } };
      const retrievalFields = { department: document.department ?? null, category: document.category ?? null,
        classification: document.classification ?? null };
      const chunks = await this.db.collection("documentchunks").updateMany(generationFilter, { $set: retrievalFields });
      const embeddings = await this.db.collection("chunkembeddings").updateMany(
        { tenantId, documentId, generationId: activeGenerationId }, { $set: retrievalFields });
      const expectedChunks = numberValue(generation.expectedChunkCount) ?? numberValue(generation.actualChunkCount) ?? 0;
      const expectedEmbeddings = numberValue(generation.expectedEmbeddingCount) ?? numberValue(generation.actualEmbeddingCount) ?? 0;
      if (expectedChunks > 0 && chunks.matchedCount === 0) throw new Error("DOCUMENT_POLICY_PROPAGATION_ACTIVE_CHUNKS_NOT_FOUND");
      if (expectedEmbeddings > 0 && embeddings.matchedCount === 0) throw new Error("DOCUMENT_POLICY_PROPAGATION_ACTIVE_EMBEDDINGS_NOT_FOUND");
      if (chunks.matchedCount > 0 && await hasTaxonomyMismatch(this.db, "documentchunks", generationFilter, retrievalFields)) {
        throw new Error("DOCUMENT_POLICY_PROPAGATION_ACTIVE_CHUNKS_INCONSISTENT");
      }
      if (embeddings.matchedCount > 0 && await hasTaxonomyMismatch(this.db, "chunkembeddings", { tenantId, documentId, generationId: activeGenerationId }, retrievalFields)) {
        throw new Error("DOCUMENT_POLICY_PROPAGATION_ACTIVE_EMBEDDINGS_INCONSISTENT");
      }
      affectedRecords += chunks.modifiedCount + embeddings.modifiedCount;
    }
    return { affectedRecords };
  }
  async requestReindex(metadata: DerivedAccessMetadataV1, eventId: string) {
    await this.db.collection("documentpolicyreindexrequests").updateOne({ tenantId: new ObjectId(metadata.tenantId), documentId: new ObjectId(metadata.documentId),
      documentVersion: metadata.documentVersion, policyVersion: metadata.policyVersion }, { $setOnInsert: { eventId, generationId: metadata.generationId,
      state: "pending", requestedAt: new Date(), createdAt: new Date() } }, { upsert: true });
    return { durable: true };
  }
  async markGenerationCurrent(metadata: DerivedAccessMetadataV1, eventId: string) {
    const result = await this.db.collection("documentpolicygenerations").updateOne({ tenantId: new ObjectId(metadata.tenantId),
      documentId: new ObjectId(metadata.documentId), documentVersion: metadata.documentVersion, generationId: metadata.generationId,
      desiredPolicyId: new ObjectId(metadata.policyId), desiredPolicyVersion: metadata.policyVersion, status: "reindexing",
      lastPropagationEventId: eventId }, { $set: { status: "current", appliedPolicyId: new ObjectId(metadata.policyId),
      appliedPolicyVersion: metadata.policyVersion, reindexRequired: false, completedAt: new Date(), failureCode: null } });
    return { completed: result.modifiedCount === 1 };
  }
}

function toObjectId(value: unknown): ObjectId {
  if (value instanceof ObjectId) return value;
  if (typeof value === "string" && ObjectId.isValid(value)) return new ObjectId(value);
  throw new Error("DOCUMENT_POLICY_PROPAGATION_INVALID_ACTIVE_GENERATION");
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

async function hasTaxonomyMismatch(db: Db, collection: string, filter: Record<string, unknown>, fields: Record<string, unknown>) {
  const mismatch = await db.collection(collection).countDocuments({ ...filter, $or: Object.entries(fields).map(([key, value]) => ({ [key]: { $ne: value } })) });
  return mismatch > 0;
}

export class FakeDocumentPolicyPropagationTarget implements DocumentPolicyPropagationTargetPort {
  readonly metadataUpdates: DerivedAccessMetadataV1[] = []; readonly reindexRequests: Array<{ metadata: DerivedAccessMetadataV1; eventId: string }> = [];
  failUpdate = false;
  async updateAccessMetadata(metadata: DerivedAccessMetadataV1) { if (this.failUpdate) throw new Error("target_unavailable"); this.metadataUpdates.push(metadata); return { affectedRecords: 0 }; }
  async requestReindex(metadata: DerivedAccessMetadataV1, eventId: string) { this.reindexRequests.push({ metadata, eventId }); return { durable: true }; }
  async markGenerationCurrent() { return { completed: true }; }
}
