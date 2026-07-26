import { Types } from "mongoose";
import { randomUUID } from "node:crypto";
import { findArtifactByVersion, upsertArtifact } from "./extraction.repository.js";
import { getApiJobDispatcher } from "../jobs/jobDispatcher.js";
import DocumentModel from "../../db/models/document.model.js";
import DocumentVersionModel from "../../db/models/documentVersion.model.js";
import { AppError } from "../../common/errors/AppError.js";
import { DOCUMENT_NOT_FOUND } from "../../common/errors/errorCodes.js";
import type { ExtractionStatusView } from "./extraction.types.js";
import { getDocumentAccessAuthorizationService } from "../document-access/documentAccess.authorization.service.js";

export async function triggerExtraction(
  tenantId: string | Types.ObjectId,
  documentId: string | Types.ObjectId,
  actorId: string | Types.ObjectId,
  documentVersion: number,
): Promise<{ jobId: string; idempotencyKey: string }> {
  await getDocumentAccessAuthorizationService().authorizeDocumentAction(
    { tenantId: tenantId.toString(), actorId: actorId.toString() }, documentId.toString(), "reprocess",
  );
  const docId = new Types.ObjectId(documentId);
  const tenId = new Types.ObjectId(tenantId);
  const actId = new Types.ObjectId(actorId);

  // 1. Revalidate document and version existence
  const doc = await DocumentModel.findOne({ _id: docId, tenantId: tenId });
  if (!doc) {
    throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found or access denied");
  }

  const ver = await DocumentVersionModel.findOne({
    documentId: docId,
    version: documentVersion,
    tenantId: tenId,
  });
  if (!ver) {
    throw new AppError(404, "VERSION_NOT_FOUND", `Document version ${documentVersion} not found`);
  }

  // 2. Setup idempotency and enqueue the worker job
  const traceId = randomUUID();
  const idempotencyKey = `ext-${docId.toString()}-${documentVersion}-${ver.checksum}`;
  
  // Initialize extraction artifact state in DB as pending if not exists
  await upsertArtifact(tenId, docId, documentVersion, {
    sourceChecksum: ver.checksum,
    parserName: "pending",
    parserVersion: "pending",
    status: "pending",
  });

  const dispatcher = getApiJobDispatcher();
  const enqueueResult = await dispatcher.enqueue({
    jobType: "document.extract",
    tenantId: tenId.toString(),
    actorId: actId.toString(),
    traceId,
    idempotencyKey,
    payload: {
      documentId: docId.toString(),
      tenantId: tenId.toString(),
      documentVersion,
    },
  });

  if (!enqueueResult.ok) {
    throw new AppError(500, "EXTRACTION_QUEUE_FAILED", enqueueResult.error || "Failed to enqueue extraction job");
  }

  return {
    jobId: enqueueResult.jobId || "",
    idempotencyKey,
  };
}

export async function getExtractionStatus(
  tenantId: string | Types.ObjectId,
  documentId: string | Types.ObjectId,
  documentVersion: number,
  actorId: string | Types.ObjectId,
): Promise<ExtractionStatusView | null> {
  await getDocumentAccessAuthorizationService().authorizeDocumentAction(
    { tenantId: tenantId.toString(), actorId: actorId.toString() }, documentId.toString(), "read",
  );
  const artifact = await findArtifactByVersion(tenantId, documentId, documentVersion);
  if (!artifact) {
    return null;
  }

  return {
    documentId: artifact.documentId.toString(),
    tenantId: artifact.tenantId.toString(),
    documentVersion: artifact.documentVersion,
    status: artifact.status,
    pagesCount: artifact.pages.length,
    charactersCount: artifact.metadata.totalCharacters,
    warnings: artifact.metadata.warnings,
    hasImageOnlyPages: artifact.metadata.hasImageOnlyPages,
    failureReason: artifact.failureReason,
    failureCode: artifact.failureCode,
    durationMs: artifact.durationMs,
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  };
}
