import type { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { AppError } from "../../../common/errors/AppError.js";
import { DOCUMENT_NOT_FOUND } from "../../../common/errors/errorCodes.js";
import DocumentModel from "../../../db/models/document.model.js";
import type { DocumentDocument } from "../../../db/models/document.model.js";
import IndexGenerationModel, { type IndexGenerationDocument, type ChunkingConfigDocument } from "../../../db/models/indexGeneration.model.js";
import {
  startGeneration,
  rollbackGeneration,
  generateIdempotencyKey,
} from "./generation.service.js";
import { getApiJobDispatcher } from "../../jobs/jobDispatcher.js";
import { validateStartIndexInput } from "./indexing.validator.js";
import { startDocumentIndexing } from "./indexing.service.js";
import { requireAuthenticatedAuditActor } from "../../../common/observability/auditActor.js";
import { getAuditWriter } from "../../../common/observability/index.js";
import { randomUUID } from "node:crypto";
import { getDb } from "../../../db/connection.js";
import type { OperationAuthorizationContext } from "../../permissions/permissions.operation.js";
import { authorizeTenantOperation } from "../../permissions/permissions.operation.js";
import { Permission } from "../../permissions/permissions.catalog.js";

function operationContext(req: Request): OperationAuthorizationContext {
  const actor = requireAuthenticatedAuditActor({
    tenantId: req.tenantId,
    actorId: req.auth?.userId,
    actorEmail: req.auth?.email,
    actorRole: req.auth?.role,
  });
  return {
    tenantId: actor.tenantId,
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    traceId: req.traceId,
    requestId: req.requestId,
  };
}

async function authorizeIndexOperation(
  tenantId: string,
  context: OperationAuthorizationContext,
) {
  const actor = await authorizeTenantOperation(context, Permission.DOCUMENTS_UPDATE);
  if (tenantId !== actor.tenantId) {
    throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found or access denied");
  }
  return actor;
}

async function findDocument(tenantId: string, documentId: string): Promise<DocumentDocument> {
  const doc = await DocumentModel.findOne({
    _id: new Types.ObjectId(documentId),
    tenantId: new Types.ObjectId(tenantId),
  });
  if (!doc) {
    throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found or access denied");
  }
  return doc;
}

export async function startIndexController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.tenantId;
    if (!tenantId || !req.auth || !req.auth.userId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication context missing");
    }

    const documentId = req.params.id;
    if (typeof documentId !== "string") {
      throw new AppError(400, "BAD_REQUEST", "Invalid document ID parameter");
    }

    const actor = await authorizeIndexOperation(tenantId, operationContext(req));

    const result = await startDocumentIndexing({
      tenantId,
      actorId: actor.actorId,
      documentId,
      indexInput: req.body,
    });

    res.status(202).json({
      message: "Index generation started",
      generationId: result.generationId,
      generationNumber: result.generationNumber,
      status: result.status,
    });
  } catch (error) {
    next(error);
  }
}

