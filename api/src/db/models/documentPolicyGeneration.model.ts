import mongoose, { Schema } from "mongoose";

export const POLICY_GENERATION_STATES = ["current", "pending", "stale", "updating_metadata", "reindexing", "failed", "dead_letter"] as const;
export type DocumentPolicyGenerationState = typeof POLICY_GENERATION_STATES[number];

export interface DocumentPolicyGenerationDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId; documentId: mongoose.Types.ObjectId; documentVersion: number; generationId: string;
  desiredPolicyId: mongoose.Types.ObjectId; desiredPolicyVersion: number; appliedPolicyId: mongoose.Types.ObjectId | null;
  appliedPolicyVersion: number | null; classificationId: mongoose.Types.ObjectId | null; categoryId: mongoose.Types.ObjectId | null;
  departmentId: mongoose.Types.ObjectId | null; status: DocumentPolicyGenerationState; reindexRequired: boolean;
  metadataUpdateRequired: boolean; lastPropagationEventId: string; requestedAt: Date; completedAt: Date | null;
  failureCode: string | null; attemptCount: number; createdAt: Date; updatedAt: Date;
}

const schema = new Schema<DocumentPolicyGenerationDocument>({
  tenantId: { type: Schema.Types.ObjectId, required: true }, documentId: { type: Schema.Types.ObjectId, required: true },
  documentVersion: { type: Number, required: true, min: 1 }, generationId: { type: String, required: true, minlength: 64, maxlength: 64 },
  desiredPolicyId: { type: Schema.Types.ObjectId, required: true }, desiredPolicyVersion: { type: Number, required: true, min: 1 },
  appliedPolicyId: { type: Schema.Types.ObjectId, default: null }, appliedPolicyVersion: { type: Number, default: null, min: 1 },
  classificationId: { type: Schema.Types.ObjectId, default: null }, categoryId: { type: Schema.Types.ObjectId, default: null }, departmentId: { type: Schema.Types.ObjectId, default: null },
  status: { type: String, enum: POLICY_GENERATION_STATES, required: true }, reindexRequired: { type: Boolean, required: true },
  metadataUpdateRequired: { type: Boolean, required: true }, lastPropagationEventId: { type: String, required: true, maxlength: 64 },
  requestedAt: { type: Date, required: true }, completedAt: { type: Date, default: null }, failureCode: { type: String, default: null, maxlength: 128 },
  attemptCount: { type: Number, required: true, min: 0, default: 0 },
}, { timestamps: true, versionKey: false });
schema.index({ tenantId: 1, documentId: 1, documentVersion: 1 }, { unique: true, name: "uniq_document_policy_generation" });
schema.index({ tenantId: 1, documentId: 1, status: 1 });
export default mongoose.model<DocumentPolicyGenerationDocument>("DocumentPolicyGeneration", schema);
