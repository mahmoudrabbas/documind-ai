import mongoose, { Schema } from "mongoose";

export interface DocumentVersionDocument extends mongoose.Document {
  documentId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  version: number;
  versionLabel: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  checksum: string;
  storageKey: string;
  uploadedBy: mongoose.Types.ObjectId;
  uploadReason: "initial" | "replace" | "restore";
  changeDescription: string | null;
  createdAt: Date;
}

const documentVersionSchema = new Schema<DocumentVersionDocument>(
  {
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    version: {
      type: Number,
      required: true,
      min: 1,
    },
    versionLabel: {
      type: String,
      required: true,
    },
    fileName: {
      type: String,
      required: true,
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
    checksum: {
      type: String,
      required: true,
    },
    storageKey: {
      type: String,
      required: true,
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    uploadReason: {
      type: String,
      enum: ["initial", "replace", "restore"],
      required: true,
    },
    changeDescription: {
      type: String,
      default: null,
      maxlength: 500,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
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

documentVersionSchema.index({ documentId: 1, version: -1 });
documentVersionSchema.index({ tenantId: 1, documentId: 1 });

const DocumentVersionModel = mongoose.model<DocumentVersionDocument>(
  "DocumentVersion",
  documentVersionSchema,
);
export default DocumentVersionModel;