export async function getIndexStatusController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.tenantId;
    if (!tenantId || !req.auth || !req.auth.userId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication context missing");
    }

    const documentId = req.params.id;
    if (typeof documentId !== "string") {
      throw new AppError(400, "BAD_REQUEST", "Invalid document ID parameter");
    }

    await findDocument(tenantId, documentId);

    const generation = await IndexGenerationModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      documentId: new Types.ObjectId(documentId),
    }).sort({ generationNumber: -1 }).limit(1);

    if (!generation) {
      throw new AppError(404, "GENERATION_NOT_FOUND", "No index generation found for this document");
    }

    res.json({
      success: true,
      data: {
        generationId: generation._id.toString(),
        documentId: generation.documentId.toString(),
        documentVersion: generation.documentVersion,
        generationNumber: generation.generationNumber,
        status: generation.status,
        expectedChunkCount: generation.expectedChunkCount,
        actualChunkCount: generation.actualChunkCount,
        expectedEmbeddingCount: generation.expectedEmbeddingCount,
        actualEmbeddingCount: generation.actualEmbeddingCount,
        atlasIndexName: generation.atlasIndexName,
        atlasIndexStatus: generation.atlasIndexStatus,
        triggeredBy: generation.triggeredBy,
        failureReason: generation.failureReason,
        activatedAt: generation.activatedAt?.toISOString() ?? null,
        createdAt: (generation as IndexGenerationDocument).createdAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function retryIndexController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.tenantId;
    if (!tenantId || !req.auth || !req.auth.userId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication context missing");
    }

    const documentId = req.params.id;
    if (typeof documentId !== "string") {
      throw new AppError(400, "BAD_REQUEST", "Invalid document ID parameter");
    }

    const actor = await authorizeIndexOperation(tenantId, operationContext(req));
    const doc = await findDocument(tenantId, documentId);

    const latestGeneration = await IndexGenerationModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      documentId: new Types.ObjectId(documentId),
    }).sort({ generationNumber: -1 }).limit(1);

    if (!latestGeneration) {
      throw new AppError(404, "GENERATION_NOT_FOUND", "No index generation found for this document");
    }

    if (latestGeneration.status !== "FAILED" && latestGeneration.status !== "VERIFYING") {
      throw new AppError(400, "INVALID_STATUS", `Cannot retry generation in status ${latestGeneration.status}`);
    }

    await rollbackGeneration(tenantId, latestGeneration._id.toString());

    // Clean up orphaned chunks and embeddings from the failed generation
    const db = getDb();
    if (db) {
      const oldGenerationId = new Types.ObjectId(latestGeneration._id.toString());
      const tenantObjectId = new Types.ObjectId(tenantId);
      await db.collection("chunkembeddings").deleteMany({ tenantId: tenantObjectId, generationId: oldGenerationId });
      await db.collection("documentchunks").deleteMany({ tenantId: tenantObjectId, generationId: oldGenerationId });
    }

    const generation = await startGeneration({
      tenantId,
      documentId: doc._id.toString(),
      documentVersion: doc.version,
      triggeredBy: latestGeneration.triggeredBy,
      chunkingConfig: latestGeneration.chunkingConfig as ChunkingConfigDocument,
      department: doc.department ?? null,
      classification: doc.classification ?? null,
    });

    const traceId = randomUUID();
    const dispatcher = getApiJobDispatcher();

    const chunkEnvelope = {
      jobType: "document.chunk" as const,
      tenantId,
      actorId: actor.actorId,
      traceId,
      idempotencyKey: generateIdempotencyKey(doc.version, "chunk", generation._id.toString()),
      payload: {
        documentId: doc._id.toString(),
        tenantId,
        documentVersion: doc.version,
        generationId: generation._id.toString(),
        department: doc.department ?? null,
        classification: doc.classification ?? null,
        chunkingConfig: latestGeneration.chunkingConfig as ChunkingConfigDocument,
      },
    };

    const embedEnvelope = {
      jobType: "document.embed" as const,
      tenantId,
      actorId: actor.actorId,
      traceId,
      idempotencyKey: generateIdempotencyKey(doc.version, "embed", generation._id.toString()),
      payload: {
        documentId: doc._id.toString(),
        tenantId,
        documentVersion: doc.version,
        generationId: generation._id.toString(),
      },
    };

    const indexEnvelope = {
      jobType: "document.index" as const,
      tenantId,
      actorId: actor.actorId,
      traceId,
      idempotencyKey: generateIdempotencyKey(doc.version, "index", generation._id.toString()),
      payload: {
        documentId: doc._id.toString(),
        tenantId,
        documentVersion: doc.version,
        generationId: generation._id.toString(),
      },
    };

    const flowResult = await dispatcher.enqueueFlow({
      ...indexEnvelope,
      children: [{
        ...embedEnvelope,
        children: [chunkEnvelope],
      }],
    });

    if (!flowResult.ok) {
      throw new AppError(500, "JOB_ENQUEUE_FAILED", flowResult.error ?? "Failed to enqueue pipeline");
    }

    res.status(202).json({
      message: "Index generation retry started",
      generationId: generation._id.toString(),
      generationNumber: generation.generationNumber,
      status: generation.status,
    });
  } catch (error) {
    next(error);
  }
}

