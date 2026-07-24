import mongoose, { Schema } from "mongoose";
import type { DocumentPolicyPropagationJobV1 } from "../../modules/document-access/documentPolicyPropagation.contracts.js";

export const PROPAGATION_OUTBOX_STATES = ["pending", "dispatching", "dispatched", "processing", "completed", "retry_pending", "failed", "dead_letter", "superseded"] as const;
export type PropagationOutboxState = typeof PROPAGATION_OUTBOX_STATES[number];

export interface DocumentPolicyPropagationOutboxDocument extends mongoose.Document {
  eventId: string; tenantId: mongoose.Types.ObjectId; documentId: mongoose.Types.ObjectId; actorId: mongoose.Types.ObjectId;
  operationCorrelationId: string; payload: DocumentPolicyPropagationJobV1; state: PropagationOutboxState; attempts: number;
  nextAttemptAt: Date; claimExpiresAt: Date | null; dispatchedAt: Date | null; processingStartedAt: Date | null;
  completedAt: Date | null; failedAt: Date | null; lastWorkerHeartbeatAt: Date | null; failureCode: string | null;
  createdAt: Date; updatedAt: Date;
}

const schema = new Schema<DocumentPolicyPropagationOutboxDocument>({
  eventId: { type: String, required: true, minlength: 64, maxlength: 64 },
  tenantId: { type: Schema.Types.ObjectId, required: true }, documentId: { type: Schema.Types.ObjectId, required: true },
  actorId: { type: Schema.Types.ObjectId, required: true }, operationCorrelationId: { type: String, required: true, maxlength: 128 },
  payload: { type: Schema.Types.Mixed, required: true }, state: { type: String, enum: PROPAGATION_OUTBOX_STATES, required: true },
  attempts: { type: Number, required: true, min: 0, default: 0 }, nextAttemptAt: { type: Date, required: true },
  claimExpiresAt: { type: Date, default: null }, dispatchedAt: { type: Date, default: null }, processingStartedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null }, failedAt: { type: Date, default: null }, lastWorkerHeartbeatAt: { type: Date, default: null },
  failureCode: { type: String, default: null, maxlength: 128 },
}, { timestamps: true, versionKey: false });
schema.index({ eventId: 1 }, { unique: true, name: "uniq_policy_propagation_event" });
schema.index({ tenantId: 1, documentId: 1, "payload.policyVersion": 1, createdAt: -1 });
schema.index({ state: 1, nextAttemptAt: 1, claimExpiresAt: 1 });
schema.index({ tenantId: 1, documentId: 1, createdAt: -1 });
export default mongoose.model<DocumentPolicyPropagationOutboxDocument>("DocumentPolicyPropagationOutbox", schema);
