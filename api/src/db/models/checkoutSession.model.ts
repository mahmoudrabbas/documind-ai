import mongoose, { Schema } from "mongoose";

export interface CheckoutSessionDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  packageId: mongoose.Types.ObjectId;
  packageVersion: number;
  billingInterval: "monthly" | "annual";
  providerSessionId: string;
  providerCustomerId: string;
  status: "pending" | "completed" | "expired" | "failed";
  returnUrl: string;
  cancelUrl: string;
  metadata: Map<string, string>;
  expiresAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const checkoutSessionSchema = new Schema<CheckoutSessionDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    packageId: {
      type: Schema.Types.ObjectId,
      ref: "Package",
      required: true,
    },
    packageVersion: { type: Number, required: true, min: 1 },
    billingInterval: {
      type: String,
      enum: ["monthly", "annual"],
      required: true,
    },
    providerSessionId: { type: String, required: true, unique: true },
    providerCustomerId: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "completed", "expired", "failed"],
      default: "pending",
      index: true,
    },
    returnUrl: { type: String, default: "" },
    cancelUrl: { type: String, default: "" },
    metadata: { type: Schema.Types.Map, of: String, default: {} },
    expiresAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

checkoutSessionSchema.index(
  { tenantId: 1, status: 1 },
  { name: "idx_tenant_status" },
);

const CheckoutSessionModel = mongoose.model<CheckoutSessionDocument>(
  "CheckoutSession",
  checkoutSessionSchema,
);
export default CheckoutSessionModel;
