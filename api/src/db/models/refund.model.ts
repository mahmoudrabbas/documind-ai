import mongoose, { Schema } from "mongoose";
import type { RefundReasonCode, RefundSubscriptionImpact } from "./refundEligibilityPreview.model.js";

export const REFUND_STATUSES = ["REQUESTED", "PROVIDER_PENDING", "SUCCEEDED", "FAILED", "REJECTED", "RETRY_PENDING"] as const;
export interface RefundDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId; invoiceId: mongoose.Types.ObjectId | null; paymentReference: string;
  subscriptionId: mongoose.Types.ObjectId | null; operationId: mongoose.Types.ObjectId;
  amountMinor: number; currency: string; reason: string; requestedBy: mongoose.Types.ObjectId;
  reasonCode: RefundReasonCode; explanation: string; eligibilityPreviewId: mongoose.Types.ObjectId | null;
  eligibilityPolicyVersion: string; eligibilitySnapshotHash: string; maximumEligibleRefundMinor: number;
  retainedConsumedMinor: number;
  confirmationEligibilitySnapshotHash: string; subscriptionImpact: RefundSubscriptionImpact;
  localTransitionStatus: "PENDING" | "SUCCEEDED" | "RETRY_PENDING" | "FAILED";
  subscriptionImpactStatus: "NOT_REQUIRED" | "PENDING" | "SUCCEEDED" | "RETRY_PENDING" | "FAILED";
  subscriptionImpactOperationId: mongoose.Types.ObjectId | null;
  confirmedBy: mongoose.Types.ObjectId | null; requestedAt: Date; confirmedAt: Date | null; rejectedAt: Date | null;
  rejectionReason: string;
  provider: string; providerRefundId?: string; status: (typeof REFUND_STATUSES)[number]; providerStatus: string;
  failureCode: string; createdAt: Date; updatedAt: Date;
}
const schema = new Schema<RefundDocument>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
  invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", default: null }, paymentReference: { type: String, default: "" },
  subscriptionId: { type: Schema.Types.ObjectId, ref: "Subscription", default: null },
  operationId: { type: Schema.Types.ObjectId, ref: "BillingOperation", required: true },
  amountMinor: { type: Number, required: true, min: 1 }, currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
  reason: { type: String, required: true, maxlength: 500 }, requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  reasonCode: { type: String, enum: ["DUPLICATE_CHARGE", "SERVICE_NOT_DELIVERED", "VOLUNTARY_CANCELLATION", "BILLING_ERROR", "GOODWILL_CREDIT", "SYSTEM_REMAINING_BALANCE_REFUND"], default: "BILLING_ERROR" },
  explanation: { type: String, default: "", maxlength: 500 },
  eligibilityPreviewId: { type: Schema.Types.ObjectId, ref: "RefundEligibilityPreview", default: null },
  eligibilityPolicyVersion: { type: String, default: "" }, eligibilitySnapshotHash: { type: String, default: "" },
  maximumEligibleRefundMinor: { type: Number, min: 0, default: 0 }, confirmationEligibilitySnapshotHash: { type: String, default: "" },
  retainedConsumedMinor: { type: Number, min: 0, default: 0 },
  subscriptionImpact: { type: String, enum: ["NONE", "CANCEL_IMMEDIATELY_AFTER_REFUND", "CANCEL_AND_MOVE_TO_FREE"], default: "NONE" },
  localTransitionStatus: { type: String, enum: ["PENDING", "SUCCEEDED", "RETRY_PENDING", "FAILED"], default: "PENDING" },
  subscriptionImpactStatus: { type: String, enum: ["NOT_REQUIRED", "PENDING", "SUCCEEDED", "RETRY_PENDING", "FAILED"], default: "NOT_REQUIRED" },
  subscriptionImpactOperationId: { type: Schema.Types.ObjectId, ref: "BillingOperation", default: null },
  confirmedBy: { type: Schema.Types.ObjectId, ref: "User", default: null }, requestedAt: { type: Date, required: true, default: Date.now },
  confirmedAt: { type: Date, default: null }, rejectedAt: { type: Date, default: null }, rejectionReason: { type: String, default: "", maxlength: 500 }, provider: { type: String, required: true },
  providerRefundId: { type: String, trim: true, minlength: 1 }, status: { type: String, enum: REFUND_STATUSES, required: true, default: "REQUESTED" },
  providerStatus: { type: String, default: "" }, failureCode: { type: String, default: "" },
}, { timestamps: true });
schema.index(
  { provider: 1, providerRefundId: 1 },
  {
    unique: true,
    name: "uq_provider_refund",
    partialFilterExpression: { providerRefundId: { $type: "string" } },
  },
);
schema.index({ tenantId: 1, createdAt: -1 }, { name: "idx_refund_tenant_created" });
schema.index({ tenantId: 1, invoiceId: 1 }, { name: "idx_refund_tenant_invoice" });
schema.index({ status: 1, createdAt: -1 }, { name: "idx_refund_status_created" });
schema.index({ operationId: 1 }, { unique: true, name: "uq_refund_operation" });
schema.index({ tenantId: 1, eligibilityPreviewId: 1 }, { name: "idx_refund_tenant_eligibility_preview", sparse: true });
schema.index({ subscriptionImpactOperationId: 1 }, { name: "idx_refund_subscription_impact_operation", sparse: true });
export default mongoose.model<RefundDocument>("Refund", schema);
