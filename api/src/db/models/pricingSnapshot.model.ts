import mongoose, { Schema } from "mongoose";

export interface PricingSnapshotDocument extends mongoose.Document {
  provider: string;
  modelName: string;
  inputPricePer1kTokens: number;
  outputPricePer1kTokens: number;
  embeddingPricePer1kTokens: number;
  ocrPricePerPage: number;
  currency: string;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  source: "manual" | "api" | "reconciled";
  createdBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const pricingSnapshotSchema = new Schema<PricingSnapshotDocument>(
  {
    provider: {
      type: String,
      required: true,
      index: true,
    },
    modelName: {
      type: String,
      required: true,
      index: true,
    },
    inputPricePer1kTokens: {
      type: Number,
      default: 0,
    },
    outputPricePer1kTokens: {
      type: Number,
      default: 0,
    },
    embeddingPricePer1kTokens: {
      type: Number,
      default: 0,
    },
    ocrPricePerPage: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      default: "USD",
    },
    effectiveFrom: {
      type: Date,
      required: true,
      default: Date.now,
    },
    effectiveTo: {
      type: Date,
      default: null,
    },
    source: {
      type: String,
      enum: ["manual", "api", "reconciled"],
      default: "manual",
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

pricingSnapshotSchema.index({ provider: 1, modelName: 1, effectiveFrom: -1 });

const PricingSnapshotModel = mongoose.model<PricingSnapshotDocument>(
  "PricingSnapshot",
  pricingSnapshotSchema,
  "pricing_snapshots"
);

export default PricingSnapshotModel;
