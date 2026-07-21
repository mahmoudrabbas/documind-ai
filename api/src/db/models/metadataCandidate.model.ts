import mongoose, { Schema } from "mongoose";

export type CandidateStatus = "pending" | "approved" | "rejected" | "superseded";

export type MetadataFieldType =
  | "title"
  | "documentType"
  | "department"
  | "effectiveDate"
  | "expiryDate"
  | "version"
  | "owner"
  | "language"
  | "classification"
  | "tags"
  | "accessRecommendation"
  | "description";

export interface MetadataCandidateDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  documentVersion: number;
  fieldType: MetadataFieldType;
  proposedValue: unknown;
  confidence: number;
  evidence: Array<{
    type: string;
    description: string;
    sourceField?: string;
    sourcePage?: number;
    sourceText?: string;
  }>;
  agentName: string;
  status: CandidateStatus;
  reviewedBy: mongoose.Types.ObjectId | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  appliedValue: unknown;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const candidateEvidenceSchema = new Schema(
  {
    type: { type: String, required: true },
    description: { type: String, required: true },
    sourceField: { type: String, default: null },
    sourcePage: { type: Number, default: null },
    sourceText: { type: String, default: null },
  },
  { _id: false },
);

const metadataCandidateSchema = new Schema<MetadataCandidateDocument>(
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
    fieldType: {
      type: String,
      enum: [
        "title",
        "documentType",
        "department",
        "effectiveDate",
        "expiryDate",
        "version",
        "owner",
        "language",
        "classification",
        "tags",
        "accessRecommendation",
        "description",
      ],
      required: true,
      index: true,
    },
    proposedValue: { type: Schema.Types.Mixed, required: true },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    evidence: { type: [candidateEvidenceSchema], default: [] },
    agentName: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "superseded"],
      default: "pending",
      index: true,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },
    appliedValue: { type: Schema.Types.Mixed, default: null },
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

metadataCandidateSchema.index({ tenantId: 1, documentId: 1, status: 1 });
metadataCandidateSchema.index({ tenantId: 1, documentId: 1, fieldType: 1, status: 1 });
metadataCandidateSchema.index({ tenantId: 1, status: 1, confidence: -1 });

const MetadataCandidateModel = mongoose.model<MetadataCandidateDocument>(
  "MetadataCandidate",
  metadataCandidateSchema,
);
export default MetadataCandidateModel;
