import mongoose, { Schema } from "mongoose";

export const REFUND_REASON_CODES = [
  "DUPLICATE_CHARGE",
  "SERVICE_NOT_DELIVERED",
  "VOLUNTARY_CANCELLATION",
  "BILLING_ERROR",
  "GOODWILL_CREDIT",
] as const;
export type RefundReasonCode = (typeof REFUND_REASON_CODES)[number];
export type RefundSubscriptionImpact = "NONE" | "CANCEL_IMMEDIATELY_AFTER_REFUND";

export interface RefundEligibilityPreviewDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  invoiceId: mongoose.Types.ObjectId;
  subscriptionId: mongoose.Types.ObjectId;
  policyVersion: string;
  reason: RefundReasonCode;
  explanation: string;
  subscriptionImpact: RefundSubscriptionImpact;
  subscriptionRevision: number;
  subscriptionPeriodStart: Date;
  subscriptionPeriodEnd: Date;
  measuredAt: Date;
  amountPaidMinor: number;
  currency: string;
  elapsedPeriodRatioBps: number;
  includedUsageMetrics: Array<{ dimension: string; usage: number; limit: number; ratioBps: number }>;
  consumedRatioBps: number;
  confirmedRefundAmountMinor: number;
  pendingReservedRefundAmountMinor: number;
  maximumEligibleRefundMinor: number;
  reviewRequired: boolean;
  decisionReason: string;
  snapshotHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  consumedByRefundId: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<RefundEligibilityPreviewDocument>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
  invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", required: true },
  subscriptionId: { type: Schema.Types.ObjectId, ref: "Subscription", required: true },
  policyVersion: { type: String, required: true },
  reason: { type: String, enum: REFUND_REASON_CODES, required: true },
  explanation: { type: String, default: "", maxlength: 500 },
  subscriptionImpact: { type: String, enum: ["NONE", "CANCEL_IMMEDIATELY_AFTER_REFUND"], required: true },
  subscriptionRevision: { type: Number, required: true, min: 0 },
  subscriptionPeriodStart: { type: Date, required: true },
  subscriptionPeriodEnd: { type: Date, required: true },
  measuredAt: { type: Date, required: true },
  amountPaidMinor: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
  elapsedPeriodRatioBps: { type: Number, required: true, min: 0, max: 10_000 },
  includedUsageMetrics: [{ _id: false, dimension: String, usage: Number, limit: Number, ratioBps: Number }],
  consumedRatioBps: { type: Number, required: true, min: 0, max: 10_000 },
  confirmedRefundAmountMinor: { type: Number, required: true, min: 0 },
  pendingReservedRefundAmountMinor: { type: Number, required: true, min: 0 },
  maximumEligibleRefundMinor: { type: Number, required: true, min: 0 },
  reviewRequired: { type: Boolean, required: true },
  decisionReason: { type: String, required: true },
  snapshotHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  consumedAt: { type: Date, default: null },
  consumedByRefundId: { type: Schema.Types.ObjectId, ref: "Refund", default: null },
}, { timestamps: true });

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl_refund_eligibility_preview" });
schema.index({ tenantId: 1, invoiceId: 1, createdAt: -1 }, { name: "idx_refund_eligibility_tenant_invoice" });
schema.index({ tenantId: 1, subscriptionId: 1, expiresAt: 1 }, { name: "idx_refund_eligibility_tenant_subscription" });
schema.index({ snapshotHash: 1 }, { name: "idx_refund_eligibility_snapshot" });

export default mongoose.model<RefundEligibilityPreviewDocument>("RefundEligibilityPreview", schema);
