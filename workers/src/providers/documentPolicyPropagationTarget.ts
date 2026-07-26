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

export class FakeDocumentPolicyPropagationTarget implements DocumentPolicyPropagationTargetPort {
  readonly metadataUpdates: DerivedAccessMetadataV1[] = []; readonly reindexRequests: Array<{ metadata: DerivedAccessMetadataV1; eventId: string }> = [];
  failUpdate = false;
  async updateAccessMetadata(metadata: DerivedAccessMetadataV1) { if (this.failUpdate) throw new Error("target_unavailable"); this.metadataUpdates.push(metadata); return { affectedRecords: 0 }; }
  async requestReindex(metadata: DerivedAccessMetadataV1, eventId: string) { this.reindexRequests.push({ metadata, eventId }); return { durable: true }; }
  async markGenerationCurrent() { return { completed: true }; }
}
