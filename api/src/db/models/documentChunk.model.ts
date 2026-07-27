import mongoose, { Schema } from "mongoose";

export type ChunkContentType = "paragraph" | "heading" | "table" | "clause" | "list";
export type ChunkLanguage = "ar" | "en" | "mixed";
export type ChunkStatus = "DRAFT" | "EMBEDDED" | "INDEXED" | "ACTIVE" | "RETIRED";
export type ChunkClassification = "public" | "internal" | "confidential" | "restricted";

export interface DocumentChunkDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  documentVersion: number;
  generationId: mongoose.Types.ObjectId;
  chunkIndex: number;
  sectionPath: string[];
  pageStart: number;
  pageEnd: number;
  offsetStart: number;
  offsetEnd: number;
  contentType: ChunkContentType;
  language: ChunkLanguage;
  department: string | null;
  classification: ChunkClassification | null;
  text: string;
  checksum: string;
  tokenCount: number;
  status: ChunkStatus;
  partIndex: number | null;
  partCount: number | null;
  vector: number[];
  category: string | null;
  allowAiUse: boolean;
  documentVersionId: mongoose.Types.ObjectId | null;
  pageNumber: number | null;
  sectionTitle: string | null;
  createdAt: Date;
  updatedAt: Date;
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
    documentVersion: {
      type: Number,
      required: true,
      min: 1,
    },
    generationId: {
      type: Schema.Types.ObjectId,
      ref: "IndexGeneration",
      required: true,
    },
    chunkIndex: {
      type: Number,
      required: true,
      min: 0,
    },
    sectionPath: {
      type: [String],
      default: [],
    },
    pageStart: {
      type: Number,
      required: true,
      min: 1,
    },
    pageEnd: {
      type: Number,
      required: true,
      min: 1,
    },
    offsetStart: {
      type: Number,
      required: true,
      min: 0,
    },
    offsetEnd: {
      type: Number,
      required: true,
      min: 0,
    },
    contentType: {
      type: String,
      enum: ["paragraph", "heading", "table", "clause", "list"],
      required: true,
    },
    language: {
      type: String,
      enum: ["ar", "en", "mixed"],
      required: true,
    },
    department: { type: String, default: null },
    classification: {
      type: String,
      enum: ["public", "internal", "confidential", "restricted"],
      default: null,
    },
    text: { type: String, required: true },
    checksum: { type: String, required: true },
    tokenCount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["DRAFT", "EMBEDDED", "INDEXED", "ACTIVE", "RETIRED"],
      default: "DRAFT",
    },
    partIndex: { type: Number, default: null },
    partCount: { type: Number, default: null },
    vector: {
      type: [Number],
      default: [],
    },
    category: {
      type: String,
      default: null,
      maxlength: 100,
    },
    allowAiUse: {
      type: Boolean,
      default: true,
    },
    documentVersionId: {
      type: Schema.Types.ObjectId,
      ref: "DocumentVersion",
      default: null,
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

documentChunkSchema.index({ tenantId: 1, documentId: 1, generationId: 1, chunkIndex: 1 });
documentChunkSchema.index({ tenantId: 1, generationId: 1, status: 1 });
documentChunkSchema.index({ documentId: 1, generationId: 1, chunkIndex: 1 }, { unique: true });
documentChunkSchema.index({ tenantId: 1, documentId: 1, documentVersion: 1 });
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
