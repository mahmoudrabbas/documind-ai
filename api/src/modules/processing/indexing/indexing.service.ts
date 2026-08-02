import { Types } from "mongoose";
import { AppError } from "../../../common/errors/AppError.js";
import { DOCUMENT_NOT_FOUND } from "../../../common/errors/errorCodes.js";
import DocumentModel from "../../../db/models/document.model.js";
import { getApiJobDispatcher } from "../../jobs/jobDispatcher.js";
import { getAuditWriter } from "../../../common/observability/index.js";
import { randomUUID } from "node:crypto";
import { startGeneration, generateIdempotencyKey } from "./generation.service.js";
import { validateStartIndexInput } from "./indexing.validator.js";

export interface StartIndexingResult {
  generationId: string;
  generationNumber: number;
  status: string;
  traceId: string;
}

/**
 * Starts an index generation for a document and enqueues the chunk → embed →
 * index job flow. Shared by the HTTP controller and the copilot tool so both
 * paths behave identically. Callers are responsible for authorization.
 */
export async function startDocumentIndexing(input: {
  tenantId: string;
  actorId: string;
  documentId: string;
  indexInput: unknown;
}): Promise<StartIndexingResult> {
  const doc = await DocumentModel.findOne({
    _id: new Types.ObjectId(input.documentId),
    tenantId: new Types.ObjectId(input.tenantId),
  });
  if (!doc) {
    throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found or access denied");
  }

  const parsedInput = validateStartIndexInput(input.indexInput);

  const generation = await startGeneration({
    tenantId: input.tenantId,
    documentId: doc._id.toString(),
    documentVersion: doc.version,
    triggeredBy: parsedInput.triggeredBy,
    chunkingConfig: parsedInput.chunkingConfig,
    department: parsedInput.department,
    classification: parsedInput.classification,
  });

  const traceId = randomUUID();
  const dispatcher = getApiJobDispatcher();

  const chunkEnvelope = {
    jobType: "document.chunk" as const,
    tenantId: input.tenantId,
    actorId: input.actorId,
    traceId,
    idempotencyKey: generateIdempotencyKey(doc.version, "chunk", generation._id.toString()),
    payload: {
      documentId: doc._id.toString(),
      tenantId: input.tenantId,
      documentVersion: doc.version,
      generationId: generation._id.toString(),
      department: parsedInput.department ?? null,
      classification: parsedInput.classification ?? null,
      chunkingConfig: parsedInput.chunkingConfig,
    },
  };

  const embedEnvelope = {
    jobType: "document.embed" as const,
    tenantId: input.tenantId,
    actorId: input.actorId,
    traceId,
    idempotencyKey: generateIdempotencyKey(doc.version, "embed", generation._id.toString()),
    payload: {
      documentId: doc._id.toString(),
      tenantId: input.tenantId,
      documentVersion: doc.version,
      generationId: generation._id.toString(),
    },
  };

  const indexEnvelope = {
    jobType: "document.index" as const,
    tenantId: input.tenantId,
    actorId: input.actorId,
    traceId,
    idempotencyKey: generateIdempotencyKey(doc.version, "index", generation._id.toString()),
    payload: {
      documentId: doc._id.toString(),
      tenantId: input.tenantId,
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
    tenantId: input.tenantId,
    action: "INDEX_GENERATION_STARTED",
    resourceType: "Document",
    resourceId: doc._id.toString(),
    actorId: input.actorId,
    actorKind: "USER",
    metadata: {
      generationId: generation._id.toString(),
      generationNumber: generation.generationNumber,
      triggeredBy: parsedInput.triggeredBy,
      traceId,
    },
  });

  return {
    generationId: generation._id.toString(),
    generationNumber: generation.generationNumber,
    status: generation.status,
    traceId,
  };
}
