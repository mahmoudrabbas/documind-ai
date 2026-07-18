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
} from "./processing.service.js";
import { validateTriggerOcrInput, validateReviewQualityInput, validateRetryOcrInput } from "./processing.validator.js";

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

    const result = await triggerOcrProcessing(tenantId, { ...input, documentId }, auth.userId);

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

    const pages = await getOcrPageResults(tenantId, documentId, version);

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

    const quality = await getDocumentQuality(tenantId, documentId, version);

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

    const quality = await assessDocumentQuality(tenantId, documentId, version);

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

    const quality = await reviewDocumentQuality(tenantId, documentId, version, input, auth.userId);

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

    const result = await retryOcrPages(tenantId, documentId, version, input, auth.userId);

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

    const summary = await getOcrUsageSummary(tenantId);

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    next(error);
  }
}
