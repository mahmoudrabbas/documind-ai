import { createHash } from "node:crypto";
import { AppError } from "../../common/errors/AppError.js";
import {
  DOCUMENT_NOT_FOUND,
  DOCUMENT_QUARANTINED,
  DOCUMENT_ALREADY_ARCHIVED,
  DOCUMENT_NOT_ARCHIVED,
  DOCUMENT_NOT_SOFT_DELETED,
  FILE_ZERO_BYTES,
} from "../../common/errors/errorCodes.js";
import { getAuditWriter } from "../../common/observability/index.js";
import type {
  StorageProvider,
  SecurityScanner,
  EntitlementChecker,
  ProcessingDispatcher,
} from "../../providers/storage/types.js";
import {
  createDocument,
  countDocumentsByTenant,
  findDocumentsByTenant,
  findDocumentByTenantAndId,
  updateDocumentByTenantAndId,
  deleteDocumentByTenantAndId,
  findDocumentByChecksum,
} from "./documents.repository.js";
import {
  createVersion,
  findVersionsByDocument,
} from "./documentVersion.repository.js";
import {
  validateUploadDocumentInput,
  validateListDocumentsInput,
  validateUpdateDocumentMetadataInput,
  validateReplaceDocumentInput,
} from "./documents.validator.js";
import type {
  DocumentPublicView,
  DocumentVersionView,
  UploadDocumentResult,
  ListDocumentsResult,
  UpdateDocumentMetadataResult,
  ReplaceDocumentResult,
  ArchiveDocumentResult,
  ListVersionsResult,
} from "./documents.types.js";
import type { DocumentDocument, DocumentClassification, DocumentQuarantineStatus } from "../../db/models/document.model.js";
import type { DocumentVersionDocument } from "../../db/models/documentVersion.model.js";

type MulterFile = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
  filename?: string;
};

function computeChecksum(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\]/g, "_")
    .replace(/\.\./g, "_")
    // eslint-disable-next-line no-control-regex
    .replace(/\x00/g, "")
    .replace(/^\.+$/, "_")
    .slice(0, 255);
}

