import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import {
  uploadDocument,
  listDocuments,
  getDocument,
  updateDocumentMetadata,
  deleteDocument,
} from "./documents.service.js";

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

export async function uploadDocumentController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth || !req.tenantId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }

    const file = req.file as Express.Multer.File | undefined;

    if (!file) {
      throw new AppError(400, "BAD_REQUEST", "File is required");
    }

    const result = await uploadDocument(
      {
        fieldname: file.fieldname,
        originalname: file.originalname,
        encoding: file.encoding,
        mimetype: file.mimetype,
        buffer: file.buffer,
        size: file.size,
      },
      req.body,
      req.tenantId,
      req.auth.userId,
    );

    res.status(201).json({
      success: true,
      message: "Document uploaded successfully",
      data: result,
    });
  } catch (error) {
    handleDocumentError(error, res, next);
  }
}

export async function listDocumentsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth || !req.tenantId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }

    const result = await listDocuments(req.query, req.tenantId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    handleDocumentError(error, res, next);
  }
}

export async function getDocumentController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth || !req.tenantId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }

    const documentId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    if (!documentId) {
      throw new AppError(400, "BAD_REQUEST", "Missing document id parameter");
    }

    const result = await getDocument(documentId, req.tenantId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    handleDocumentError(error, res, next);
  }
}

export async function updateDocumentMetadataController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth || !req.tenantId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }

    const documentId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    if (!documentId) {
      throw new AppError(400, "BAD_REQUEST", "Missing document id parameter");
    }

    const result = await updateDocumentMetadata(
      documentId,
      req.body,
      req.tenantId,
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    handleDocumentError(error, res, next);
  }
}

export async function deleteDocumentController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth || !req.tenantId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }

    const documentId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    if (!documentId) {
      throw new AppError(400, "BAD_REQUEST", "Missing document id parameter");
    }

    await deleteDocument(documentId, req.tenantId);

    res.status(200).json({
      success: true,
      message: "Document deleted successfully",
    });
  } catch (error) {
    handleDocumentError(error, res, next);
  }
}
