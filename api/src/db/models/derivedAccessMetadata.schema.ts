import mongoose, { Schema } from "mongoose";

export interface StoredDerivedAccessMetadataV1 {
  schemaVersion: 1; tenantId: mongoose.Types.ObjectId; documentId: mongoose.Types.ObjectId; documentVersion: number;
  policyId: mongoose.Types.ObjectId; policyVersion: number; classificationId: mongoose.Types.ObjectId | null;
  categoryId: mongoose.Types.ObjectId | null; departmentId: mongoose.Types.ObjectId | null; generationId: string;
  updatedAt: Date; requiresCurrentPolicyRevalidation: true;
}

export const derivedAccessMetadataSchema = new Schema<StoredDerivedAccessMetadataV1>({
  schemaVersion: { type: Number, enum: [1], required: true }, tenantId: { type: Schema.Types.ObjectId, required: true },
  documentId: { type: Schema.Types.ObjectId, required: true }, documentVersion: { type: Number, required: true, min: 1 },
  policyId: { type: Schema.Types.ObjectId, required: true }, policyVersion: { type: Number, required: true, min: 1 },
  classificationId: { type: Schema.Types.ObjectId, default: null }, categoryId: { type: Schema.Types.ObjectId, default: null },
  departmentId: { type: Schema.Types.ObjectId, default: null }, generationId: { type: String, required: true, minlength: 64, maxlength: 64 },
  updatedAt: { type: Date, required: true }, requiresCurrentPolicyRevalidation: { type: Boolean, required: true },
}, { _id: false });
