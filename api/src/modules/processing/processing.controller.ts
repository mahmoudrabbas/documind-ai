import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../common/errors/AppError.js";
import { DOCUMENT_NOT_FOUND } from "../../common/errors/errorCodes.js";
import { Types } from "mongoose";
import DocumentModel from "../../db/models/document.model.js";
import {
  triggerOcrProcessing,
  getOcrPageResults,
  getDocumentQuality,
  assessDocumentQuality,
  reviewDocumentQuality,
  retryOcrPages,
  getOcrUsageSummary,
  triggerMetadataAnalysis,
  getMetadataCandidates,
  reviewMetadataCandidate,
  triggerVersionConflictAnalysis,
  getDocumentRelationships,
  approveDocumentRelationship,
  rejectDocumentRelationship,
  getConflictFindings,
  resolveConflictFinding,
  dismissConflictFinding,
  getPendingReviewItems,
} from "./processing.service.js";
import { validateTriggerOcrInput, validateReviewQualityInput, validateRetryOcrInput, validateReviewCandidateInput, validateResolveConflictInput } from "./processing.validator.js";
import { requireAuthenticatedAuditActor } from "../../common/observability/auditActor.js";
import type { OperationAuthorizationContext } from "../permissions/permissions.operation.js";

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

export async function triggerOcrController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.tenantId;
    const auth = req.auth;

    if (!tenantId || !auth || !auth.userId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication context missing");
    }

    const input = validateTriggerOcrInput(req.body);
    const documentId = req.params.id;

    if (typeof documentId !== "string") {
      throw new AppError(400, "BAD_REQUEST", "Invalid document ID parameter");
    }

    const doc = await DocumentModel.findOne({
      _id: new Types.ObjectId(documentId),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!doc) {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found or access denied");
    }

    const result = await triggerOcrProcessing(
      tenantId,
      { ...input, documentId },
      operationContext(req),
    );

    res.status(202).json({
      message: "OCR processing job queued successfully",
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getOcrPageResultsController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.tenantId;
    const documentId = req.params.id;
    const auth = req.auth;

    if (!tenantId || !auth || !auth.userId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication context missing");
    }

    if (typeof documentId !== "string") {
      throw new AppError(400, "BAD_REQUEST", "Invalid document ID parameter");
    }

    const doc = await DocumentModel.findOne({
      _id: new Types.ObjectId(documentId),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!doc) {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found or access denied");
    }

    const versionQuery = req.query.version;
    let version = doc.version;

    if (versionQuery) {
      const parsed = parseInt(Array.isArray(versionQuery) ? String(versionQuery[0]) : String(versionQuery), 10);
      if (isNaN(parsed)) {
        throw new AppError(400, "INVALID_VERSION", "Version parameter must be a valid integer");
      }
      version = parsed;
    }

    const pages = await getOcrPageResults(
      tenantId,
      documentId,
      version,
      operationContext(req),
    );

    res.json({
      success: true,
      data: { pages },
    });
  } catch (error) {
    next(error);
  }
}

export async function getDocumentQualityController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.tenantId;
    const documentId = req.params.id;
    const auth = req.auth;

    if (!tenantId || !auth || !auth.userId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication context missing");
    }

    if (typeof documentId !== "string") {
      throw new AppError(400, "BAD_REQUEST", "Invalid document ID parameter");
    }

    const doc = await DocumentModel.findOne({
      _id: new Types.ObjectId(documentId),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!doc) {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found or access denied");
    }

    const versionQuery = req.query.version;
    let version = doc.version;

    if (versionQuery) {
      const parsed = parseInt(Array.isArray(versionQuery) ? String(versionQuery[0]) : String(versionQuery), 10);
      if (isNaN(parsed)) {
        throw new AppError(400, "INVALID_VERSION", "Version parameter must be a valid integer");
      }
      version = parsed;
    }

    const quality = await getDocumentQuality(
      tenantId,
      documentId,
      version,
      operationContext(req),
    );

    if (!quality) {
      res.json({
        success: true,
        data: null,
      });
      return;
    }

    res.json({
      success: true,
      data: quality,
    });
  } catch (error) {
    next(error);
  }
}

export async function assessDocumentQualityController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.tenantId;
    const documentId = req.params.id;
    const auth = req.auth;

    if (!tenantId || !auth || !auth.userId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication context missing");
    }

    if (typeof documentId !== "string") {
      throw new AppError(400, "BAD_REQUEST", "Invalid document ID parameter");
    }

    const doc = await DocumentModel.findOne({
      _id: new Types.ObjectId(documentId),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!doc) {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found or access denied");
    }

    const versionQuery = req.query.version;
    let version = doc.version;

    if (versionQuery) {
      const parsed = parseInt(Array.isArray(versionQuery) ? String(versionQuery[0]) : String(versionQuery), 10);
      if (isNaN(parsed)) {
        throw new AppError(400, "INVALID_VERSION", "Version parameter must be a valid integer");
      }
      version = parsed;
    }

    const quality = await assessDocumentQuality(
      tenantId,
      documentId,
      version,
      operationContext(req),
    );

    res.json({
      success: true,
      data: quality,
    });
  } catch (error) {
    next(error);
  }
}

