import mongoose, { Schema } from "mongoose";

export interface QuotaOverrideDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  dimension:
    | "employees"
    | "admins"
    | "documents"
    | "storageMb"
    | "fileSizeMb"
    | "queriesPerMonth"
    | "tokensPerMonth"
    | "ocrPagesPerMonth";
  limit: number;
  reason?: string;
  enabled: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const quotaOverrideSchema = new Schema<QuotaOverrideDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    dimension: {
      type: String,
      enum: [
        "employees",
        "admins",
        "documents",
        "storageMb",
        "fileSizeMb",
        "queriesPerMonth",
        "tokensPerMonth",
        "ocrPagesPerMonth",
      ],
      required: true,
    },
    limit: { type: Number, required: true, min: 0 },
    reason: { type: String },
    enabled: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

quotaOverrideSchema.index(
  { tenantId: 1, dimension: 1 },
  { unique: true, name: "uniq_quota_override_per_dimension" },
);

const QuotaOverrideModel = mongoose.model<QuotaOverrideDocument>(
  "QuotaOverride",
  quotaOverrideSchema,
);

export default QuotaOverrideModel;
