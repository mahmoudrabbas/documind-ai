import mongoose, { Schema } from "mongoose";

export interface ExportJobDocument extends mongoose.Document {
  tenantId?: mongoose.Types.ObjectId | null;
  actorId: mongoose.Types.ObjectId;
  type: "csv" | "xlsx";
  status: "pending" | "running" | "completed" | "failed";
  filters: Record<string, unknown>;
  rowCount: number;
  filePath?: string | null;
  error?: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const exportJobSchema = new Schema<ExportJobDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: false,
      default: null,
      index: true,
    },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["csv", "xlsx"],
      default: "csv",
    },
    status: {
      type: String,
      enum: ["pending", "running", "completed", "failed"],
      default: "pending",
      index: true,
    },
    filters: {
      type: Schema.Types.Mixed,
      default: {},
    },
    rowCount: {
      type: Number,
      default: 0,
    },
    filePath: {
      type: String,
      default: null,
    },
    error: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

exportJobSchema.index({ tenantId: 1, createdAt: -1 });

const ExportJobModel = mongoose.model<ExportJobDocument>(
  "ExportJob",
  exportJobSchema,
  "export_jobs"
);

export default ExportJobModel;
