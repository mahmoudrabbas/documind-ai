import { createHash } from "node:crypto";
import DocumentModel from "../../../db/models/document.model.js";
import type { DocumentSearchStatus } from "../../../db/models/document.model.js";
import type { IndexGenerationDocument } from "../../../db/models/indexGeneration.model.js";
import type { ChunkingConfig } from "../chunking/chunker.js";
import { DEFAULT_CHUNKING_CONFIG } from "../chunking/chunker.js";
import {
  createGeneration,
  findGenerationById,
  findActiveGenerationByDocument,
  updateGenerationStatus,
  getNextGenerationNumber,
  retireActiveGeneration,
} from "../indexGeneration.repository.js";
import {
  createChunks,
  countChunksByGeneration,
  findChunksByGeneration,
} from "../documentChunk.repository.js";
import {
  createEmbeddings,
  countEmbeddingsByGeneration,
} from "../chunkEmbedding.repository.js";
import type { ChunkCandidate } from "../chunking/strategies/chunkingStrategy.js";
import type { EmbeddingResult } from "../../../providers/embedding/embeddingProvider.port.js";
import { getMetricRecorder, getAuditWriter } from "../../../common/observability/index.js";
import {
  recordGenerationStarted,
  recordGenerationActivated,
  recordGenerationFailed,
  recordGenerationRolledBack,
  recordVerificationResult,
} from "./indexing.metrics.js";

export interface GenerationStartInput {
  tenantId: string;
  documentId: string;
  documentVersion: number;
  triggeredBy: IndexGenerationDocument["triggeredBy"];
  chunkingConfig?: Partial<ChunkingConfig>;
  department?: string | null;
  category?: string | null;
  classification?: string | null;
}

export interface GenerationVerificationResult {
  verified: boolean;
  expectedChunkCount: number;
  actualChunkCount: number;
  expectedEmbeddingCount: number;
  actualEmbeddingCount: number;
  failureReason?: { stage: string; code: string; message: string };
}

export async function startGeneration(
  input: GenerationStartInput,
): Promise<IndexGenerationDocument> {
  const tenantId = input.tenantId;
  const config: ChunkingConfig = { ...DEFAULT_CHUNKING_CONFIG, ...input.chunkingConfig };

  const generationNumber = await getNextGenerationNumber(tenantId, input.documentId);

  const generation = await createGeneration({
    documentId: input.documentId as unknown as import("mongoose").Types.ObjectId,
    documentVersion: input.documentVersion,
    tenantId: tenantId as unknown as import("mongoose").Types.ObjectId,
    generationNumber,
    status: "BUILDING",
    expectedChunkCount: 0,
    actualChunkCount: 0,
    expectedEmbeddingCount: 0,
    actualEmbeddingCount: 0,
    atlasIndexName: "vidx_chunk_embeddings_v1",
    atlasIndexStatus: "UNKNOWN",
    failureReason: null,
    triggeredBy: input.triggeredBy,
    chunkingConfig: config,
  });

  const doc = await DocumentModel.findOne({
    _id: input.documentId,
    tenantId: tenantId as unknown as import("mongoose").Types.ObjectId,
  });

  if (doc) {
    const now = new Date();
    if (doc.searchStatus === "READY") {
      await DocumentModel.findOneAndUpdate(
        { _id: input.documentId, tenantId: tenantId as unknown as import("mongoose").Types.ObjectId },
        {
          $set: {
            searchStatus: "STALE",
            currentGeneration: generation._id as unknown as import("mongoose").Types.ObjectId,
            pendingGeneration: null,
            lastSearchStatusChange: now,
          },
        },
      );
    } else {
      await DocumentModel.findOneAndUpdate(
        { _id: input.documentId, tenantId: tenantId as unknown as import("mongoose").Types.ObjectId },
        {
          $set: {
            searchStatus: "INDEXING",
            currentGeneration: generation._id as unknown as import("mongoose").Types.ObjectId,
            pendingGeneration: null,
            lastSearchStatusChange: now,
          },
        },
      );
    }
  }

  recordGenerationStarted(getMetricRecorder(), { triggeredBy: input.triggeredBy, tenantId });

  return generation;
}

