import mongoose, { Schema } from "mongoose";

export type RelationshipType =
  | "VERSION_OF"
  | "SUPERSEDES"
  | "SUPERSEDED_BY"
  | "DUPLICATE_OF"
  | "RELATED_TO"
  | "CONFLICTS_WITH";

export type RelationshipStatus = "active" | "pending" | "rejected" | "superseded";

export interface DocumentRelationshipDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  sourceDocumentId: mongoose.Types.ObjectId;
  targetDocumentId: mongoose.Types.ObjectId;
  relationshipType: RelationshipType;
  confidence: number;
  evidence: Array<{
    type: string;
    description: string;
    sourceField?: string;
  }>;
  status: RelationshipStatus;
  approvedBy: mongoose.Types.ObjectId | null;
  approvedAt: Date | null;
  rejectionReason: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const evidenceSchema = new Schema(
  {
    type: { type: String, required: true },
    description: { type: String, required: true },
    sourceField: { type: String, default: null },
  },
  { _id: false },
);

const documentRelationshipSchema = new Schema<DocumentRelationshipDocument>(
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
    relationshipType: {
      type: String,
      enum: ["VERSION_OF", "SUPERSEDES", "SUPERSEDED_BY", "DUPLICATE_OF", "RELATED_TO", "CONFLICTS_WITH"],
      required: true,
      index: true,
    },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    evidence: { type: [evidenceSchema], default: [] },
    status: {
      type: String,
      enum: ["active", "pending", "rejected", "superseded"],
      default: "pending",
      index: true,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },
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

documentRelationshipSchema.index({ tenantId: 1, sourceDocumentId: 1, status: 1 });
documentRelationshipSchema.index({ tenantId: 1, targetDocumentId: 1, status: 1 });
documentRelationshipSchema.index({ tenantId: 1, relationshipType: 1, status: 1 });
documentRelationshipSchema.index(
  { tenantId: 1, sourceDocumentId: 1, targetDocumentId: 1, relationshipType: 1 },
  { unique: true },
);

const DocumentRelationshipModel = mongoose.model<DocumentRelationshipDocument>(
  "DocumentRelationship",
  documentRelationshipSchema,
);
export default DocumentRelationshipModel;
