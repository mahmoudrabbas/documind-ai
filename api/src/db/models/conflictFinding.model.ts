import mongoose, { Schema } from "mongoose";

export type ConflictSeverity = "low" | "medium" | "high" | "critical";

export type ConflictStatus = "detected" | "reviewing" | "resolved" | "dismissed" | "escalated";

export type ConflictResolution = "keep_source" | "keep_target" | "merge" | "archive_both" | "escalate";

export interface ConflictFindingDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  sourceDocumentId: mongoose.Types.ObjectId;
  targetDocumentId: mongoose.Types.ObjectId;
  conflictType: "contradiction" | "overlapping_dates" | "inconsistent_values" | "duplicate_content";
  severity: ConflictSeverity;
  description: string;
  evidence: Array<{
    type: string;
    sourceField: string;
    sourceValue: unknown;
    targetValue: unknown;
    sourcePage?: number;
    targetPage?: number;
    explanation: string;
  }>;
  status: ConflictStatus;
  resolution: ConflictResolution | null;
  resolutionNotes: string | null;
  resolvedBy: mongoose.Types.ObjectId | null;
  resolvedAt: Date | null;
  agentName: string;
  confidence: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const conflictEvidenceSchema = new Schema(
  {
    type: { type: String, required: true },
    sourceField: { type: String, required: true },
    sourceValue: { type: Schema.Types.Mixed, required: true },
    targetValue: { type: Schema.Types.Mixed, required: true },
    sourcePage: { type: Number, default: null },
    targetPage: { type: Number, default: null },
    explanation: { type: String, required: true },
  },
  { _id: false },
);

const conflictFindingSchema = new Schema<ConflictFindingDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    sourceDocumentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: true,
      index: true,
    },
    targetDocumentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: true,
      index: true,
    },
    conflictType: {
      type: String,
      enum: ["contradiction", "overlapping_dates", "inconsistent_values", "duplicate_content"],
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      required: true,
      index: true,
    },
    description: { type: String, required: true },
    evidence: { type: [conflictEvidenceSchema], default: [] },
    status: {
      type: String,
      enum: ["detected", "reviewing", "resolved", "dismissed", "escalated"],
      default: "detected",
      index: true,
    },
    resolution: {
      type: String,
      enum: ["keep_source", "keep_target", "merge", "archive_both", "escalate"],
      default: null,
    },
    resolutionNotes: { type: String, default: null },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resolvedAt: { type: Date, default: null },
    agentName: { type: String, required: true },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    metadata: { type: Schema.Types.Mixed, default: {} },
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

conflictFindingSchema.index({ tenantId: 1, status: 1, severity: 1 });
conflictFindingSchema.index({ tenantId: 1, sourceDocumentId: 1, status: 1 });
conflictFindingSchema.index({ tenantId: 1, targetDocumentId: 1, status: 1 });

const ConflictFindingModel = mongoose.model<ConflictFindingDocument>(
  "ConflictFinding",
  conflictFindingSchema,
);
export default ConflictFindingModel;
