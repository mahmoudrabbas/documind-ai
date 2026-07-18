import mongoose, { Schema } from "mongoose";

export interface QualityIssue {
  type: "blank_page" | "unreadable" | "garbled_text" | "broken_table" | "rotated_page" | "duplicated_page" | "low_confidence" | "low_text_density" | "mixed_language_mismatch";
  severity: "info" | "warning" | "critical";
  message: string;
  pageNumber: number;
}

export interface DocumentQualityDocument extends mongoose.Document {
  documentId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  documentVersion: number;
  overallConfidence: number;
  qualityStatus: "READY" | "READY_WITH_WARNINGS" | "REVIEW_REQUIRED" | "FAILED" | "READY_FOR_INDEXING" | "REJECTED";
  issues: QualityIssue[];
  pageConfidences: Map<string, number>;
  pageStatuses: Map<string, "READY" | "READY_WITH_WARNINGS" | "REVIEW_REQUIRED" | "FAILED" | "READY_FOR_INDEXING" | "REJECTED">;
  summary: string;
  requiresReview: boolean;
  reviewedBy: mongoose.Types.ObjectId | null;
  reviewedAt: Date | null;
  reviewDecision: "approved" | "rejected" | "retry" | null;
  reviewNotes: string | null;
  ocrProvider: string;
  ocrModelVersion: string;
  totalPagesProcessed: number;
  totalPagesOcr: number;
  totalCostUsd: number;
  durationMs: number;
  createdAt: Date;
  updatedAt: Date;
}

const qualityIssueSchema = new Schema<QualityIssue>(
  {
    type: {
      type: String,
      enum: ["blank_page", "unreadable", "garbled_text", "broken_table", "rotated_page", "duplicated_page", "low_confidence", "low_text_density", "mixed_language_mismatch"],
      required: true,
    },
    severity: {
      type: String,
      enum: ["info", "warning", "critical"],
      required: true,
    },
    message: { type: String, required: true },
    pageNumber: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const documentQualitySchema = new Schema<DocumentQualityDocument>(
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
    overallConfidence: {
      type: Number,
      default: 0,
      min: 0,
      max: 1,
    },
    qualityStatus: {
      type: String,
      enum: ["READY", "READY_WITH_WARNINGS", "REVIEW_REQUIRED", "FAILED", "READY_FOR_INDEXING", "REJECTED"],
      default: "READY",
      required: true,
      index: true,
    },
    issues: { type: [qualityIssueSchema], default: [] },
    pageConfidences: {
      type: Map,
      of: Number,
      default: () => new Map(),
    },
    pageStatuses: {
      type: Map,
      of: {
        type: String,
        enum: ["READY", "READY_WITH_WARNINGS", "REVIEW_REQUIRED", "FAILED", "READY_FOR_INDEXING", "REJECTED"],
      },
      default: () => new Map(),
    },
    summary: { type: String, default: "" },
    requiresReview: { type: Boolean, default: false, index: true },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: { type: Date, default: null },
    reviewDecision: {
      type: String,
      enum: ["approved", "rejected", "retry"],
      default: null,
    },
    reviewNotes: { type: String, default: null },
    ocrProvider: { type: String, default: "" },
    ocrModelVersion: { type: String, default: "" },
    totalPagesProcessed: { type: Number, default: 0 },
    totalPagesOcr: { type: Number, default: 0 },
    totalCostUsd: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
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

documentQualitySchema.index({ tenantId: 1, documentId: 1, documentVersion: 1 }, { unique: true });

const DocumentQualityModel = mongoose.model<DocumentQualityDocument>(
  "DocumentQuality",
  documentQualitySchema,
);

export default DocumentQualityModel;
