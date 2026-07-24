import mongoose, { Schema } from "mongoose";

export interface DocumentPolicyIdempotencyDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId;
  operation: "policy_apply";
  key: string;
  requestFingerprint: string;
  policyId: mongoose.Types.ObjectId;
  policyVersion: number;
  createdAt: Date;
  expiresAt: Date;
}

const schema = new Schema<DocumentPolicyIdempotencyDocument>({
  tenantId: { type: Schema.Types.ObjectId, required: true },
  documentId: { type: Schema.Types.ObjectId, required: true },
  actorId: { type: Schema.Types.ObjectId, required: true },
  operation: { type: String, enum: ["policy_apply"], required: true },
  key: { type: String, required: true, minlength: 1, maxlength: 128 },
  requestFingerprint: { type: String, required: true, minlength: 64, maxlength: 64 },
  policyId: { type: Schema.Types.ObjectId, required: true },
  policyVersion: { type: Number, required: true, min: 1 },
  createdAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
}, { versionKey: false });

schema.index({ tenantId: 1, documentId: 1, actorId: 1, operation: 1, key: 1 }, { unique: true, name: "uniq_document_policy_idempotency" });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<DocumentPolicyIdempotencyDocument>("DocumentPolicyIdempotency", schema);
