import mongoose, { Schema } from "mongoose";

export type ProcessingStageStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
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

export interface ProcessingStageDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  runId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  documentVersion: number;
  stageName: ProcessingStageName;
  status: ProcessingStageStatus;
  attemptNumber: number;
  maxAttempts: number;
  jobId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  progress: number;
  errorCode: string | null;
  errorMessage: string | null;
  retryable: boolean;
  artifactVersion: number;
  traceId: string;
  durationMs: number | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const processingStageSchema = new Schema<ProcessingStageDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    runId: {
      type: Schema.Types.ObjectId,
      ref: "ProcessingRun",
      required: true,
    },
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: true,
    },
    documentVersion: { type: Number, required: true, min: 1 },
    stageName: {
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
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "running", "completed", "failed", "skipped", "canceled"],
      default: "pending",
    },
    attemptNumber: { type: Number, default: 1, min: 1 },
    maxAttempts: { type: Number, default: 3, min: 1 },
    jobId: { type: String, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    errorCode: { type: String, default: null },
    errorMessage: { type: String, default: null },
    retryable: { type: Boolean, default: true },
    artifactVersion: { type: Number, default: 1, min: 1 },
    traceId: { type: String, required: true },
    durationMs: { type: Number, default: null },
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

processingStageSchema.index({ tenantId: 1, runId: 1, stageName: 1 });
processingStageSchema.index({ tenantId: 1, documentId: 1, documentVersion: 1 });
processingStageSchema.index({ tenantId: 1, jobId: 1 });
processingStageSchema.index({ tenantId: 1, status: 1 });

const ProcessingStageModel = mongoose.model<ProcessingStageDocument>(
  "ProcessingStage",
  processingStageSchema,
);
export default ProcessingStageModel;