export async function reindexController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.tenantId;
    if (!tenantId || !req.auth || !req.auth.userId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication context missing");
    }

    const documentId = req.params.id;
    if (typeof documentId !== "string") {
      throw new AppError(400, "BAD_REQUEST", "Invalid document ID parameter");
    }

    const actor = await authorizeIndexOperation(tenantId, operationContext(req));
    const doc = await findDocument(tenantId, documentId);

    const input = validateStartIndexInput({ ...req.body, triggeredBy: "REINDEX" });

    const generation = await startGeneration({
      tenantId,
      documentId: doc._id.toString(),
      documentVersion: doc.version,
      triggeredBy: "REINDEX",
      chunkingConfig: input.chunkingConfig,
      department: input.department,
      classification: input.classification,
    });

    const traceId = randomUUID();
    const dispatcher = getApiJobDispatcher();

    const chunkEnvelope = {
      jobType: "document.chunk" as const,
      tenantId,
      actorId: actor.actorId,
      traceId,
      idempotencyKey: generateIdempotencyKey(doc.version, "chunk", generation._id.toString()),
      payload: {
        documentId: doc._id.toString(),
        tenantId,
        documentVersion: doc.version,
        generationId: generation._id.toString(),
        department: input.department ?? null,
        classification: input.classification ?? null,
        chunkingConfig: input.chunkingConfig,
      },
    };

    const embedEnvelope = {
      jobType: "document.embed" as const,
      tenantId,
      actorId: actor.actorId,
      traceId,
      idempotencyKey: generateIdempotencyKey(doc.version, "embed", generation._id.toString()),
      payload: {
        documentId: doc._id.toString(),
        tenantId,
        documentVersion: doc.version,
        generationId: generation._id.toString(),
      },
    };

    const indexEnvelope = {
      jobType: "document.index" as const,
      tenantId,
      actorId: actor.actorId,
      traceId,
      idempotencyKey: generateIdempotencyKey(doc.version, "index", generation._id.toString()),
      payload: {
        documentId: doc._id.toString(),
        tenantId,
        documentVersion: doc.version,
        generationId: generation._id.toString(),
      },
    };

    const flowResult = await dispatcher.enqueueFlow({
      ...indexEnvelope,
      children: [{
        ...embedEnvelope,
        children: [chunkEnvelope],
      }],
    });

    if (!flowResult.ok) {
      throw new AppError(500, "JOB_ENQUEUE_FAILED", flowResult.error ?? "Failed to enqueue pipeline");
    }

    await getAuditWriter().write({
      tenantId,
      action: "INDEX_REINDEX_TRIGGERED",
      resourceType: "Document",
      resourceId: doc._id.toString(),
      metadata: {
        generationId: generation._id.toString(),
        generationNumber: generation.generationNumber,
        traceId,
      },
    });

    res.status(202).json({
      message: "Reindex generation started",
      generationId: generation._id.toString(),
      generationNumber: generation.generationNumber,
      status: generation.status,
    });
  } catch (error) {
    next(error);
  }
}

export async function getSearchStatusController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.tenantId;
    if (!tenantId || !req.auth || !req.auth.userId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication context missing");
    }

    const documentId = req.params.id;
    if (typeof documentId !== "string") {
      throw new AppError(400, "BAD_REQUEST", "Invalid document ID parameter");
    }

    const doc = await findDocument(tenantId, documentId);

    const latestGeneration = await IndexGenerationModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      documentId: new Types.ObjectId(documentId),
    }).sort({ generationNumber: -1 }).limit(1);

    res.json({
      success: true,
      data: {
        searchStatus: doc.searchStatus,
        activeChunkGeneration: doc.activeChunkGeneration?.toString() ?? null,
        latestGeneration: latestGeneration
          ? {
              generationId: latestGeneration._id.toString(),
              documentId: latestGeneration.documentId.toString(),
              documentVersion: latestGeneration.documentVersion,
              generationNumber: latestGeneration.generationNumber,
              status: latestGeneration.status,
              expectedChunkCount: latestGeneration.expectedChunkCount,
              actualChunkCount: latestGeneration.actualChunkCount,
              expectedEmbeddingCount: latestGeneration.expectedEmbeddingCount,
              actualEmbeddingCount: latestGeneration.actualEmbeddingCount,
              atlasIndexName: latestGeneration.atlasIndexName,
              atlasIndexStatus: latestGeneration.atlasIndexStatus,
              triggeredBy: latestGeneration.triggeredBy,
              failureReason: latestGeneration.failureReason,
              activatedAt: latestGeneration.activatedAt?.toISOString() ?? null,
              createdAt: (latestGeneration as IndexGenerationDocument).createdAt?.toISOString() ?? null,
            }
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
}
