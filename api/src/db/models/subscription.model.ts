import mongoose, { Schema } from "mongoose";

export type SubscriptionStatus =
  | "TRIALING"
  | "INCOMPLETE"
  | "ACTIVE"
  | "PAST_DUE"
  | "PAUSED"
  | "CANCEL_AT_PERIOD_END"
  | "CANCELED"
  | "EXPIRED"
  | "UNPAID";

export interface SubscriptionDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  packageId: mongoose.Types.ObjectId;
  packageVersion: number;
  status: SubscriptionStatus;
  startedAt: Date;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  providerPriceId: string | null;
  lastProviderEventId: string | null;
  periodStart: Date;
  periodEnd: Date | null;
  trialStart: Date | null;
  trialEnd: Date | null;
  cancellationReason: string | null;
  paymentState: "pending" | "paid" | "failed" | "refunded";
  providerMetadata: Record<string, unknown>;
}

const SUBSCRIPTION_STATUSES = [
  "TRIALING",
  "INCOMPLETE",
  "ACTIVE",
  "PAST_DUE",
  "PAUSED",
  "CANCEL_AT_PERIOD_END",
  "CANCELED",
  "EXPIRED",
  "UNPAID",
] as const;

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
      enum: SUBSCRIPTION_STATUSES,
      default: "TRIALING",
      index: true,
    },
    startedAt: { type: Date, required: true, default: Date.now },
    cancelledAt: { type: Date, default: null },
    providerCustomerId: { type: String, default: null },
    providerSubscriptionId: { type: String, default: null },
    providerPriceId: { type: String, default: null },
    lastProviderEventId: { type: String, default: null },
    periodStart: { type: Date, required: true, default: Date.now },
    periodEnd: { type: Date, default: null },
    trialStart: { type: Date, default: null },
    trialEnd: { type: Date, default: null },
    cancellationReason: { type: String, default: null },
    paymentState: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    providerMetadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

subscriptionSchema.index({ status: 1, tenantId: 1 });

const SubscriptionModel = mongoose.model<SubscriptionDocument>(
  "Subscription",
  subscriptionSchema,
);
export default SubscriptionModel;
