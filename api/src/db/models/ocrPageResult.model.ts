import mongoose, { Schema } from "mongoose";

export interface OcrWord {
  text: string;
  confidence: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface OcrPageResultDocument extends mongoose.Document {
  documentId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  documentVersion: number;
  pageNumber: number;
  text: string;
  confidence: number;
  words: OcrWord[];
  language: "ar" | "en" | "ar+en";
  provider: string;
  providerModel: string;
  providerVersion: string;
  durationMs: number;
  costUsd: number;
  warnings: string[];
  status: "pending" | "processing" | "completed" | "failed" | "retry";
  failureReason: string | null;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  updatedAt: Date;
}

const boundingBoxSchema = new Schema(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
  },
  { _id: false },
);

const ocrWordSchema = new Schema<OcrWord>(
  {
    text: { type: String, required: true },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    boundingBox: { type: boundingBoxSchema, default: undefined },
  },
  { _id: false },
);

const ocrPageResultSchema = new Schema<OcrPageResultDocument>(
  {
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: true,
      index: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
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
    text: { type: String, default: "" },
    confidence: { type: Number, default: 0, min: 0, max: 1 },
    words: { type: [ocrWordSchema], default: [] },
    language: {
      type: String,
      enum: ["ar", "en", "ar+en"],
      required: true,
    },
    provider: { type: String, required: true },
    providerModel: { type: String, required: true },
    providerVersion: { type: String, default: "" },
    durationMs: { type: Number, default: 0 },
    costUsd: { type: Number, default: 0 },
    warnings: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed", "retry"],
      default: "pending",
      required: true,
    },
    failureReason: { type: String, default: null },
    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 3 },
  },
  {
    timestamps: true,
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

ocrPageResultSchema.index({ tenantId: 1, documentId: 1, documentVersion: 1, pageNumber: 1 }, { unique: true });
ocrPageResultSchema.index({ tenantId: 1, status: 1 });

const OcrPageResultModel = mongoose.model<OcrPageResultDocument>(
  "OcrPageResult",
  ocrPageResultSchema,
);

export default OcrPageResultModel;
