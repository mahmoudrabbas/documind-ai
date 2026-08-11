import mongoose, { Schema } from "mongoose";

export interface ChunkEmbeddingDocument extends mongoose.Document {
  chunkId: mongoose.Types.ObjectId;
  generationId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  provider: string;
  modelName: string;
  modelVersion: string;
  dimensions: number;
  vector: number[];
  embeddingChecksum: string;
  department: string | null;
  category: string | null;
  classification: string | null;
  accessPolicyVersion: string | null;
  language: string;
  contentType: string;
  tokenUsage: number;
  costUsd: number;
  createdAt: Date;
}

const chunkEmbeddingSchema = new Schema<ChunkEmbeddingDocument>(
  {
    chunkId: {
      type: Schema.Types.ObjectId,
      ref: "DocumentChunk",
      required: true,
    },
    generationId: {
      type: Schema.Types.ObjectId,
      ref: "IndexGeneration",
      required: true,
    },
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
    provider: { type: String, required: true },
    modelName: { type: String, required: true },
    modelVersion: { type: String, required: true },
    dimensions: { type: Number, required: true, min: 1 },
    vector: { type: [Number], required: true },
    embeddingChecksum: { type: String, required: true },
    department: { type: String, default: null },
    category: { type: String, default: null },
    classification: { type: String, default: null },
    accessPolicyVersion: { type: String, default: null },
    language: { type: String, required: true },
    contentType: { type: String, required: true },
    tokenUsage: { type: Number, required: true, min: 0 },
    costUsd: { type: Number, required: true, min: 0 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
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

chunkEmbeddingSchema.index({ chunkId: 1, generationId: 1 }, { unique: true });
chunkEmbeddingSchema.index({ tenantId: 1, generationId: 1 });
chunkEmbeddingSchema.index({ tenantId: 1, documentId: 1 });

const ChunkEmbeddingModel = mongoose.model<ChunkEmbeddingDocument>(
  "ChunkEmbedding",
  chunkEmbeddingSchema,
);
export default ChunkEmbeddingModel;
