import mongoose, { Schema } from "mongoose";

export const BILLING_OPERATION_TYPES = [
  "PLAN_CHANGE", "CANCEL_PERIOD_END", "CANCEL_IMMEDIATELY", "REACTIVATE", "REFUND",
] as const;
export const BILLING_OPERATION_STATUSES = [
  "REQUESTED", "PROVIDER_PENDING", "CONFIRMED", "FAILED", "RETRY_PENDING", "SUPERSEDED",
] as const;
export type BillingOperationType = (typeof BILLING_OPERATION_TYPES)[number];
export type BillingOperationStatus = (typeof BILLING_OPERATION_STATUSES)[number];
export type BillingOperationConflictGroup = "SUBSCRIPTION_MUTATION";

export interface BillingOperationDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId;
  actorRole: string;
  operationType: BillingOperationType;
  status: BillingOperationStatus;
  conflictGroup: BillingOperationConflictGroup | null;
  subscriptionId: mongoose.Types.ObjectId | null;
  targetPackageId: mongoose.Types.ObjectId | null;
  packageVersionId: mongoose.Types.ObjectId | null;
  expectedSubscriptionRevision: number | null;
  requestFingerprint: string;
  idempotencyKeyHash: string;
  provider: string;
  providerOperationReference: string;
  providerObjectReference: string;
  previewReference: string;
  previewExpiresAt: Date | null;
  cancellationType: "IMMEDIATE" | "PERIOD_END" | null;
  effectiveAt: Date | null;
  requestedAt: Date;
  providerRequestedAt: Date | null;
  confirmedAt: Date | null;
  failedAt: Date | null;
  retryCount: number;
  nextRetryAt: Date | null;
  failureCode: string;
  safeFailureMetadata: Record<string, unknown>;
  confirmingProviderEventIds: string[];
  traceId: string;
  requestId: string;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<BillingOperationDocument>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
  actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  actorRole: { type: String, required: true },
  operationType: { type: String, enum: BILLING_OPERATION_TYPES, required: true },
  status: { type: String, enum: BILLING_OPERATION_STATUSES, required: true, default: "REQUESTED" },
  conflictGroup: { type: String, enum: ["SUBSCRIPTION_MUTATION", null], default: null },
  subscriptionId: { type: Schema.Types.ObjectId, ref: "Subscription", default: null },
  targetPackageId: { type: Schema.Types.ObjectId, ref: "Package", default: null },
  packageVersionId: { type: Schema.Types.ObjectId, default: null },
  expectedSubscriptionRevision: { type: Number, default: null, min: 0 },
  requestFingerprint: { type: String, required: true, select: false },
  idempotencyKeyHash: { type: String, required: true, select: false },
  provider: { type: String, required: true },
  providerOperationReference: { type: String, default: "" },
  providerObjectReference: { type: String, default: "" },
  previewReference: { type: String, default: "" },
  previewExpiresAt: { type: Date, default: null },
  cancellationType: { type: String, enum: ["IMMEDIATE", "PERIOD_END", null], default: null },
  effectiveAt: { type: Date, default: null },
  requestedAt: { type: Date, required: true, default: Date.now },
  providerRequestedAt: { type: Date, default: null },
  confirmedAt: { type: Date, default: null },
  failedAt: { type: Date, default: null },
  retryCount: { type: Number, required: true, default: 0, min: 0 },
  nextRetryAt: { type: Date, default: null },
  failureCode: { type: String, default: "" },
  safeFailureMetadata: { type: Schema.Types.Mixed, default: {} },
  confirmingProviderEventIds: { type: [String], default: [] },
  traceId: { type: String, default: "" },
  requestId: { type: String, default: "" },
  revision: { type: Number, required: true, default: 0, min: 0 },
}, { timestamps: true });

schema.index({ tenantId: 1, idempotencyKeyHash: 1 }, { unique: true, name: "uq_billing_operation_idempotency" });
schema.index({ tenantId: 1, status: 1, createdAt: -1 }, { name: "idx_billing_operation_tenant_status" });
schema.index({ status: 1, nextRetryAt: 1 }, { name: "idx_billing_operation_retry" });
schema.index({ subscriptionId: 1, operationType: 1 }, { name: "idx_billing_operation_subscription_type" });
schema.index({ traceId: 1 }, { name: "idx_billing_operation_trace", sparse: true });
schema.index(
  { tenantId: 1, subscriptionId: 1, conflictGroup: 1 },
  { unique: true, name: "uq_billing_operation_pending_conflict_group", partialFilterExpression: { status: { $in: ["REQUESTED", "PROVIDER_PENDING", "RETRY_PENDING"] }, subscriptionId: { $type: "objectId" }, conflictGroup: { $type: "string" } } },
);

export default mongoose.model<BillingOperationDocument>("BillingOperation", schema);
