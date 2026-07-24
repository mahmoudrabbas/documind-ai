import mongoose, { Schema } from "mongoose";

export type ChunkClassification = "public" | "internal" | "confidential" | "restricted";

export interface DocumentChunkDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  documentVersionId: mongoose.Types.ObjectId;
  chunkIndex: number;
  text: string;
  vector: number[];
  pageNumber: number | null;
  sectionTitle: string | null;
  classification: ChunkClassification;
  category: string | null;
  department: string | null;
  allowAiUse: boolean;
  createdAt: Date;
}

const documentChunkSchema = new Schema<DocumentChunkDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: true,
    },
    documentVersionId: {
      type: Schema.Types.ObjectId,
      ref: "DocumentVersion",
      required: true,
    },
    chunkIndex: {
      type: Number,
      required: true,
      min: 0,
    },
    text: {
      type: String,
      required: true,
      maxlength: 10000,
    },
    vector: {
      type: [Number],
      default: [],
    },
    pageNumber: {
      type: Number,
      default: null,
    },
    sectionTitle: {
      type: String,
      default: null,
      maxlength: 200,
    },
    classification: {
      type: String,
      enum: ["public", "internal", "confidential", "restricted"],
      default: "internal",
    },
    category: {
      type: String,
      default: null,
      maxlength: 100,
    },
    department: {
      type: String,
      default: null,
      maxlength: 100,
    },
    allowAiUse: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        const record = ret as Record<string, unknown> & { _id?: unknown; __v?: number };
        record.id = record._id?.toString?.() ?? "";
        delete record._id;
        delete record.__v;
        delete record.vector;
        return record;
      },
    },
  },
);

documentChunkSchema.index({ tenantId: 1, documentId: 1, chunkIndex: 1 }, { unique: true });
documentChunkSchema.index({ tenantId: 1, classification: 1 });
documentChunkSchema.index({ tenantId: 1, department: 1 });
documentChunkSchema.index({ tenantId: 1, category: 1 });
documentChunkSchema.index({ tenantId: 1, allowAiUse: 1 });
documentChunkSchema.index({ tenantId: 1, documentVersionId: 1 });

const DocumentChunkModel = mongoose.model<DocumentChunkDocument>(
  "DocumentChunk",
  documentChunkSchema,
);
export default DocumentChunkModel;
