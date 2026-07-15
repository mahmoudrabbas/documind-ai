import { AppError } from "../../common/errors/AppError.js";
import { NOT_FOUND } from "../../common/errors/errorCodes.js";
import { getAuditWriter } from "../../common/observability/index.js";
import { storageProvider } from "../../providers/storage/index.js";
import {
  createDocument,
  countDocumentsByTenant,
  findDocumentsByTenant,
  findDocumentByTenantAndId,
  updateDocumentByTenantAndId,
  deleteDocumentByTenantAndId,
} from "./documents.repository.js";
import {
  validateUploadDocumentInput,
  validateListDocumentsInput,
  validateUpdateDocumentMetadataInput,
} from "./documents.validator.js";
import type {
  DocumentPublicView,
  UploadDocumentResult,
  ListDocumentsResult,
  UpdateDocumentMetadataResult,
} from "./documents.types.js";
import type { DocumentDocument } from "../../db/models/document.model.js";

type MulterFile = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
  filename?: string;
};

function serializeDocument(doc: DocumentDocument): DocumentPublicView {
  const id = doc._id?.toString() ?? "";
  return {
    id,
    tenantId: doc.tenantId?.toString() ?? "",
    fileName: doc.fileName,
    fileSize: doc.fileSize,
    mimeType: doc.mimeType,
    status: doc.status,
    metadata: {
      title: doc.metadata?.title ?? null,
      description: doc.metadata?.description ?? null,
      tags: doc.metadata?.tags ?? [],
    },
    uploadedBy: doc.uploadedBy?.toString() ?? "",
    createdAt: doc.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: doc.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export async function uploadDocument(
  file: MulterFile,
  metadataInput: unknown,
  tenantId: string,
  userId: string,
): Promise<UploadDocumentResult> {
  if (!file) {
    throw new AppError(400, "BAD_REQUEST", "File is required");
  }

  const metadata = validateUploadDocumentInput(metadataInput);

  const storagePath = await storageProvider.saveFile(file.buffer, file.originalname, tenantId);

  let created: DocumentDocument;

  try {
    created = await createDocument({
      tenantId: tenantId as unknown as DocumentDocument["tenantId"],
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      storagePath,
      status: "uploaded",
      metadata: {
        title: metadata.title,
        description: metadata.description ?? "",
        tags: metadata.tags ?? [],
      },
      uploadedBy: userId as unknown as DocumentDocument["uploadedBy"],
    } as unknown as Omit<DocumentDocument, "_id" | "createdAt" | "updatedAt">);
  } catch (error) {
    await storageProvider.deleteFile(storagePath);
    throw error;
  }

  await getAuditWriter().write({
    tenantId,
    resourceType: "Document",
    resourceId: created._id.toString(),
    action: "DOCUMENT_UPLOADED",
    actorId: userId,
    actorEmail: "",
    actorRole: "",
    changes: {
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      title: metadata.title,
    },
  });

  return {
    document: serializeDocument(created),
  };
}

export async function listDocuments(
  input: unknown,
  tenantId: string,
): Promise<ListDocumentsResult> {
  const payload = validateListDocumentsInput(input);

  const filter: Record<string, unknown> = {};
  if (payload.status) {
    filter.status = payload.status;
  }

  const [totalRecords, documents] = await Promise.all([
    countDocumentsByTenant(tenantId, filter),
    findDocumentsByTenant(tenantId, payload.page, payload.pageSize, filter),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalRecords / payload.pageSize));

  return {
    documents: documents.map(serializeDocument),
    pagination: {
      page: payload.page,
      pageSize: payload.pageSize,
      totalPages,
      totalRecords,
    },
  };
}

export async function getDocument(
  documentId: string,
  tenantId: string,
): Promise<UploadDocumentResult> {
  const document = await findDocumentByTenantAndId(tenantId, documentId);

  if (!document) {
    throw new AppError(404, NOT_FOUND, "Document not found");
  }

  return {
    document: serializeDocument(document),
  };
}

export async function updateDocumentMetadata(
  documentId: string,
  input: unknown,
  tenantId: string,
  userId: string,
): Promise<UpdateDocumentMetadataResult> {
  const payload = validateUpdateDocumentMetadataInput(input);

  const existing = await findDocumentByTenantAndId(tenantId, documentId);

  if (!existing) {
    throw new AppError(404, NOT_FOUND, "Document not found");
  }

  const update: Record<string, unknown> = {};
  if (payload.title !== undefined) {
    update["metadata.title"] = payload.title;
  }
  if (payload.description !== undefined) {
    update["metadata.description"] = payload.description;
  }
  if (payload.tags !== undefined) {
    update["metadata.tags"] = payload.tags;
  }

  await updateDocumentByTenantAndId(tenantId, documentId, update as Partial<DocumentDocument>);

  const updated = await findDocumentByTenantAndId(tenantId, documentId);

  if (!updated) {
    throw new AppError(404, NOT_FOUND, "Document not found");
  }

  await getAuditWriter().write({
    tenantId,
    resourceType: "Document",
    resourceId: documentId,
    action: "DOCUMENT_METADATA_UPDATED",
    actorId: userId,
    actorEmail: "",
    actorRole: "",
    changes: {
      before: {
        title: existing.metadata?.title ?? null,
        description: existing.metadata?.description ?? null,
        tags: existing.metadata?.tags ?? [],
      },
      after: {
        title: payload.title ?? existing.metadata?.title ?? null,
        description: payload.description ?? existing.metadata?.description ?? null,
        tags: payload.tags ?? existing.metadata?.tags ?? [],
      },
    },
  });

  return {
    document: serializeDocument(updated),
  };
}

export async function deleteDocument(
  documentId: string,
  tenantId: string,
  userId: string,
): Promise<void> {
  const document = await findDocumentByTenantAndId(tenantId, documentId);

  if (!document) {
    throw new AppError(404, NOT_FOUND, "Document not found");
  }

  await storageProvider.deleteFile(document.storagePath);
  await deleteDocumentByTenantAndId(tenantId, documentId);

  await getAuditWriter().write({
    tenantId,
    resourceType: "Document",
    resourceId: documentId,
    action: "DOCUMENT_DELETED",
    actorId: userId,
    actorEmail: "",
    actorRole: "",
    changes: {
      fileName: document.fileName,
      fileSize: document.fileSize,
      mimeType: document.mimeType,
    },
  });
}