function serializeDocument(doc: DocumentDocument): DocumentPublicView {
  const id = doc._id?.toString() ?? "";
  return {
    id,
    tenantId: doc.tenantId?.toString() ?? "",
    fileName: doc.fileName,
    originalFileName: (doc as unknown as { originalFileName?: string }).originalFileName ?? doc.fileName,
    fileSize: doc.fileSize,
    mimeType: doc.mimeType,
    status: doc.status,
    metadata: {
      title: doc.metadata?.title ?? null,
      description: doc.metadata?.description ?? null,
      tags: doc.metadata?.tags ?? [],
    },
    category: (doc as unknown as { category?: string | null }).category ?? null,
    department: (doc as unknown as { department?: string | null }).department ?? null,
    classification: ((doc as unknown as { classification?: string }).classification ?? "internal") as DocumentClassification,
    owner: (doc as unknown as { owner?: { toString(): string } | null }).owner?.toString() ?? null,
    effectiveDate: (doc as unknown as { effectiveDate?: Date | null }).effectiveDate?.toISOString() ?? null,
    expiryDate: (doc as unknown as { expiryDate?: Date | null }).expiryDate?.toISOString() ?? null,
    version: (doc as unknown as { version?: number }).version ?? 1,
    versionLabel: (doc as unknown as { versionLabel?: string }).versionLabel ?? "v1",
    isArchived: (doc as unknown as { isArchived?: boolean }).isArchived ?? false,
    archivedAt: (doc as unknown as { archivedAt?: Date | null }).archivedAt?.toISOString() ?? null,
    archivedBy: (doc as unknown as { archivedBy?: { toString(): string } | null }).archivedBy?.toString() ?? null,
    deletedAt: (doc as unknown as { deletedAt?: Date | null }).deletedAt?.toISOString() ?? null,
    deletedBy: (doc as unknown as { deletedBy?: { toString(): string } | null }).deletedBy?.toString() ?? null,
    quarantineStatus: ((doc as unknown as { quarantineStatus?: string }).quarantineStatus ?? "none") as DocumentQuarantineStatus,
    scanResult: (doc as unknown as { scanResult?: { scanner: string; scannedAt: Date; result: string; details?: string } | null }).scanResult
      ? {
          scanner: (doc as unknown as { scanResult: { scanner: string } }).scanResult.scanner,
          scannedAt: (doc as unknown as { scanResult: { scannedAt: Date } }).scanResult.scannedAt.toISOString(),
          result: (doc as unknown as { scanResult: { result: string } }).scanResult.result as "clean" | "infected" | "error",
          details: (doc as unknown as { scanResult: { details?: string } }).scanResult.details,
        }
      : null,
    checksum: (doc as unknown as { checksum?: string }).checksum ?? "",
    uploadedBy: doc.uploadedBy?.toString() ?? "",
    createdAt: doc.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: doc.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

function serializeVersion(v: { _id?: unknown; id?: unknown; documentId: unknown; tenantId: unknown; version: number; versionLabel: string; fileName: string; fileSize: number; mimeType: string; checksum: string; uploadedBy: unknown; uploadReason: string; changeDescription: string | null; createdAt: Date }): DocumentVersionView {
  return {
    id: (v._id?.toString?.() ?? v.id?.toString?.() ?? ""),
    documentId: v.documentId?.toString() ?? "",
    tenantId: v.tenantId?.toString() ?? "",
    version: v.version,
    versionLabel: v.versionLabel,
    fileName: v.fileName,
    fileSize: v.fileSize,
    mimeType: v.mimeType,
    checksum: v.checksum,
    uploadedBy: v.uploadedBy?.toString() ?? "",
    uploadReason: v.uploadReason as "initial" | "replace" | "restore",
    changeDescription: v.changeDescription,
    createdAt: v.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

export function createDocumentServiceProviders(deps: {
  storageProvider: StorageProvider;
  securityScanner: SecurityScanner;
  entitlementChecker: EntitlementChecker;
  processingDispatcher: ProcessingDispatcher;
}) {
  const { storageProvider, securityScanner, entitlementChecker, processingDispatcher } = deps;

  async function uploadDocument(
    file: MulterFile,
    metadataInput: unknown,
    tenantId: string,
    userId: string,
  ): Promise<UploadDocumentResult> {
    if (!file) {
      throw new AppError(400, "BAD_REQUEST", "File is required");
    }

    if (file.size === 0) {
      throw new AppError(400, FILE_ZERO_BYTES, "File is empty (zero bytes)");
    }

    await entitlementChecker.checkUploadAllowed(tenantId, file.size);

    const metadata = validateUploadDocumentInput(metadataInput);
    const safeName = sanitizeFilename(file.originalname);

    const checksum = computeChecksum(file.buffer);

    const existingDocs = await findDocumentByChecksum(tenantId, checksum);

    const scanResult = await securityScanner.scan(file.buffer, safeName);

    if (scanResult.result === "infected") {
      throw new AppError(
        400,
        DOCUMENT_QUARANTINED,
        "File failed security scan and has been quarantined",
        { scanner: scanResult.scanner, details: scanResult.details },
      );
    }

    const storageKey = await storageProvider.saveFile(file.buffer, safeName, tenantId);

    let created: DocumentDocument;

    try {
      created = await createDocument({
        tenantId: tenantId as unknown as DocumentDocument["tenantId"],
        fileName: safeName,
        originalFileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        storageKey,
        checksum,
        status: "uploaded",
        metadata: {
          title: metadata.title,
          description: metadata.description ?? "",
          tags: metadata.tags ?? [],
        },
        category: null,
        department: null,
        classification: "internal",
        owner: null,
        effectiveDate: null,
        expiryDate: null,
        version: 1,
        versionLabel: "v1",
        isArchived: false,
        archivedAt: null,
        archivedBy: null,
        deletedAt: null,
        deletedBy: null,
        quarantineStatus: scanResult.result === "error" ? "quarantined" : "none",
        scanResult: {
          scanner: scanResult.scanner,
          scannedAt: new Date(),
          result: scanResult.result,
          details: scanResult.details,
        },
        uploadedBy: userId as unknown as DocumentDocument["uploadedBy"],
      } as unknown as Omit<DocumentDocument, "_id" | "createdAt" | "updatedAt">);
    } catch (error) {
      await storageProvider.deleteFile(storageKey);
      throw error;
    }

    await createVersion({
      documentId: created._id,
      tenantId: created.tenantId.toString(),
      version: 1,
      versionLabel: "v1",
      fileName: safeName,
      fileSize: file.size,
      mimeType: file.mimetype,
      checksum,
      storageKey,
      uploadedBy: created.uploadedBy.toString(),
      uploadReason: "initial",
      changeDescription: null,
    } as unknown as Omit<DocumentVersionDocument, "_id" | "createdAt">);

    await getAuditWriter().write({
      tenantId,
      resourceType: "Document",
      resourceId: created._id.toString(),
      action: "DOCUMENT_UPLOADED",
      actorId: userId,
      actorEmail: "",
      actorRole: "",
      changes: {
        fileName: safeName,
        fileSize: file.size,
        mimeType: file.mimetype,
        title: metadata.title,
        checksum,
      },
    });

    await processingDispatcher.dispatchDocumentUploaded(created._id.toString(), tenantId, userId, 1);

    const duplicateWarning =
      existingDocs.length > 0
        ? {
            existingDocumentId: existingDocs[0]._id.toString(),
            existingTitle: existingDocs[0].metadata?.title ?? existingDocs[0].fileName,
          }
        : undefined;

    return {
      document: serializeDocument(created),
      duplicateWarning,
    };
  }

  async function listDocuments(
    input: unknown,
    tenantId: string,
  ): Promise<ListDocumentsResult> {
    const payload = validateListDocumentsInput(input);

    const filter: Record<string, unknown> = { deletedAt: null };

    if (payload.status) {
      filter.status = payload.status;
    }

    if (payload.isArchived !== undefined) {
      filter.isArchived = payload.isArchived;
    } else {
      filter.isArchived = false;
    }

    if (payload.category) {
      filter.category = payload.category;
    }

    if (payload.classification) {
      filter.classification = payload.classification;
    }

    if (payload.search) {
      const regex = new RegExp(payload.search, "i");
      filter.$or = [
        { fileName: regex },
        { originalFileName: regex },
        { "metadata.title": regex },
        { "metadata.description": regex },
        { "metadata.tags": regex },
      ];
    }

    const sortField = payload.sortBy ?? "createdAt";
    const sortOrder = payload.sortOrder === "asc" ? 1 : -1;

    const [totalRecords, documents] = await Promise.all([
      countDocumentsByTenant(tenantId, filter),
      findDocumentsByTenant(tenantId, payload.page, payload.pageSize, filter, { [sortField]: sortOrder }),
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

  async function getDocument(
    documentId: string,
    tenantId: string,
  ): Promise<{ document: DocumentPublicView }> {
    const document = await findDocumentByTenantAndId(tenantId, documentId);

    if (!document) {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found");
    }

    return { document: serializeDocument(document) };
  }

  async function updateDocumentMetadata(
    documentId: string,
    input: unknown,
    tenantId: string,
    userId: string,
  ): Promise<UpdateDocumentMetadataResult> {
    const payload = validateUpdateDocumentMetadataInput(input);

    const existing = await findDocumentByTenantAndId(tenantId, documentId);

    if (!existing) {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found");
    }

    const update: Record<string, unknown> = {};
    if (payload.title !== undefined) update["metadata.title"] = payload.title;
    if (payload.description !== undefined) update["metadata.description"] = payload.description;
    if (payload.tags !== undefined) update["metadata.tags"] = payload.tags;
    if (payload.category !== undefined) update.category = payload.category;
    if (payload.department !== undefined) update.department = payload.department;
    if (payload.classification !== undefined) update.classification = payload.classification;
    if (payload.owner !== undefined) update.owner = payload.owner;
    if (payload.effectiveDate !== undefined) update.effectiveDate = payload.effectiveDate;
    if (payload.expiryDate !== undefined) update.expiryDate = payload.expiryDate;
    if (payload.versionLabel !== undefined) update.versionLabel = payload.versionLabel;

    await updateDocumentByTenantAndId(tenantId, documentId, update as Partial<DocumentDocument>);

    const updated = await findDocumentByTenantAndId(tenantId, documentId);

    if (!updated) {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found");
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
          category: (existing as unknown as { category?: string | null }).category ?? null,
          classification: (existing as unknown as { classification?: string }).classification ?? "internal",
        },
        after: {
          title: payload.title ?? existing.metadata?.title ?? null,
          description: payload.description ?? existing.metadata?.description ?? null,
          tags: payload.tags ?? existing.metadata?.tags ?? [],
          category: payload.category ?? (existing as unknown as { category?: string | null }).category ?? null,
          classification: payload.classification ?? (existing as unknown as { classification?: string }).classification ?? "internal",
        },
      },
    });

    return { document: serializeDocument(updated) };
  }

  async function downloadDocument(
    documentId: string,
    tenantId: string,
    userId: string,
  ): Promise<{ stream: import("node:stream").Readable; contentType: string; fileName: string; fileSize: number }> {
    const document = await findDocumentByTenantAndId(tenantId, documentId);

    if (!document) {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found");
    }

    if (document.deletedAt) {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found");
    }

    const stream = storageProvider.getFileStream(document.storageKey);
    const contentType = storageProvider.getContentType(document.fileName);

    await getAuditWriter().write({
      tenantId,
      resourceType: "Document",
      resourceId: documentId,
      action: "DOCUMENT_DOWNLOADED",
      actorId: userId,
      actorEmail: "",
      actorRole: "",
      changes: { fileName: document.fileName },
    });

    return {
      stream,
      contentType,
      fileName: document.fileName,
      fileSize: document.fileSize,
    };
  }

  async function replaceDocument(
    documentId: string,
    file: MulterFile,
    metadataInput: unknown,
    tenantId: string,
    userId: string,
  ): Promise<ReplaceDocumentResult> {
    if (!file) {
      throw new AppError(400, "BAD_REQUEST", "File is required for replacement");
    }

    if (file.size === 0) {
      throw new AppError(400, FILE_ZERO_BYTES, "Replacement file is empty (zero bytes)");
    }

    const existing = await findDocumentByTenantAndId(tenantId, documentId);

    if (!existing) {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found");
    }

    if (existing.deletedAt) {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found");
    }

    await entitlementChecker.checkUploadAllowed(tenantId, file.size);

    const payload = validateReplaceDocumentInput(metadataInput);
    const safeName = sanitizeFilename(file.originalname);
    const checksum = computeChecksum(file.buffer);

    const scanResult = await securityScanner.scan(file.buffer, safeName);

    if (scanResult.result === "infected") {
      throw new AppError(
        400,
        DOCUMENT_QUARANTINED,
        "Replacement file failed security scan",
        { scanner: scanResult.scanner, details: scanResult.details },
      );
    }

    const newStorageKey = await storageProvider.saveFile(file.buffer, safeName, tenantId);

    const newVersion = ((existing as unknown as { version?: number }).version ?? 1) + 1;
    const newVersionLabel = `v${newVersion}`;

    try {
      await updateDocumentByTenantAndId(tenantId, documentId, {
        fileName: safeName,
        fileSize: file.size,
        mimeType: file.mimetype,
        storageKey: newStorageKey,
        checksum,
        version: newVersion,
        versionLabel: newVersionLabel,
        quarantineStatus: scanResult.result === "error" ? "quarantined" : "none",
        scanResult: {
          scanner: scanResult.scanner,
          scannedAt: new Date(),
          result: scanResult.result,
          details: scanResult.details,
        },
      } as Partial<DocumentDocument>);

      await createVersion({
        documentId: existing._id,
        tenantId: existing.tenantId.toString(),
        version: newVersion,
        versionLabel: newVersionLabel,
        fileName: safeName,
        fileSize: file.size,
        mimeType: file.mimetype,
        checksum,
        storageKey: newStorageKey,
        uploadedBy: existing.uploadedBy.toString(),
        uploadReason: "replace",
        changeDescription: payload.changeDescription || null,
      } as unknown as Omit<DocumentVersionDocument, "_id" | "createdAt">);

      await storageProvider.deleteFile(existing.storageKey);
    } catch (error) {
      await storageProvider.deleteFile(newStorageKey);
      throw error;
    }

    await getAuditWriter().write({
      tenantId,
      resourceType: "Document",
      resourceId: documentId,
      action: "DOCUMENT_REPLACED",
      actorId: userId,
      actorEmail: "",
      actorRole: "",
      changes: {
        fromVersion: (existing as unknown as { version: number }).version,
        toVersion: newVersion,
        oldFileName: existing.fileName,
        newFileName: safeName,
      },
    });

    await processingDispatcher.dispatchDocumentUploaded(documentId, tenantId, userId, newVersion);

    const updated = await findDocumentByTenantAndId(tenantId, documentId);
    if (!updated) {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found");
    }

    return { document: serializeDocument(updated) };
  }

  async function archiveDocument(
    documentId: string,
    tenantId: string,
    userId: string,
  ): Promise<ArchiveDocumentResult> {
    const document = await findDocumentByTenantAndId(tenantId, documentId);

    if (!document) {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found");
    }

    if ((document as unknown as { isArchived?: boolean }).isArchived) {
      throw new AppError(409, DOCUMENT_ALREADY_ARCHIVED, "Document is already archived");
    }

    await updateDocumentByTenantAndId(tenantId, documentId, {
      isArchived: true,
      archivedAt: new Date(),
      archivedBy: userId as unknown as DocumentDocument["archivedBy"],
    } as unknown as Partial<DocumentDocument>);

    await getAuditWriter().write({
      tenantId,
      resourceType: "Document",
      resourceId: documentId,
      action: "DOCUMENT_ARCHIVED",
      actorId: userId,
      actorEmail: "",
      actorRole: "",
      changes: { fileName: document.fileName },
    });

    const updated = await findDocumentByTenantAndId(tenantId, documentId);
    if (!updated) throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found");

    return { document: serializeDocument(updated) };
  }

  async function restoreDocument(
    documentId: string,
    tenantId: string,
    userId: string,
  ): Promise<ArchiveDocumentResult> {
    const document = await findDocumentByTenantAndId(tenantId, documentId);

    if (!document) {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found");
    }

    if (!(document as unknown as { isArchived?: boolean }).isArchived) {
      throw new AppError(409, DOCUMENT_NOT_ARCHIVED, "Document is not archived");
    }

    await updateDocumentByTenantAndId(tenantId, documentId, {
      isArchived: false,
      archivedAt: null,
      archivedBy: null,
    } as unknown as Partial<DocumentDocument>);

    await getAuditWriter().write({
      tenantId,
      resourceType: "Document",
      resourceId: documentId,
      action: "DOCUMENT_RESTORED",
      actorId: userId,
      actorEmail: "",
      actorRole: "",
      changes: { fileName: document.fileName },
    });

    const updated = await findDocumentByTenantAndId(tenantId, documentId);
    if (!updated) throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found");

    return { document: serializeDocument(updated) };
  }

  async function softDeleteDocument(
    documentId: string,
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const document = await findDocumentByTenantAndId(tenantId, documentId);

    if (!document) {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found");
    }

    if (document.deletedAt) {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found");
    }

    await updateDocumentByTenantAndId(tenantId, documentId, {
      deletedAt: new Date(),
      deletedBy: userId as unknown as DocumentDocument["deletedBy"],
    } as unknown as Partial<DocumentDocument>);

    await getAuditWriter().write({
      tenantId,
      resourceType: "Document",
      resourceId: documentId,
      action: "DOCUMENT_SOFT_DELETED",
      actorId: userId,
      actorEmail: "",
      actorRole: "",
      changes: { fileName: document.fileName },
    });
  }

  async function permanentDeleteDocument(
    documentId: string,
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const document = await findDocumentByTenantAndId(tenantId, documentId);

    if (!document) {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found");
    }

    if (!document.deletedAt) {
      throw new AppError(400, DOCUMENT_NOT_SOFT_DELETED, "Document must be soft-deleted first");
    }

    const versions = await findVersionsByDocument(tenantId, documentId);
    for (const v of versions) {
      if (v.storageKey !== document.storageKey) {
        await storageProvider.deleteFile(v.storageKey);
      }
    }

    await storageProvider.deleteFile(document.storageKey);

    const DocumentVersionModel = (await import("../../db/models/documentVersion.model.js")).default;
    await DocumentVersionModel.deleteMany({ documentId: document._id, tenantId: tenantId }).exec();

    await deleteDocumentByTenantAndId(tenantId, documentId);

    await getAuditWriter().write({
      tenantId,
      resourceType: "Document",
      resourceId: documentId,
      action: "DOCUMENT_PERMANENTLY_DELETED",
      actorId: userId,
      actorEmail: "",
      actorRole: "",
      changes: { fileName: document.fileName, versionsRemoved: versions.length },
    });
  }

  async function listVersions(
    documentId: string,
    tenantId: string,
  ): Promise<ListVersionsResult> {
    const document = await findDocumentByTenantAndId(tenantId, documentId);

    if (!document) {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found");
    }

    const versions = await findVersionsByDocument(tenantId, documentId);

    return {
      versions: versions.map(serializeVersion),
    };
  }

  return {
    uploadDocument,
    listDocuments,
    getDocument,
    updateDocumentMetadata,
    downloadDocument,
    replaceDocument,
    archiveDocument,
    restoreDocument,
    softDeleteDocument,
    permanentDeleteDocument,
    listVersions,
  };
}
