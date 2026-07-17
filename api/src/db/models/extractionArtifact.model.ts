import mongoose, { Schema } from "mongoose";

export interface ExtractionBlock {
  type: "paragraph" | "heading" | "table" | "list";
  text: string;
  level?: number;
  sourceOffset?: number;
}

export interface ExtractionPage {
  pageNumber: number;
  blocks: ExtractionBlock[];
}

export interface ExtractionMetadata {
  totalPages: number;
  totalCharacters: number;
  detectedLanguages: string[];
  warnings: string[];
  hasImageOnlyPages: boolean;
}

export interface ExtractionArtifactDocument extends mongoose.Document {
  documentId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  documentVersion: number;
  sourceChecksum: string;
  parserName: string;
  parserVersion: string;
  status: "pending" | "extracting" | "completed" | "failed";
  pages: ExtractionPage[];
  metadata: ExtractionMetadata;
  failureReason: string | null;
  failureCode: "malformed" | "unsupported" | "timeout" | "resource_limit" | "encrypted" | "image_only_partial" | null;
  artifactChecksum: string | null;
  durationMs: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const blockSchema = new Schema<ExtractionBlock>(
  {
    type: {
      type: String,
      enum: ["paragraph", "heading", "table", "list"],
      required: true,
    },
    text: { type: String, required: true },
    level: { type: Number },
    sourceOffset: { type: Number },
  },
  { _id: false },
);

const pageSchema = new Schema<ExtractionPage>(
  {
    pageNumber: { type: Number, required: true },
    blocks: [blockSchema],
  },
  { _id: false },
);

const metadataSchema = new Schema<ExtractionMetadata>(
  {
    totalPages: { type: Number, default: 0 },
    totalCharacters: { type: Number, default: 0 },
    detectedLanguages: { type: [String], default: [] },
    warnings: { type: [String], default: [] },
    hasImageOnlyPages: { type: Boolean, default: false },
  },
  { _id: false },
);

const extractionArtifactSchema = new Schema<ExtractionArtifactDocument>(
  {
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: true,
      index: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    documentVersion: {
      type: Number,
      required: true,
      min: 1,
    },
    sourceChecksum: {
      type: String,
      required: true,
    },
    parserName: {
      type: String,
      required: true,
    },
    parserVersion: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "extracting", "completed", "failed"],
      default: "pending",
      required: true,
      index: true,
    },
    pages: { type: [pageSchema], default: [] },
    metadata: {
      type: metadataSchema,
      default: () => ({}),
    },
    failureReason: { type: String, default: null },
    failureCode: {
      type: String,
      enum: ["malformed", "unsupported", "timeout", "resource_limit", "encrypted", "image_only_partial", null],
      default: null,
    },
    artifactChecksum: { type: String, default: null },
    durationMs: { type: Number, default: null },
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

// Create compound index for querying/identifying uniqueness per document version
extractionArtifactSchema.index({ tenantId: 1, documentId: 1, documentVersion: 1 }, { unique: true });

const ExtractionArtifactModel = mongoose.model<ExtractionArtifactDocument>(
  "ExtractionArtifact",
  extractionArtifactSchema,
);

export default ExtractionArtifactModel;
