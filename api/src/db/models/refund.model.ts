import mongoose, { Schema } from "mongoose";

export const REFUND_STATUSES = ["REQUESTED", "APPROVED", "REJECTED", "COMPLETED", "FAILED"] as const;
export interface RefundDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId; invoiceId: mongoose.Types.ObjectId | null; paymentReference: string;
  subscriptionId: mongoose.Types.ObjectId | null; operationId: mongoose.Types.ObjectId;
  amountMinor: number; currency: string; reason: string; requestedBy: mongoose.Types.ObjectId;
  confirmedBy: mongoose.Types.ObjectId | null; requestedAt: Date; confirmedAt: Date | null; rejectedAt: Date | null;
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
  confirmedBy: { type: Schema.Types.ObjectId, ref: "User", default: null }, requestedAt: { type: Date, required: true, default: Date.now },
  confirmedAt: { type: Date, default: null }, rejectedAt: { type: Date, default: null }, provider: { type: String, required: true },
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
schema.index({ operationId: 1 }, { unique: true, name: "uq_refund_operation" });
export default mongoose.model<RefundDocument>("Refund", schema);