export async function persistChunks(
  tenantId: string,
  documentId: string,
  documentVersion: number,
  generationId: string,
  chunks: ChunkCandidate[],
  department: string | null,
  classification: string | null,
  accessPolicyVersion: string | null = null,
  category: string | null = null,
): Promise<void> {
  const chunkDocs = chunks.map((chunk, index) => ({
    tenantId: tenantId as unknown as import("mongoose").Types.ObjectId,
    documentId: documentId as unknown as import("mongoose").Types.ObjectId,
    documentVersion,
    generationId: generationId as unknown as import("mongoose").Types.ObjectId,
    chunkIndex: index,
    sectionPath: chunk.sectionPath,
    pageStart: chunk.pageStart,
    pageEnd: chunk.pageEnd,
    offsetStart: chunk.offsetStart,
    offsetEnd: chunk.offsetEnd,
    contentType: chunk.contentType,
    language: chunk.language,
    department,
    category,
    classification,
    accessPolicyVersion,
    confidenceScore: null,
    text: chunk.text,
    checksum: createHash("sha256").update(chunk.text).digest("hex"),
    tokenCount: chunk.tokenCount,
    status: "DRAFT" as const,
    partIndex: chunk.partIndex,
    partCount: chunk.partCount,
  }));

  await createChunks(tenantId, chunkDocs);

  await updateGenerationStatus(tenantId, generationId, {
    expectedChunkCount: chunks.length,
    actualChunkCount: chunks.length,
  });
}

export interface EmbeddingProviderMeta {
  providerName: string;
  modelName: string;
  dimensions: number;
}

export async function persistEmbeddings(
  tenantId: string,
  generationId: string,
  documentId: string,
  results: EmbeddingResult[],
  providerMeta: EmbeddingProviderMeta,
): Promise<void> {
  const chunks = await findChunksByGeneration(tenantId, documentId, generationId);
  const chunkMap = new Map(chunks.map((c) => [c._id.toString(), c]));

  const embeddingDocs = results.map((result) => {
    const chunk = chunkMap.get(result.chunkId);
    const inputText = chunk?.text ?? "";

    return {
      chunkId: result.chunkId as unknown as import("mongoose").Types.ObjectId,
      generationId: generationId as unknown as import("mongoose").Types.ObjectId,
      tenantId: tenantId as unknown as import("mongoose").Types.ObjectId,
      documentId: documentId as unknown as import("mongoose").Types.ObjectId,
      provider: providerMeta.providerName,
      modelName: providerMeta.modelName,
      modelVersion: result.modelVersion,
      dimensions: providerMeta.dimensions,
      vector: result.vector,
      embeddingChecksum: createHash("sha256")
        .update(inputText)
        .digest("hex"),
      department: chunk?.department ?? null,
      category: chunk?.category ?? null,
      classification: chunk?.classification ?? null,
      accessPolicyVersion: chunk?.accessPolicyVersion ?? null,
      language: chunk?.language ?? "en",
      contentType: chunk?.contentType ?? "paragraph",
      tokenUsage: result.tokenUsage,
      costUsd: result.costUsd,
    };
  });

  await createEmbeddings(embeddingDocs);

  await updateGenerationStatus(tenantId, generationId, {
    expectedEmbeddingCount: results.length,
    actualEmbeddingCount: results.length,
  });
}

export async function verifyGeneration(
  tenantId: string,
  generationId: string,
): Promise<GenerationVerificationResult> {
  const generation = await findGenerationById(tenantId, generationId);
  if (!generation) {
    return {
      verified: false,
      expectedChunkCount: 0,
      actualChunkCount: 0,
      expectedEmbeddingCount: 0,
      actualEmbeddingCount: 0,
      failureReason: { stage: "verify", code: "GENERATION_NOT_FOUND", message: "Generation not found" },
    };
  }

  await updateGenerationStatus(tenantId, generationId, { status: "VERIFYING" });

  const actualChunkCount = await countChunksByGeneration(
    tenantId,
    generation.documentId.toString(),
    generationId,
  );

  const actualEmbeddingCount = await countEmbeddingsByGeneration(tenantId, generationId);

  const chunkMatch = actualChunkCount === generation.expectedChunkCount;
  const embeddingMatch = actualEmbeddingCount === generation.expectedEmbeddingCount;

  if (chunkMatch && embeddingMatch) {
    await updateGenerationStatus(tenantId, generationId, {
      status: "VERIFIED",
      actualChunkCount,
      actualEmbeddingCount,
    });

    recordVerificationResult(getMetricRecorder(), { verified: "true", tenantId });

    return {
      verified: true,
      expectedChunkCount: generation.expectedChunkCount,
      actualChunkCount,
      expectedEmbeddingCount: generation.expectedEmbeddingCount,
      actualEmbeddingCount,
    };
  }

  const failureReason = {
    stage: "verify",
    code: "COUNT_MISMATCH",
    message: `Chunks: ${actualChunkCount}/${generation.expectedChunkCount}, Embeddings: ${actualEmbeddingCount}/${generation.expectedEmbeddingCount}`,
  };

  await updateGenerationStatus(tenantId, generationId, {
    status: "FAILED",
    actualChunkCount,
    actualEmbeddingCount,
    failureReason,
  });

  await updateDocumentSearchStatus(tenantId, generation.documentId.toString(), "FAILED");

  recordVerificationResult(getMetricRecorder(), { verified: "false", tenantId });

  return {
    verified: false,
    expectedChunkCount: generation.expectedChunkCount,
    actualChunkCount,
    expectedEmbeddingCount: generation.expectedEmbeddingCount,
    actualEmbeddingCount,
    failureReason,
  };
}

