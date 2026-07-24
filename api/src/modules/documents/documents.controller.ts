import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import { isBaseRole } from "../../common/auth/baseRoles.js";
import {
  storageProvider,
} from "../../providers/storage/index.js";
import { LocalFileSignatureScanner } from "../../providers/security-scanner/index.js";
import { FakeEntitlementChecker } from "../../providers/entitlements/index.js";
import { StubProcessingDispatcher, RealProcessingDispatcher } from "../../providers/processing/index.js";
import { createDocumentServiceProviders } from "./documents.service.js";

const service = createDocumentServiceProviders({
  storageProvider,
  securityScanner: new LocalFileSignatureScanner(),
  entitlementChecker: new FakeEntitlementChecker(),
  processingDispatcher: process.env.NODE_ENV === "test"
    ? new StubProcessingDispatcher()
    : new RealProcessingDispatcher(),
});

function handleDocumentError(error: unknown, res: Response, next: NextFunction) {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      error: error.code,
      details: error.details ?? null,
    });
    return;
  }
  next(error);
}

function requireAuthRole(req: Request) {
  if (!req.auth || !isBaseRole(req.auth.role)) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  return req.auth.role;
}

export async function uploadDocumentController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth || !req.tenantId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }
    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      throw new AppError(400, "BAD_REQUEST", "File is required");
    }
    const result = await service.uploadDocument(
      { fieldname: file.fieldname, originalname: file.originalname, encoding: file.encoding,
        mimetype: file.mimetype, buffer: file.buffer, size: file.size },
      req.body,
      req.tenantId,
      { userId: req.auth.userId, email: req.auth.email, role: requireAuthRole(req) },
    );
    res.status(201).json({ success: true, message: "Document uploaded successfully", data: result });
  } catch (error) { handleDocumentError(error, res, next); }
}

export async function listDocumentsController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth || !req.tenantId) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    const result = await service.listDocuments(req.query, req.tenantId, { userId: req.auth.userId, email: req.auth.email, role: requireAuthRole(req) });
    res.status(200).json({ success: true, data: result });
  } catch (error) { handleDocumentError(error, res, next); }
}

export async function getDocumentController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth || !req.tenantId) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    const documentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!documentId) throw new AppError(400, "BAD_REQUEST", "Missing document id parameter");
    const result = await service.getDocument(documentId, req.tenantId, { userId: req.auth.userId, email: req.auth.email, role: requireAuthRole(req) });
    res.status(200).json({ success: true, data: result });
  } catch (error) { handleDocumentError(error, res, next); }
}

export async function updateDocumentMetadataController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth || !req.tenantId) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    const documentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!documentId) throw new AppError(400, "BAD_REQUEST", "Missing document id parameter");
    const result = await service.updateDocumentMetadata(
      documentId,
      req.body,
      req.tenantId,
      { userId: req.auth.userId, email: req.auth.email, role: requireAuthRole(req) },
    );
    res.status(200).json({ success: true, data: result });
  } catch (error) { handleDocumentError(error, res, next); }
}

export async function downloadDocumentController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth || !req.tenantId) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    const documentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!documentId) throw new AppError(400, "BAD_REQUEST", "Missing document id parameter");
    const { stream, contentType, fileName, fileSize } =
      await service.downloadDocument(documentId, req.tenantId, {
        userId: req.auth.userId,
        email: req.auth.email,
        role: requireAuthRole(req),
      });

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", fileSize);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");

    stream.pipe(res);
  } catch (error) { handleDocumentError(error, res, next); }
}

export async function replaceDocumentController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth || !req.tenantId) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    const documentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!documentId) throw new AppError(400, "BAD_REQUEST", "Missing document id parameter");
    const file = req.file as Express.Multer.File | undefined;
    if (!file) throw new AppError(400, "BAD_REQUEST", "File is required for replacement");
    const result = await service.replaceDocument(
      documentId,
      { fieldname: file.fieldname, originalname: file.originalname, encoding: file.encoding,
        mimetype: file.mimetype, buffer: file.buffer, size: file.size },
      req.body,
      req.tenantId,
      { userId: req.auth.userId, email: req.auth.email, role: requireAuthRole(req) },
    );
    res.status(200).json({ success: true, message: "Document replaced successfully", data: result });
  } catch (error) { handleDocumentError(error, res, next); }
}

export async function archiveDocumentController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth || !req.tenantId) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    const documentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!documentId) throw new AppError(400, "BAD_REQUEST", "Missing document id parameter");
    const result = await service.archiveDocument(documentId, req.tenantId, {
      userId: req.auth.userId,
      email: req.auth.email,
      role: requireAuthRole(req),
    });
    res.status(200).json({ success: true, message: "Document archived successfully", data: result });
  } catch (error) { handleDocumentError(error, res, next); }
}

export async function restoreDocumentController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth || !req.tenantId) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    const documentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!documentId) throw new AppError(400, "BAD_REQUEST", "Missing document id parameter");
    const result = await service.restoreDocument(documentId, req.tenantId, {
      userId: req.auth.userId,
      email: req.auth.email,
      role: requireAuthRole(req),
    });
    res.status(200).json({ success: true, message: "Document restored successfully", data: result });
  } catch (error) { handleDocumentError(error, res, next); }
}

export async function softDeleteDocumentController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth || !req.tenantId) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    const documentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!documentId) throw new AppError(400, "BAD_REQUEST", "Missing document id parameter");
    await service.softDeleteDocument(documentId, req.tenantId, {
      userId: req.auth.userId,
      email: req.auth.email,
      role: requireAuthRole(req),
    });
    res.status(200).json({ success: true, message: "Document moved to trash" });
  } catch (error) { handleDocumentError(error, res, next); }
}

export async function permanentDeleteDocumentController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth || !req.tenantId) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    const documentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!documentId) throw new AppError(400, "BAD_REQUEST", "Missing document id parameter");
    await service.permanentDeleteDocument(documentId, req.tenantId, {
      userId: req.auth.userId,
      email: req.auth.email,
      role: requireAuthRole(req),
    });
    res.status(200).json({ success: true, message: "Document permanently deleted" });
  } catch (error) { handleDocumentError(error, res, next); }
}

export async function listDocumentVersionsController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth || !req.tenantId) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    const documentId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!documentId) throw new AppError(400, "BAD_REQUEST", "Missing document id parameter");
    const result = await service.listVersions(documentId, req.tenantId, { userId: req.auth.userId, email: req.auth.email, role: requireAuthRole(req) });
    res.status(200).json({ success: true, data: result });
  } catch (error) { handleDocumentError(error, res, next); }
}
