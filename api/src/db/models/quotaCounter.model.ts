import mongoose, { Schema } from "mongoose";

export interface QuotaCounterDocument extends mongoose.Document {
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
  periodStart: Date;
  value: number;
}

const quotaCounterSchema = new Schema<QuotaCounterDocument>(
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
    periodStart: { type: Date, required: true },
    value: { type: Number, default: 0, min: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

quotaCounterSchema.index(
  { tenantId: 1, dimension: 1, periodStart: 1 },
  { unique: true, name: "uniq_quota_counter_period" },
);

const QuotaCounterModel = mongoose.model<QuotaCounterDocument>(
  "QuotaCounter",
  quotaCounterSchema,
);

export default QuotaCounterModel;
