import type { Request, Response, NextFunction } from "express";
import { triggerExtraction, getExtractionStatus } from "./extraction.service.js";
import DocumentModel from "../../db/models/document.model.js";
import { AppError } from "../../common/errors/AppError.js";
import { DOCUMENT_NOT_FOUND } from "../../common/errors/errorCodes.js";
import { Types } from "mongoose";

export async function getDocumentExtractionStatusController(
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

    // 1. Fetch document to resolve latest version if not specified in query
    const doc = await DocumentModel.findOne({ 
      _id: new Types.ObjectId(documentId), 
      tenantId: new Types.ObjectId(tenantId) 
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

    // 2. Fetch the extraction artifact status
    const status = await getExtractionStatus(tenantId, documentId, version, auth.userId);
    if (!status) {
      // If it doesn't exist yet, return a safe pending view indicating it hasn't started
      res.json({
        documentId,
        tenantId,
        documentVersion: version,
        status: "pending",
        pagesCount: 0,
        charactersCount: 0,
        warnings: [],
        hasImageOnlyPages: false,
        failureReason: null,
        failureCode: null,
        durationMs: null,
        createdAt: null,
        updatedAt: null,
      });
      return;
    }

    res.json(status);
  } catch (error) {
    next(error);
  }
}

export async function retriggerDocumentExtractionController(
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

    // 1. Fetch document to resolve latest version if not specified in request body/query
    const doc = await DocumentModel.findOne({ 
      _id: new Types.ObjectId(documentId), 
      tenantId: new Types.ObjectId(tenantId) 
    });
    if (!doc) {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found or access denied");
    }

    const versionVal = req.body?.version || req.query?.version;
    let version = doc.version;

    if (versionVal) {
      const parsed = parseInt(Array.isArray(versionVal) ? String(versionVal[0]) : String(versionVal), 10);
      if (isNaN(parsed)) {
        throw new AppError(400, "INVALID_VERSION", "Version parameter must be a valid integer");
      }
      version = parsed;
    }

    // 2. Trigger the job
    const result = await triggerExtraction(tenantId, documentId, auth.userId, version);

    res.status(202).json({
      message: "Document extraction job queued successfully",
      ...result,
    });
  } catch (error) {
    next(error);
  }
}
