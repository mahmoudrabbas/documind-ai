import mongoose, { Schema } from "mongoose";

export type DocumentClassification = "public" | "internal" | "confidential" | "restricted";
export type DocumentQuarantineStatus = "none" | "quarantined" | "cleared";

export interface ScanInfo {
  scanner: string;
  scannedAt: Date;
  result: "clean" | "infected" | "error";
  details?: string;
}

export interface DocumentDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  fileName: string;
  originalFileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
  checksum: string;
  status: "uploading" | "uploaded" | "processing" | "processed" | "failed";
  metadata: {
    title: string | null;
    description: string | null;
    tags: string[];
  };
  category: string | null;
  department: string | null;
  classification: DocumentClassification;
  owner: mongoose.Types.ObjectId | null;
  categoryId?: mongoose.Types.ObjectId | null;
  departmentId?: mongoose.Types.ObjectId | null;
  classificationId?: mongoose.Types.ObjectId | null;
  effectiveDate: Date | null;
  expiryDate: Date | null;
  version: number;
  versionLabel: string;
  isArchived: boolean;
  archivedAt: Date | null;
  archivedBy: mongoose.Types.ObjectId | null;
  deletedAt: Date | null;
  deletedBy: mongoose.Types.ObjectId | null;
  quarantineStatus: DocumentQuarantineStatus;
  scanResult: ScanInfo | null;
  uploadedBy: mongoose.Types.ObjectId;
  activePolicyId?: mongoose.Types.ObjectId | null;
  activePolicyVersion?: number | null;
  policyChangedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const scanInfoSchema = new Schema<ScanInfo>(
  {
    scanner: { type: String, required: true },
    scannedAt: { type: Date, required: true },
    result: { type: String, enum: ["clean", "infected", "error"], required: true },
    details: { type: String, default: null },
  },
  { _id: false },
);

const documentSchema = new Schema<DocumentDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    fileName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    originalFileName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    fileSize: {
      type: Number,
      required: true,
      min: 0,
    },
    mimeType: {
      type: String,
      required: true,
    },
    storageKey: {
      type: String,
      required: true,
    },
    checksum: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["uploading", "uploaded", "processing", "processed", "failed"],
      default: "uploaded",
    },
    metadata: {
      title: { type: String, default: null, maxlength: 200 },
      description: { type: String, default: null, maxlength: 1000 },
      tags: { type: [String], default: [], maxlength: 10 },
    },
    category: { type: String, default: null, maxlength: 100 },
    department: { type: String, default: null, maxlength: 100 },
    classification: {
      type: String,
      enum: ["public", "internal", "confidential", "restricted"],
      default: "internal",
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    categoryId: { type: Schema.Types.ObjectId, ref: "DocumentCategory", default: null },
    departmentId: { type: Schema.Types.ObjectId, ref: "Department", default: null },
    classificationId: { type: Schema.Types.ObjectId, ref: "DocumentClassification", default: null },
    effectiveDate: { type: Date, default: null },
    expiryDate: { type: Date, default: null },
    version: { type: Number, default: 1, min: 1 },
    versionLabel: { type: String, default: "v1" },
    isArchived: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
    archivedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    deletedAt: { type: Date, default: null },
    deletedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    quarantineStatus: {
      type: String,
      enum: ["none", "quarantined", "cleared"],
      default: "none",
    },
    scanResult: { type: scanInfoSchema, default: null },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    activePolicyId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    activePolicyVersion: {
      type: Number,
      min: 1,
      default: null,
    },
    policyChangedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        const record = ret as Record<string, unknown> & { _id?: unknown; __v?: number };
        record.id = record._id?.toString?.() ?? "";
        delete record._id;
        delete record.__v;
        delete record.storageKey;
        return record;
      },
    },
  },
);

documentSchema.index({ tenantId: 1, createdAt: -1 });
documentSchema.index({ tenantId: 1, status: 1 });
documentSchema.index({ tenantId: 1, isArchived: 1, createdAt: -1 });
documentSchema.index({ tenantId: 1, checksum: 1 });
documentSchema.index({ tenantId: 1, deletedAt: 1 });
documentSchema.index({ tenantId: 1, category: 1 });
documentSchema.index({ tenantId: 1, classification: 1 });
documentSchema.index({ tenantId: 1, categoryId: 1 });
documentSchema.index({ tenantId: 1, departmentId: 1 });
documentSchema.index({ tenantId: 1, classificationId: 1 });
documentSchema.index(
  { tenantId: 1, activePolicyId: 1, activePolicyVersion: 1 },
  {
    name: "idx_document_tenant_active_policy",
    partialFilterExpression: { activePolicyId: { $type: "objectId" } },
  },
);

const DocumentModel = mongoose.model<DocumentDocument>("Document", documentSchema);
export default DocumentModel;
