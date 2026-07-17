import mongoose, { Schema } from "mongoose";

export interface PaymentEventDocument extends mongoose.Document {
  eventId: string;
  eventType: string;
  provider: string;
  status: "received" | "verified" | "processed" | "failed";
  signature: string;
  rawBody: string;
  payload: Record<string, unknown>;
  processingErrors: string[];
  processedAt: Date | null;
  tenantId: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const paymentEventSchema = new Schema<PaymentEventDocument>(
  {
    eventId: { type: String, required: true, unique: true },
    eventType: { type: String, required: true, index: true },
    provider: { type: String, required: true, default: "stripe" },
    status: {
      type: String,
      enum: ["received", "verified", "processed", "failed"],
      default: "received",
      index: true,
    },
    signature: { type: String, default: "" },
    rawBody: { type: String, default: "" },
    payload: { type: Schema.Types.Mixed, default: {} },
    processingErrors: [{ type: String }],
    processedAt: { type: Date, default: null },
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", default: null, index: true },
  },
  { timestamps: true },
);

paymentEventSchema.index({ eventId: 1, status: 1 }, { name: "idx_event_id_status" });

const PaymentEventModel = mongoose.model<PaymentEventDocument>(
  "PaymentEvent",
  paymentEventSchema,
);
export default PaymentEventModel;
