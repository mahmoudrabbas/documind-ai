import mongoose, { Schema } from "mongoose";

export interface BatchResult { documentId: string; status: string; policyVersion?: number }
export interface DocumentPolicyBatchIdempotencyDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId; actorId: mongoose.Types.ObjectId; key: string; requestFingerprint: string;
  status: "pending" | "completed"; results: BatchResult[]; createdAt: Date; expiresAt: Date;
}
const resultSchema = new Schema<BatchResult>({ documentId: { type: String, required: true }, status: { type: String, required: true }, policyVersion: { type: Number } }, { _id: false });
const schema = new Schema<DocumentPolicyBatchIdempotencyDocument>({
  tenantId: { type: Schema.Types.ObjectId, required: true }, actorId: { type: Schema.Types.ObjectId, required: true },
  key: { type: String, required: true, minlength: 1, maxlength: 128 }, requestFingerprint: { type: String, required: true, minlength: 64, maxlength: 64 },
  status: { type: String, enum: ["pending", "completed"], required: true }, results: { type: [resultSchema], default: [] },
  createdAt: { type: Date, required: true }, expiresAt: { type: Date, required: true },
}, { versionKey: false });
schema.index({ tenantId: 1, actorId: 1, key: 1 }, { unique: true, name: "uniq_document_policy_batch_idempotency" });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model<DocumentPolicyBatchIdempotencyDocument>("DocumentPolicyBatchIdempotency", schema);
