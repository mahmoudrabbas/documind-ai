import mongoose, { Schema } from "mongoose";

export type ImportRowState =
  | "PENDING"
  | "VALID"
  | "WARNING"
  | "INVALID"
  | "PROCESSING"
  | "CREATED"
  | "INVITED"
  | "FAILED"
  | "SKIPPED";

export interface ValidationIssue {
  field: string;
  code: string;
  message: string;
}

export interface IEmployeeImportRow extends mongoose.Document {
  batchId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  rowNumber: number;
  rawData: Record<string, unknown>;
  state: ImportRowState;
  validationErrors: ValidationIssue[];
  validationWarnings: ValidationIssue[];
  checksum: string;
  idempotencyKey: string;
  createdUserId?: mongoose.Types.ObjectId;
  errorMessage?: string;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ValidationIssueSchema = new Schema<ValidationIssue>(
  {
    field: { type: String, required: true },
    code: { type: String, required: true },
    message: { type: String, required: true },
  },
  { _id: false }
);

const EmployeeImportRowSchema = new Schema<IEmployeeImportRow>(
  {
    batchId: { type: Schema.Types.ObjectId, ref: "EmployeeImportBatch", required: true, index: true },
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    rowNumber: { type: Number, required: true },
    rawData: { type: Schema.Types.Mixed, required: true },
    state: {
      type: String,
      enum: ["PENDING", "VALID", "WARNING", "INVALID", "PROCESSING", "CREATED", "INVITED", "FAILED", "SKIPPED"],
      required: true,
      default: "PENDING",
    },
    validationErrors: { type: [ValidationIssueSchema], default: [] },
    validationWarnings: { type: [ValidationIssueSchema], default: [] },
    checksum: { type: String, required: true },
    idempotencyKey: { type: String, required: true, unique: true },
    createdUserId: { type: Schema.Types.ObjectId, ref: "User" },
    errorMessage: { type: String, maxlength: 1000 },
    processedAt: { type: Date },
  },
  { timestamps: true }
);

// Indexes
EmployeeImportRowSchema.index({ batchId: 1, state: 1 });
EmployeeImportRowSchema.index({ batchId: 1, rowNumber: 1 }, { unique: true });
EmployeeImportRowSchema.index({ tenantId: 1, state: 1 });

export default mongoose.model<IEmployeeImportRow>("EmployeeImportRow", EmployeeImportRowSchema);
