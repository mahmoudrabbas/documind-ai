import mongoose, { Schema } from "mongoose";

export interface InvoiceDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId; subscriptionId: mongoose.Types.ObjectId | null;
  provider: string; providerInvoiceId: string; invoiceNumber: string;
  status: "draft" | "open" | "paid" | "void" | "uncollectible";
  currency: string; amountDueMinor: number; amountPaidMinor: number; amountRemainingMinor: number;
  subtotalMinor: number; taxMinor: number | null; createdAtProvider: Date; dueAt: Date | null;
  paidAt: Date | null; periodStart: Date | null; periodEnd: Date | null; synchronizedAt: Date;
  hostedInvoiceUrl: string; invoicePdfUrl: string; receiptUrl: string;
  providerVersion: string; lastProviderEventId: string; providerStateObservedAt: Date | null;
  createdAt: Date; updatedAt: Date;
}

const schema = new Schema<InvoiceDocument>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
  subscriptionId: { type: Schema.Types.ObjectId, ref: "Subscription", default: null },
  provider: { type: String, required: true }, providerInvoiceId: { type: String, required: true },
  invoiceNumber: { type: String, default: "" },
  status: { type: String, enum: ["draft", "open", "paid", "void", "uncollectible"], required: true },
  currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
  amountDueMinor: { type: Number, required: true, min: 0 }, amountPaidMinor: { type: Number, required: true, min: 0 },
  amountRemainingMinor: { type: Number, required: true, min: 0 }, subtotalMinor: { type: Number, required: true, min: 0 },
  taxMinor: { type: Number, default: null, min: 0 }, createdAtProvider: { type: Date, required: true },
  dueAt: { type: Date, default: null }, paidAt: { type: Date, default: null }, periodStart: { type: Date, default: null }, periodEnd: { type: Date, default: null },
  synchronizedAt: { type: Date, required: true, default: Date.now },
  hostedInvoiceUrl: { type: String, default: "", select: false }, invoicePdfUrl: { type: String, default: "", select: false }, receiptUrl: { type: String, default: "", select: false },
  providerVersion: { type: String, default: "" }, lastProviderEventId: { type: String, default: "" }, providerStateObservedAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ provider: 1, providerInvoiceId: 1 }, { unique: true, name: "uq_provider_invoice" });
schema.index({ tenantId: 1, createdAtProvider: -1 }, { name: "idx_invoice_tenant_created" });
schema.index({ tenantId: 1, status: 1 }, { name: "idx_invoice_tenant_status" });
schema.index({ tenantId: 1, subscriptionId: 1 }, { name: "idx_invoice_tenant_subscription" });
export default mongoose.model<InvoiceDocument>("Invoice", schema);
