import type { DocumentChunkDocument } from "../../db/models/documentChunk.model.js";
import DocumentChunkModel from "../../db/models/documentChunk.model.js";
import {
  tenantScopedFind,
  tenantScopedFindOne,
  tenantScopedUpdateOne,
} from "../../db/repositories/tenantScopedRepository.js";

export interface CreateChunkInput {
  tenantId: import("mongoose").Types.ObjectId;
  documentId: import("mongoose").Types.ObjectId;
  documentVersion: number;
  generationId: import("mongoose").Types.ObjectId;
  chunkIndex: number;
  sectionPath: string[];
  pageStart: number;
  pageEnd: number;
  offsetStart: number;
  offsetEnd: number;
  contentType: import("../../db/models/documentChunk.model.js").ChunkContentType;
  language: import("../../db/models/documentChunk.model.js").ChunkLanguage;
  department: string | null;
  classification: string | null;
  text: string;
  checksum: string;
  tokenCount: number;
  status: import("../../db/models/documentChunk.model.js").ChunkStatus;
  partIndex: number | null;
  partCount: number | null;
}

export async function createChunks(
  tenantId: string,
  chunks: CreateChunkInput[],
): Promise<void> {
  await DocumentChunkModel.insertMany(
    chunks.map((c) => ({ ...c, tenantId })),
    { ordered: false },
  );
}

export async function findChunksByGeneration(
  tenantId: string,
  documentId: string,
  generationId: string,
) {
  return tenantScopedFind(DocumentChunkModel, tenantId, {
    documentId,
    generationId,
  }).sort({ chunkIndex: 1 });
}

export async function findChunkById(
  tenantId: string,
  chunkId: string,
) {
  return tenantScopedFindOne(DocumentChunkModel, tenantId, { _id: chunkId });
}

export async function updateChunkStatus(
  tenantId: string,
  chunkId: string,
  status: DocumentChunkDocument["status"],
) {
  return tenantScopedUpdateOne(DocumentChunkModel, tenantId, { _id: chunkId }, { $set: { status } });
}

export async function countChunksByGeneration(
  tenantId: string,
  documentId: string,
  generationId: string,
  status?: DocumentChunkDocument["status"],
) {
  const filter: Record<string, unknown> = { documentId, generationId };
  if (status) filter.status = status;
  return DocumentChunkModel.countDocuments({ ...filter, tenantId });
}

export async function retireChunksByGeneration(
  tenantId: string,
  documentId: string,
  generationId: string,
) {
  return tenantScopedUpdateOne(
    DocumentChunkModel,
    tenantId,
    { documentId, generationId, status: { $ne: "RETIRED" } },
    { $set: { status: "RETIRED" } },
  );
}