export async function activateGeneration(
  tenantId: string,
  generationId: string,
): Promise<void> {
  const generation = await findGenerationById(tenantId, generationId);
  if (!generation) throw new Error("Generation not found");

  if (generation.status !== "VERIFIED") {
    throw new Error(`Cannot activate generation in status ${generation.status}`);
  }

  await retireActiveGeneration(tenantId, generation.documentId.toString());

  await updateGenerationStatus(tenantId, generationId, {
    status: "ACTIVE",
    activatedAt: new Date(),
  });

  await DocumentModel.findOneAndUpdate(
    { _id: generation.documentId, tenantId: tenantId as unknown as import("mongoose").Types.ObjectId },
    {
      $set: {
        activeChunkGeneration: generationId as unknown as import("mongoose").Types.ObjectId,
        searchStatus: "READY",
        currentGeneration: null,
        pendingGeneration: null,
        lastSearchStatusChange: new Date(),
        lastProcessingError: null,
      },
    },
  );

  recordGenerationActivated(getMetricRecorder(), { tenantId });

  await getAuditWriter().write({
    tenantId,
    action: "INDEX_GENERATION_ACTIVATED",
    resourceType: "IndexGeneration",
    resourceId: generationId,
    metadata: {
      documentId: generation.documentId.toString(),
      generationNumber: generation.generationNumber,
    },
  });
}

export async function failGeneration(
  tenantId: string,
  generationId: string,
  stage: string,
  code: string,
  message: string,
): Promise<void> {
  await updateGenerationStatus(tenantId, generationId, {
    status: "FAILED",
    failureReason: { stage, code, message },
  });

  recordGenerationFailed(getMetricRecorder(), { stage, code, tenantId });

  await getAuditWriter().write({
    tenantId,
    action: "INDEX_GENERATION_FAILED",
    resourceType: "IndexGeneration",
    resourceId: generationId,
    metadata: { stage, code, message },
  });

  const generation = await findGenerationById(tenantId, generationId);
  if (generation) {
    await DocumentModel.findOneAndUpdate(
      { _id: generation.documentId, tenantId: tenantId as unknown as import("mongoose").Types.ObjectId },
      {
        $set: {
          searchStatus: "FAILED",
          lastSearchStatusChange: new Date(),
          lastProcessingError: { stage, code, message },
        },
      },
    );
  }
}

export async function rollbackGeneration(
  tenantId: string,
  generationId: string,
): Promise<void> {
  const generation = await findGenerationById(tenantId, generationId);
  if (!generation) return;

  await updateGenerationStatus(tenantId, generationId, {
    status: "FAILED",
    failureReason: { stage: "rollback", code: "ROLLBACK", message: "Generation rolled back" },
  });

  const activeGeneration = await findActiveGenerationByDocument(
    tenantId,
    generation.documentId.toString(),
  );

  const now = new Date();
  if (activeGeneration) {
    await DocumentModel.findOneAndUpdate(
      { _id: generation.documentId, tenantId: tenantId as unknown as import("mongoose").Types.ObjectId },
      {
        $set: {
          searchStatus: "READY",
          currentGeneration: null,
          lastSearchStatusChange: now,
          lastProcessingError: null,
        },
      },
    );
  } else {
    await DocumentModel.findOneAndUpdate(
      { _id: generation.documentId, tenantId: tenantId as unknown as import("mongoose").Types.ObjectId },
      {
        $set: {
          searchStatus: "NOT_INDEXED",
          currentGeneration: null,
          lastSearchStatusChange: now,
          lastProcessingError: null,
        },
      },
    );
  }

  recordGenerationRolledBack(getMetricRecorder(), { tenantId });

  await getAuditWriter().write({
    tenantId,
    action: "INDEX_GENERATION_ROLLBACK",
    resourceType: "IndexGeneration",
    resourceId: generationId,
    metadata: {
      documentId: generation.documentId.toString(),
      generationNumber: generation.generationNumber,
    },
  });
}

async function updateDocumentSearchStatus(
  tenantId: string,
  documentId: string,
  status: DocumentSearchStatus,
): Promise<void> {
  await DocumentModel.findOneAndUpdate(
    { _id: documentId, tenantId: tenantId as unknown as import("mongoose").Types.ObjectId },
    { $set: { searchStatus: status, lastSearchStatusChange: new Date() } },
  );
}

export function generateIdempotencyKey(
  documentVersion: number,
  stage: string,
  generationId: string,
): string {
  return createHash("sha256")
    .update(`${documentVersion}:${stage}:${generationId}`)
    .digest("hex");
}
