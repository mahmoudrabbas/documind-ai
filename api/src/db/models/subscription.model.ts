import mongoose, { Schema } from "mongoose";

export interface SubscriptionDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  packageId: mongoose.Types.ObjectId;
  packageVersion: number;
  status: "active" | "trialing" | "past_due" | "cancelled";
  startedAt: Date;
  renewsAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionSchema = new Schema<SubscriptionDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      unique: true,
    },
    packageId: {
      type: Schema.Types.ObjectId,
      ref: "Package",
      required: true,
      index: true,
    },
    packageVersion: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ["active", "trialing", "past_due", "cancelled"],
      default: "active",
      index: true,
    },
    startedAt: { type: Date, required: true, default: Date.now },
    renewsAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const SubscriptionModel = mongoose.model<SubscriptionDocument>(
  "Subscription",
  subscriptionSchema,
);
export default SubscriptionModel;
