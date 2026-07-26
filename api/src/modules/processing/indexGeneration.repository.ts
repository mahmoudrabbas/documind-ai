import type { IndexGenerationDocument } from "../../db/models/indexGeneration.model.js";
import IndexGenerationModel from "../../db/models/indexGeneration.model.js";
import {
  tenantScopedFindOne,
  tenantScopedUpdateOne,
} from "../../db/repositories/tenantScopedRepository.js";

export interface CreateGenerationInput {
  documentId: import("mongoose").Types.ObjectId;
  documentVersion: number;
  tenantId: import("mongoose").Types.ObjectId;
  generationNumber: number;
  status: import("../../db/models/indexGeneration.model.js").GenerationStatus;
  expectedChunkCount: number;
  actualChunkCount: number;
  expectedEmbeddingCount: number;
  actualEmbeddingCount: number;
  atlasIndexName: string;
  atlasIndexStatus: string;
  failureReason: import("../../db/models/indexGeneration.model.js").GenerationFailureReason | null;
  triggeredBy: import("../../db/models/indexGeneration.model.js").GenerationTrigger;
  chunkingConfig: import("../../db/models/indexGeneration.model.js").ChunkingConfigDocument;
  activatedAt?: Date;
  retiredAt?: Date;
}

export async function createGeneration(
  generation: CreateGenerationInput,
) {
  return IndexGenerationModel.create(generation);
}

export async function findGenerationById(
  tenantId: string,
  generationId: string,
) {
  return tenantScopedFindOne(IndexGenerationModel, tenantId, { _id: generationId });
}

export async function findActiveGenerationByDocument(
  tenantId: string,
  documentId: string,
) {
  return tenantScopedFindOne(IndexGenerationModel, tenantId, {
    documentId,
    status: "ACTIVE",
  });
}

export async function findLatestGenerationByDocument(
  tenantId: string,
  documentId: string,
) {
  return IndexGenerationModel.findOne({ tenantId, documentId })
    .sort({ generationNumber: -1 })
    .limit(1);
}

export async function updateGenerationStatus(
  tenantId: string,
  generationId: string,
  update: Partial<Pick<IndexGenerationDocument, "status" | "actualChunkCount" | "actualEmbeddingCount" | "expectedChunkCount" | "expectedEmbeddingCount" | "atlasIndexStatus" | "failureReason" | "activatedAt" | "retiredAt">>,
) {
  return tenantScopedUpdateOne(
    IndexGenerationModel,
    tenantId,
    { _id: generationId },
    { $set: update },
  );
}

export async function incrementGenerationCounts(
  tenantId: string,
  generationId: string,
  chunkCount: number,
  embeddingCount: number,
) {
  return tenantScopedUpdateOne(
    IndexGenerationModel,
    tenantId,
    { _id: generationId },
    {
      $inc: {
        actualChunkCount: chunkCount,
        actualEmbeddingCount: embeddingCount,
      },
    },
  );
}

export async function retireActiveGeneration(
  tenantId: string,
  documentId: string,
) {
  return tenantScopedUpdateOne(
    IndexGenerationModel,
    tenantId,
    { documentId, status: "ACTIVE" },
    { $set: { status: "RETIRED", retiredAt: new Date() } },
  );
}

export async function getNextGenerationNumber(
  tenantId: string,
  documentId: string,
) {
  const latest = await IndexGenerationModel.findOne({ tenantId, documentId })
    .sort({ generationNumber: -1 })
    .limit(1)
    .select({ generationNumber: 1 });
  return (latest?.generationNumber ?? 0) + 1;
}
