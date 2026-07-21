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

export type PaymentState = "pending" | "paid" | "failed" | "refunded";

export interface SubscriptionDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  packageId: mongoose.Types.ObjectId;
  packageVersion: number;
  status: SubscriptionStatus;
  /** @deprecated Use periodEnd instead */
  renewsAt: Date | null;
  startedAt: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
  trialStart: Date | null;
  trialEnd: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string;
  cancelAtPeriodEnd: boolean;
  providerCustomerId: string;
  providerSubscriptionId: string;
  providerPriceId: string;
  paymentState: PaymentState;
  providerMetadata: Map<string, string>;
  lastProviderEventId: string;
  lastProviderEventTimestamp: Date | null;
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
      enum: [
        "TRIALING",
        "INCOMPLETE",
        "ACTIVE",
        "PAST_DUE",
        "PAUSED",
        "CANCEL_AT_PERIOD_END",
        "CANCELED",
        "EXPIRED",
        "UNPAID",
      ],
      default: "ACTIVE",
      index: true,
    },
    startedAt: { type: Date, required: true, default: Date.now },
    /** @deprecated Use periodEnd instead */
    renewsAt: { type: Date, default: null },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
    trialStart: { type: Date, default: null },
    trialEnd: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, default: "" },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    providerCustomerId: { type: String, default: "" },
    providerSubscriptionId: { type: String, default: "" },
    providerPriceId: { type: String, default: "" },
    paymentState: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    providerMetadata: { type: Schema.Types.Map, of: String, default: {} },
    lastProviderEventId: { type: String, default: "" },
    lastProviderEventTimestamp: { type: Date, default: null },
  },
  { timestamps: true },
);

subscriptionSchema.index({ status: 1, tenantId: 1 }, { name: "idx_status_tenant" });

const SubscriptionModel = mongoose.model<SubscriptionDocument>(
  "Subscription",
  subscriptionSchema,
);
export default SubscriptionModel;
