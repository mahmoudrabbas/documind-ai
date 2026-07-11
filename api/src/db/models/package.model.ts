import mongoose, { Schema } from "mongoose";

export interface PackageLimits {
  users: number;
  documents: number;
  questionsPerMonth: number;
  storageMb: number;
}

export interface PackageDocument extends mongoose.Document {
  name: string;
  code: string;
  description: string;
  active: boolean;
  version: number;
  monthlyPrice: number;
  currency: string;
  limits: PackageLimits;
  versions: Array<{
    version: number;
    monthlyPrice: number;
    limits: PackageLimits;
    createdAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const limitsSchema = new Schema<PackageLimits>(
  {
    users: { type: Number, required: true, min: 1 },
    documents: { type: Number, required: true, min: 0 },
    questionsPerMonth: { type: Number, required: true, min: 0 },
    storageMb: { type: Number, required: true, min: 0 },
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
    currency: { type: String, trim: true, uppercase: true, default: "USD" },
    limits: { type: limitsSchema, required: true },
    versions: {
      type: [
        new Schema(
          {
            version: { type: Number, required: true },
            monthlyPrice: { type: Number, required: true },
            limits: { type: limitsSchema, required: true },
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

const PackageModel = mongoose.model<PackageDocument>("Package", packageSchema);
export default PackageModel;
