import mongoose, { Schema } from "mongoose";

export type ImportBatchState =
  | "UPLOADED"
  | "PARSED"
  | "PREVIEW_READY"
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "PARTIALLY_COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface IEmployeeImportBatch extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  originalFileName: string;
  fileChecksum: string;
  fileSizeBytes?: number;
  totalRows: number;
  state: ImportBatchState;
  mapping: {
    columnMapping: Record<string, string>; // excelHeader -> targetField
    unmappedColumns: string[];
    confidence: "high" | "medium" | "low";
  };
  summary: {
    valid: number;
    warning: number;
    invalid: number;
    skipped: number;
    created: number;
    failed: number;
  };
  idempotencyKey: string;
  processingStartedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EmployeeImportBatchSchema = new Schema<IEmployeeImportBatch>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    originalFileName: { type: String, required: true, maxlength: 255 },
    fileChecksum: { type: String, required: true },
    fileSizeBytes: { type: Number },
    totalRows: { type: Number, required: true, min: 0 },
    state: {
      type: String,
      enum: ["UPLOADED", "PARSED", "PREVIEW_READY", "QUEUED", "PROCESSING", "COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "CANCELLED"],
      required: true,
      default: "UPLOADED",
    },
    mapping: {
      columnMapping: { type: Schema.Types.Mixed, default: {} },
      unmappedColumns: { type: [String], default: [] },
      confidence: { type: String, enum: ["high", "medium", "low"], default: "medium" },
    },
    summary: {
      valid: { type: Number, default: 0 },
      warning: { type: Number, default: 0 },
      invalid: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
      created: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
    idempotencyKey: { type: String, required: true, unique: true },
    processingStartedAt: { type: Date },
    completedAt: { type: Date },
    errorMessage: { type: String, maxlength: 1000 },
  },
  { timestamps: true }
);

// Indexes
EmployeeImportBatchSchema.index({ tenantId: 1, createdAt: -1 });
EmployeeImportBatchSchema.index({ tenantId: 1, state: 1 });
EmployeeImportBatchSchema.index({ state: 1, createdAt: 1 }); // for worker to find QUEUED batches

export default mongoose.model<IEmployeeImportBatch>("EmployeeImportBatch", EmployeeImportBatchSchema);
