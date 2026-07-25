import ChunkEmbeddingModel from "../../db/models/chunkEmbedding.model.js";
import {
  tenantScopedFindOne,
} from "../../db/repositories/tenantScopedRepository.js";

export interface CreateEmbeddingInput {
  chunkId: import("mongoose").Types.ObjectId;
  generationId: import("mongoose").Types.ObjectId;
  tenantId: import("mongoose").Types.ObjectId;
  documentId: import("mongoose").Types.ObjectId;
  provider: string;
  modelName: string;
  modelVersion: string;
  dimensions: number;
  vector: number[];
  embeddingChecksum: string;
  department: string | null;
  classification: string | null;
  accessPolicyVersion: string | null;
  language: string;
  contentType: string;
  tokenUsage: number;
  costUsd: number;
}

export async function createEmbeddings(
  embeddings: CreateEmbeddingInput[],
) {
  return ChunkEmbeddingModel.insertMany(embeddings, { ordered: false });
}

export async function findEmbeddingByIdempotencyKey(
  tenantId: string,
  embeddingChecksum: string,
  generationId: string,
) {
  return tenantScopedFindOne(ChunkEmbeddingModel, tenantId, {
    embeddingChecksum,
    generationId,
  });
}

export async function findEmbeddingsByGeneration(
  tenantId: string,
  generationId: string,
) {
  return ChunkEmbeddingModel.find({ tenantId, generationId }).sort({ createdAt: 1 });
}

export async function countEmbeddingsByGeneration(
  tenantId: string,
  generationId: string,
) {
  return ChunkEmbeddingModel.countDocuments({ tenantId, generationId });
}

export async function findEmbeddingsByChunkIds(
  tenantId: string,
  chunkIds: string[],
) {
  return ChunkEmbeddingModel.find({ tenantId, chunkId: { $in: chunkIds } });
}

export async function deleteEmbeddingsByGeneration(
  tenantId: string,
  generationId: string,
) {
  return ChunkEmbeddingModel.deleteMany({ tenantId, generationId });
}
