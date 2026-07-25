import mongoose, { Schema } from "mongoose";

export type GenerationStatus = "BUILDING" | "VERIFYING" | "VERIFIED" | "ACTIVE" | "FAILED" | "RETIRED";
export type GenerationTrigger = "INITIAL" | "REINDEX" | "ACCESS_POLICY_CHANGE" | "MODEL_UPGRADE";

export interface ChunkingConfigDocument {
  targetTokens: number;
  hardCeiling: number;
  overlap: number;
  tokenizerVersion: string;
}

export interface GenerationFailureReason {
  stage: string;
  code: string;
  message: string;
}

export interface IndexGenerationDocument extends mongoose.Document {
  documentId: mongoose.Types.ObjectId;
  documentVersion: number;
  tenantId: mongoose.Types.ObjectId;
  generationNumber: number;
  status: GenerationStatus;
  expectedChunkCount: number;
  actualChunkCount: number;
  expectedEmbeddingCount: number;
  actualEmbeddingCount: number;
  atlasIndexName: string;
  atlasIndexStatus: string;
  failureReason: GenerationFailureReason | null;
  triggeredBy: GenerationTrigger;
  chunkingConfig: ChunkingConfigDocument;
  createdAt: Date;
  activatedAt: Date | null;
  retiredAt: Date | null;
}

const chunkingConfigSchema = new Schema<ChunkingConfigDocument>(
  {
    targetTokens: { type: Number, required: true, default: 400 },
    hardCeiling: { type: Number, required: true, default: 800 },
    overlap: { type: Number, required: true, default: 50 },
    tokenizerVersion: { type: String, required: true, default: "cl100k_base" },
  },
  { _id: false },
);

const generationFailureReasonSchema = new Schema<GenerationFailureReason>(
  {
    stage: { type: String, required: true },
    code: { type: String, required: true },
    message: { type: String, required: true },
  },
  { _id: false },
);

const indexGenerationSchema = new Schema<IndexGenerationDocument>(
  {
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
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    generationNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ["BUILDING", "VERIFYING", "VERIFIED", "ACTIVE", "FAILED", "RETIRED"],
      default: "BUILDING",
    },
    expectedChunkCount: { type: Number, default: 0, min: 0 },
    actualChunkCount: { type: Number, default: 0, min: 0 },
    expectedEmbeddingCount: { type: Number, default: 0, min: 0 },
    actualEmbeddingCount: { type: Number, default: 0, min: 0 },
    atlasIndexName: { type: String, default: "vidx_chunk_embeddings_v1" },
    atlasIndexStatus: { type: String, default: "UNKNOWN" },
    failureReason: { type: generationFailureReasonSchema, default: null },
    triggeredBy: {
      type: String,
      enum: ["INITIAL", "REINDEX", "ACCESS_POLICY_CHANGE", "MODEL_UPGRADE"],
      required: true,
    },
    chunkingConfig: {
      type: chunkingConfigSchema,
      required: true,
    },
    activatedAt: { type: Date, default: null },
    retiredAt: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
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

indexGenerationSchema.index({ documentId: 1, generationNumber: 1 }, { unique: true });
indexGenerationSchema.index({ documentId: 1, status: 1 });
indexGenerationSchema.index({ tenantId: 1, documentId: 1 });
indexGenerationSchema.index({ tenantId: 1, status: 1 });

const IndexGenerationModel = mongoose.model<IndexGenerationDocument>(
  "IndexGeneration",
  indexGenerationSchema,
);
export default IndexGenerationModel;
