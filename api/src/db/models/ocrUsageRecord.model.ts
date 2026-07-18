import mongoose, { Schema } from "mongoose";

export interface OcrUsageRecordDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  documentVersion: number;
  pageNumber: number;
  provider: string;
  providerModel: string;
  language: "ar" | "en" | "ar+en";
  pagesProcessed: number;
  durationMs: number;
  costUsd: number;
  createdAt: Date;
}

const ocrUsageRecordSchema = new Schema<OcrUsageRecordDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: true,
      index: true,
    },
    documentVersion: {
      type: Number,
      required: true,
      min: 1,
    },
    pageNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    provider: { type: String, required: true },
    providerModel: { type: String, required: true },
    language: {
      type: String,
      enum: ["ar", "en", "ar+en"],
      required: true,
    },
    pagesProcessed: { type: Number, default: 1 },
    durationMs: { type: Number, default: 0 },
    costUsd: { type: Number, default: 0 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform(_doc, ret) {
        const record = ret as Record<string, unknown> & { _id?: unknown; __v?: number };
        record.id = record._id?.toString?.() ?? "";
        delete record._id;
        delete record.__v;
        return record;
      },
    },
  },
);

ocrUsageRecordSchema.index({ tenantId: 1, createdAt: -1 });
ocrUsageRecordSchema.index({ tenantId: 1, documentId: 1 });

const OcrUsageRecordModel = mongoose.model<OcrUsageRecordDocument>(
  "OcrUsageRecord",
  ocrUsageRecordSchema,
);

export default OcrUsageRecordModel;
