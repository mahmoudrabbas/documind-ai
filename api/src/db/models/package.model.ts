import mongoose, { Schema } from "mongoose";

/** @deprecated use PackageEntitlements instead */
export interface PackageLimits {
  users: number;
  documents: number;
  questionsPerMonth: number;
  storageMb: number;
}

export interface PackageEntitlements {
  employees: number;
  admins: number;
  documents: number;
  storageMb: number;
  fileSizeMb: number;
  queriesPerMonth: number;
  tokensPerMonth: number;
  ocrPagesPerMonth: number;
}

export interface PackageDocument extends mongoose.Document {
  name: string;
  code: string;
  description: string;
  active: boolean;
  version: number;
  monthlyPrice: number;
  annualPrice: number;
  trialDays: number;
  currency: string;
  visibility: "public" | "internal";
  supportedModels: string[];
  analyticsLevel: "basic" | "advanced" | "enterprise";
  retentionDays: number;
  supportLevel: "community" | "standard" | "priority" | "dedicated";
  entitlements: PackageEntitlements;
  versions: Array<{
    version: number;
    monthlyPrice: number;
    annualPrice: number;
    trialDays: number;
    supportedModels: string[];
    analyticsLevel: "basic" | "advanced" | "enterprise";
    retentionDays: number;
    supportLevel: "community" | "standard" | "priority" | "dedicated";
    entitlements: PackageEntitlements;
    createdAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const entitlementsSchema = new Schema<PackageEntitlements>(
  {
    employees: { type: Number, required: true, min: 1 },
    admins: { type: Number, required: true, min: 0 },
    documents: { type: Number, required: true, min: 0 },
    storageMb: { type: Number, required: true, min: 0 },
    fileSizeMb: { type: Number, required: true, min: 0 },
    queriesPerMonth: { type: Number, required: true, min: 0 },
    tokensPerMonth: { type: Number, required: true, min: 0 },
    ocrPagesPerMonth: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const packageSchema = new Schema<PackageDocument>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    code: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 50,
    },
    description: { type: String, trim: true, maxlength: 500, default: "" },
    active: { type: Boolean, default: true, index: true },
    version: { type: Number, required: true, min: 1, default: 1 },
    monthlyPrice: { type: Number, required: true, min: 0 },
    annualPrice: { type: Number, min: 0, default: 0 },
    trialDays: { type: Number, min: 0, default: 30 },
    currency: { type: String, trim: true, uppercase: true, default: "USD" },
    visibility: {
      type: String,
      enum: ["public", "internal"],
      default: "public",
    },
    supportedModels: { type: [String], default: ["basic"] },
    analyticsLevel: {
      type: String,
      enum: ["basic", "advanced", "enterprise"],
      default: "basic",
    },
    retentionDays: { type: Number, default: 90 },
    supportLevel: {
      type: String,
      enum: ["community", "standard", "priority", "dedicated"],
      default: "community",
    },
    entitlements: { type: entitlementsSchema, required: true },
    versions: {
      type: [
        new Schema(
          {
            version: { type: Number, required: true },
            monthlyPrice: { type: Number, required: true },
            annualPrice: { type: Number, default: 0 },
            trialDays: { type: Number, default: 30 },
            supportedModels: { type: [String], default: ["basic"] },
            analyticsLevel: {
              type: String,
              enum: ["basic", "advanced", "enterprise"],
              default: "basic",
            },
            retentionDays: { type: Number, default: 90 },
            supportLevel: {
              type: String,
              enum: ["community", "standard", "priority", "dedicated"],
              default: "community",
            },
            entitlements: { type: entitlementsSchema, required: true },
            createdAt: { type: Date, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true },
);

packageSchema.virtual("limits").get(function (this: PackageDocument) {
  return this.entitlements;
});

const PackageModel = mongoose.model<PackageDocument>("Package", packageSchema);
export default PackageModel;
