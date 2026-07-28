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
  packageVersionId: mongoose.Types.ObjectId | null;
  status: SubscriptionStatus;
  /** @deprecated Use periodEnd instead */
  renewsAt: Date | null;
  startedAt: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  trialStart: Date | null;
  trialEnd: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string;
  cancelAtPeriodEnd: boolean;
  providerCustomerId: string;
  providerSubscriptionId: string;
  providerPriceId: string;
  provider: string;
  billingInterval: "monthly" | "annual" | null;
  paymentState: PaymentState;
  providerMetadata: Map<string, string>;
  lastProviderEventId: string;
  lastProviderEventTimestamp: Date | null;
  providerStateObservedAt: Date | null;
  revision: number;
  adminOperations: Array<{
    keyHash: string;
    payloadHash: string;
    resultingRevision: number;
    resultingPackageId: mongoose.Types.ObjectId;
    resultingPackageVersion: number;
    resultingStatus: SubscriptionStatus;
    createdAt: Date;
  }>;
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
    packageVersionId: { type: Schema.Types.ObjectId, default: null, index: true },
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
    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    trialStart: { type: Date, default: null },
    trialEnd: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, default: "" },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    providerCustomerId: { type: String, default: "" },
    providerSubscriptionId: { type: String, default: "" },
    providerPriceId: { type: String, default: "" },
    provider: { type: String, default: "" },
    billingInterval: { type: String, enum: ["monthly", "annual", null], default: null },
    paymentState: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    providerMetadata: { type: Schema.Types.Map, of: String, default: {} },
    lastProviderEventId: { type: String, default: "" },
    lastProviderEventTimestamp: { type: Date, default: null },
    providerStateObservedAt: { type: Date, default: null },
    revision: { type: Number, required: true, default: 0, min: 0 },
    adminOperations: {
      type: [{
        _id: false,
        keyHash: { type: String, required: true },
        payloadHash: { type: String, required: true },
        resultingRevision: { type: Number, required: true, min: 1 },
        resultingPackageId: { type: Schema.Types.ObjectId, required: true },
        resultingPackageVersion: { type: Number, required: true, min: 1 },
        resultingStatus: { type: String, required: true },
        createdAt: { type: Date, required: true },
      }],
      default: [],
      select: false,
    },
  },
  { timestamps: true },
);

subscriptionSchema.index({ status: 1, tenantId: 1 }, { name: "idx_status_tenant" });

subscriptionSchema.pre("save", function () {
  this.revision = (this.revision ?? 0) + 1;
});

subscriptionSchema.pre(["updateOne", "findOneAndUpdate"], function () {
  const update = this.getUpdate() as Record<string, Record<string, unknown>> | null;
  if (!update) return;
  update.$inc = { ...(update.$inc ?? {}), revision: 1 };
});

const SubscriptionModel = mongoose.model<SubscriptionDocument>(
  "Subscription",
  subscriptionSchema,
);
export default SubscriptionModel;
