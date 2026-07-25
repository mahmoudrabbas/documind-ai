import mongoose, { Schema } from "mongoose";

export type ProcessingRunStatus =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "canceled";

export type ProcessingStageName =
  | "security_scanning"
  | "extraction"
  | "ocr"
  | "quality_review"
  | "metadata_review"
  | "chunking"
  | "embedding"
  | "indexing"
  | "finalization";

export interface ProcessingRunDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  documentVersion: number;
  status: ProcessingRunStatus;
  currentStage: ProcessingStageName | null;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  canceledAt: Date | null;
  canceledBy: mongoose.Types.ObjectId | null;
  retryCount: number;
  maxRetries: number;
  lastRunId: mongoose.Types.ObjectId | null;
  progress: number;
  errorCode: string | null;
  errorMessage: string | null;
  traceId: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const processingRunSchema = new Schema<ProcessingRunDocument>(
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
    },
    documentVersion: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ["queued", "running", "paused", "completed", "failed", "canceled"],
      default: "queued",
    },
    currentStage: {
      type: String,
      enum: [
        "security_scanning",
        "extraction",
        "ocr",
        "quality_review",
        "metadata_review",
        "chunking",
        "embedding",
        "indexing",
        "finalization",
      ],
      default: null,
    },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    canceledAt: { type: Date, default: null },
    canceledBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    retryCount: { type: Number, default: 0, min: 0 },
    maxRetries: { type: Number, default: 3, min: 0 },
    lastRunId: { type: Schema.Types.ObjectId, ref: "ProcessingRun", default: null },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    errorCode: { type: String, default: null },
    errorMessage: { type: String, default: null },
    traceId: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed, default: () => ({}) },
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

processingRunSchema.index({ tenantId: 1, documentId: 1, documentVersion: 1 });
processingRunSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
processingRunSchema.index({ tenantId: 1, documentId: 1, createdAt: -1 });
processingRunSchema.index({ tenantId: 1, status: 1 });

const ProcessingRunModel = mongoose.model<ProcessingRunDocument>(
  "ProcessingRun",
  processingRunSchema,
);
export default ProcessingRunModel;