export async function reviewDocumentQualityController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.tenantId;
    const documentId = req.params.id;
    const auth = req.auth;

    if (!tenantId || !auth || !auth.userId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication context missing");
    }

    if (typeof documentId !== "string") {
      throw new AppError(400, "BAD_REQUEST", "Invalid document ID parameter");
    }

    const input = validateReviewQualityInput(req.body);

    const doc = await DocumentModel.findOne({
      _id: new Types.ObjectId(documentId),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!doc) {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found or access denied");
    }

    const versionQuery = req.query.version;
    let version = doc.version;

    if (versionQuery) {
      const parsed = parseInt(Array.isArray(versionQuery) ? String(versionQuery[0]) : String(versionQuery), 10);
      if (isNaN(parsed)) {
        throw new AppError(400, "INVALID_VERSION", "Version parameter must be a valid integer");
      }
      version = parsed;
    }

    const quality = await reviewDocumentQuality(
      tenantId,
      documentId,
      version,
      input,
      operationContext(req),
    );

    res.json({
      success: true,
      data: quality,
    });
  } catch (error) {
    next(error);
  }
}

export async function retryOcrController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.tenantId;
    const documentId = req.params.id;
    const auth = req.auth;

    if (!tenantId || !auth || !auth.userId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication context missing");
    }

    if (typeof documentId !== "string") {
      throw new AppError(400, "BAD_REQUEST", "Invalid document ID parameter");
    }

    const input = validateRetryOcrInput(req.body);

    const doc = await DocumentModel.findOne({
      _id: new Types.ObjectId(documentId),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!doc) {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found or access denied");
    }

    const versionQuery = req.body?.version || req.query?.version;
    let version = doc.version;

    if (versionQuery) {
      const parsed = parseInt(Array.isArray(versionQuery) ? String(versionQuery[0]) : String(versionQuery), 10);
      if (isNaN(parsed)) {
        throw new AppError(400, "INVALID_VERSION", "Version parameter must be a valid integer");
      }
      version = parsed;
    }

    const result = await retryOcrPages(
      tenantId,
      documentId,
      version,
      input,
      operationContext(req),
    );

    res.status(202).json({
      message: "OCR retry job queued successfully",
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getOcrUsageSummaryController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.tenantId;
    const auth = req.auth;

    if (!tenantId || !auth || !auth.userId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication context missing");
    }

    const summary = await getOcrUsageSummary(tenantId, operationContext(req));

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    next(error);
  }
}

export async function triggerMetadataAnalysisController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.tenantId;
    const documentId = req.params.id;
    const auth = req.auth;

    if (!tenantId || !auth || !auth.userId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication context missing");
    }

    if (typeof documentId !== "string") {
      throw new AppError(400, "BAD_REQUEST", "Invalid document ID parameter");
    }

    const doc = await DocumentModel.findOne({
      _id: new Types.ObjectId(documentId),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!doc) {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found or access denied");
    }

    const version = req.body?.version || doc.version;

    const result = await triggerMetadataAnalysis(
      tenantId,
      { documentId, version },
      operationContext(req),
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getMetadataCandidatesController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.tenantId;
    const documentId = req.params.id;
    const auth = req.auth;

    if (!tenantId || !auth || !auth.userId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication context missing");
    }

    if (typeof documentId !== "string") {
      throw new AppError(400, "BAD_REQUEST", "Invalid document ID parameter");
    }

    const candidates = await getMetadataCandidates(
      tenantId,
      documentId,
      operationContext(req),
    );

    res.json({
      success: true,
      data: candidates,
    });
  } catch (error) {
    next(error);
  }
}

export async function reviewMetadataCandidateController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.tenantId;
    const candidateId = req.params.candidateId;
    const auth = req.auth;

    if (!tenantId || !auth || !auth.userId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication context missing");
    }

    if (typeof candidateId !== "string") {
      throw new AppError(400, "BAD_REQUEST", "Invalid candidate ID parameter");
    }

    const input = validateReviewCandidateInput(req.body);

    const result = await reviewMetadataCandidate(
      tenantId,
      candidateId,
      input,
      operationContext(req),
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function triggerVersionConflictAnalysisController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.tenantId;
    const documentId = req.params.id;
    const auth = req.auth;

    if (!tenantId || !auth || !auth.userId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication context missing");
    }

    if (typeof documentId !== "string") {
      throw new AppError(400, "BAD_REQUEST", "Invalid document ID parameter");
    }

    const doc = await DocumentModel.findOne({
      _id: new Types.ObjectId(documentId),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!doc) {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found or access denied");
    }

    const candidateDocumentIds = req.body?.candidateDocumentIds;

    const result = await triggerVersionConflictAnalysis(
      tenantId,
      { documentId, candidateDocumentIds },
      operationContext(req),
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getDocumentRelationshipsController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.tenantId;
    const documentId = req.params.id;
    const auth = req.auth;

    if (!tenantId || !auth || !auth.userId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication context missing");
    }

    if (typeof documentId !== "string") {
      throw new AppError(400, "BAD_REQUEST", "Invalid document ID parameter");
    }

    const relationships = await getDocumentRelationships(
      tenantId,
      documentId,
      operationContext(req),
    );

    res.json({
      success: true,
      data: relationships,
    });
  } catch (error) {
    next(error);
  }
}

export async function approveDocumentRelationshipController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.tenantId;
    const relationshipId = req.params.relationshipId;
    const auth = req.auth;

    if (!tenantId || !auth || !auth.userId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication context missing");
    }

    if (typeof relationshipId !== "string") {
      throw new AppError(400, "BAD_REQUEST", "Invalid relationship ID parameter");
    }

    const result = await approveDocumentRelationship(
      tenantId,
      relationshipId,
      operationContext(req),
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function rejectDocumentRelationshipController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.tenantId;
    const relationshipId = req.params.relationshipId;
    const auth = req.auth;

    if (!tenantId || !auth || !auth.userId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication context missing");
    }

    if (typeof relationshipId !== "string") {
      throw new AppError(400, "BAD_REQUEST", "Invalid relationship ID parameter");
    }

    const { reason } = req.body as { reason?: string };

    const result = await rejectDocumentRelationship(
      tenantId,
      relationshipId,
      reason || "Rejected by reviewer",
      operationContext(req),
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getConflictFindingsController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.tenantId;
    const documentId = req.params.id;
    const auth = req.auth;

    if (!tenantId || !auth || !auth.userId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication context missing");
    }

    if (typeof documentId !== "string") {
      throw new AppError(400, "BAD_REQUEST", "Invalid document ID parameter");
    }

    const conflicts = await getConflictFindings(
      tenantId,
      documentId,
      operationContext(req),
    );

    res.json({
      success: true,
      data: conflicts,
    });
  } catch (error) {
    next(error);
  }
}

export async function resolveConflictFindingController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.tenantId;
    const conflictId = req.params.conflictId;
    const auth = req.auth;

    if (!tenantId || !auth || !auth.userId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication context missing");
    }

    if (typeof conflictId !== "string") {
      throw new AppError(400, "BAD_REQUEST", "Invalid conflict ID parameter");
    }

    const input = validateResolveConflictInput(req.body);

    const result = await resolveConflictFinding(
      tenantId,
      conflictId,
      input,
      operationContext(req),
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function dismissConflictFindingController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.tenantId;
    const conflictId = req.params.conflictId;
    const auth = req.auth;

    if (!tenantId || !auth || !auth.userId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication context missing");
    }

    if (typeof conflictId !== "string") {
      throw new AppError(400, "BAD_REQUEST", "Invalid conflict ID parameter");
    }

    const { reason } = req.body as { reason?: string };

    const result = await dismissConflictFinding(
      tenantId,
      conflictId,
      reason || "Dismissed by reviewer",
      operationContext(req),
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getPendingReviewItemsController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.tenantId;
    const auth = req.auth;

    if (!tenantId || !auth || !auth.userId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication context missing");
    }

    const items = await getPendingReviewItems(tenantId, operationContext(req));

    res.json({
      success: true,
      data: items,
    });
  } catch (error) {
    next(error);
  }
}
