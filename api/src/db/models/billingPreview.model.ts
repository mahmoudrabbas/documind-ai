import mongoose, { Schema } from "mongoose";

export interface BillingPreviewImpactField {
  field: string;
  current: number;
  target: number;
  delta: number;
}

export interface BillingPreviewDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  subscriptionId: mongoose.Types.ObjectId;
  currentPackageId: mongoose.Types.ObjectId;
  currentPackageVersionId: mongoose.Types.ObjectId | null;
  currentPackageVersion: number;
  currentBillingInterval: "monthly" | "annual" | null;
  targetPackageId: mongoose.Types.ObjectId;
  targetPackageVersionId: mongoose.Types.ObjectId | null;
  targetPackageVersion: number;
  targetBillingInterval: "monthly" | "annual";
  currency: string;
  amountDueMinor: number;
  amountCreditMinor: number;
  effectiveAt: Date | null;
  nextBillingDate: Date | null;
  expiresAt: Date;
  subscriptionRevision: number;
  provider: string;
  providerPreviewReference: string;
  providerStateObservedAt: Date | null;
  currentProviderPriceReference: string;
  targetProviderPriceReference: string;
  entitlementImpact: BillingPreviewImpactField[];
  consumedByOperationId: mongoose.Types.ObjectId | null;
  consumedAt: Date | null;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const impactSchema = new Schema<BillingPreviewImpactField>(
  {
    field: { type: String, required: true, trim: true },
    current: { type: Number, required: true },
    target: { type: Number, required: true },
    delta: { type: Number, required: true },
  },
  { _id: false },
);

const schema = new Schema<BillingPreviewDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: "Subscription", required: true, index: true },
    currentPackageId: { type: Schema.Types.ObjectId, ref: "Package", required: true },
    currentPackageVersionId: { type: Schema.Types.ObjectId, default: null },
    currentPackageVersion: { type: Number, required: true, min: 1 },
    currentBillingInterval: { type: String, enum: ["monthly", "annual", null], default: null },
    targetPackageId: { type: Schema.Types.ObjectId, ref: "Package", required: true },
    targetPackageVersionId: { type: Schema.Types.ObjectId, default: null },
    targetPackageVersion: { type: Number, required: true, min: 1 },
    targetBillingInterval: { type: String, enum: ["monthly", "annual"], required: true },
    currency: { type: String, required: true, trim: true, uppercase: true },
    amountDueMinor: { type: Number, required: true, validate: Number.isSafeInteger },
    amountCreditMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    effectiveAt: { type: Date, default: null },
    nextBillingDate: { type: Date, default: null },
    expiresAt: { type: Date, required: true, index: true },
    subscriptionRevision: { type: Number, required: true, min: 0 },
    provider: { type: String, required: true },
    providerPreviewReference: { type: String, default: "", select: false },
    providerStateObservedAt: { type: Date, default: null },
    currentProviderPriceReference: { type: String, default: "", select: false },
    targetProviderPriceReference: { type: String, default: "", select: false },
    entitlementImpact: { type: [impactSchema], default: [] },
    consumedByOperationId: { type: Schema.Types.ObjectId, ref: "BillingOperation", default: null, index: true },
    consumedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

schema.index(
  { tenantId: 1, subscriptionId: 1, createdAt: -1 },
  { name: "idx_billing_preview_tenant_subscription" },
);
schema.index(
  { tenantId: 1, expiresAt: 1 },
  { name: "idx_billing_preview_tenant_expiry" },
);
schema.index(
  { tenantId: 1, subscriptionId: 1, targetPackageVersionId: 1, targetBillingInterval: 1, subscriptionRevision: 1, expiresAt: -1 },
  { name: "idx_billing_preview_reuse" },
);

export default mongoose.model<BillingPreviewDocument>("BillingPreview", schema);
