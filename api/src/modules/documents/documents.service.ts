import { createHash } from "node:crypto";
import { AppError } from "../../common/errors/AppError.js";
import {
  DOCUMENT_NOT_FOUND,
  DOCUMENT_QUARANTINED,
  DOCUMENT_ALREADY_ARCHIVED,
  DOCUMENT_NOT_ARCHIVED,
  DOCUMENT_NOT_SOFT_DELETED,
} from "../../common/errors/errorCodes.js";
import { getAuditWriter } from "../../common/observability/index.js";
import { getDocumentAccessAuthorizationService } from "../document-access/documentAccess.authorization.service.js";
import type {
  StorageProvider,
  SecurityScanner,
  ProcessingDispatcher,
} from "../../providers/storage/types.js";
import { checkUploadAllowed } from "../entitlement/entitlement-checks.js";
import { getNotificationOutboxDispatcher } from "../notifications/outbox/notificationOutbox.dispatcher.js";
import { publishDocumentUploadedTrigger } from "../notifications/triggers/documentUploaded.trigger.js";
import type { OutboxTriggerPort } from "../notifications/ports/outboxTrigger.port.js";
import {
  findDocumentByTenantAndId,
  updateDocumentByTenantAndId,
  deleteDocumentByTenantAndId,
  findDocumentByChecksum,
  findAuthorizedDocumentsPage,
} from "./documents.repository.js";
import { createDocumentWithPrivatePolicy } from "./documentUpload.repository.js";
import {
  createVersion,
  findVersionsByDocument,
} from "./documentVersion.repository.js";
import { resolveUploadTaxonomy } from "./documents.uploadTaxonomy.js";
import {
  getFileExtensionsForMimeTypes,
  validateDocumentFile,
} from "./documentFileValidator.js";
import DocumentClassificationModel from "../../db/models/documentClassification.model.js";
import DocumentCategoryModel from "../../db/models/documentCategory.model.js";
import DepartmentModel from "../../db/models/department.model.js";
import { config } from "../../config/index.js";
import { getEntitlementService } from "../entitlement/entitlement.service.js";
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
import DocumentChunkModel from "../../db/models/documentChunk.model.js";
import ChunkEmbeddingModel from "../../db/models/chunkEmbedding.model.js";
import IndexGenerationModel from "../../db/models/indexGeneration.model.js";
import type { BaseRole } from "../../common/auth/baseRoles.js";
import { authorizePermission, authorizePermissionCapability } from "../permissions/permissions.authorization.js";
import { Permission, type PermissionValue } from "../permissions/permissions.catalog.js";
import type { PermissionScopes } from "../permissions/permissions.types.js";
import mongoose from "mongoose";
import {
  buildDocumentPermissionResource,
  resolveCanonicalDocumentClassification,
  resolveClassificationScopeIds,
} from "./documents.permissionResource.js";

type MulterFile = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
  filename?: string;
};

type DocumentActor = {
  userId: string;
  email?: string;
  role: BaseRole;
};

function permissionActor(tenantId: string, actor: DocumentActor) {
  return { tenantId, actorId: actor.userId, baseRole: actor.role };
}

async function loadAndAuthorizeDocument(
  tenantId: string,
  documentId: string,
  actor: DocumentActor,
  permission: PermissionValue,
): Promise<DocumentDocument> {
  const document = await findDocumentByTenantAndId(tenantId, documentId);
  if (!document) throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found");
  try {
    await authorizePermission(
      permissionActor(tenantId, actor),
      permission,
      await buildDocumentPermissionResource(tenantId, document),
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "SCOPE_MISMATCH") {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found");
    }
    throw error;
  }
  return document;
}

async function authorizeProposedDocumentUpdate(
  tenantId: string,
  actor: DocumentActor,
  existing: DocumentDocument,
  payload: ReturnType<typeof validateUpdateDocumentMetadataInput>,
): Promise<void> {
  let departmentId = existing.departmentId?.toString();
  if (payload.department !== undefined && payload.department !== existing.department) {
    const escaped = payload.department.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const department = await DepartmentModel.findOne({
      tenantId,
      name: { $regex: `^${escaped}$`, $options: "i" },
      status: "active",
    }).select("_id").lean().exec();
    departmentId = department?._id.toString();
  }
  const classificationName = await resolveCanonicalDocumentClassification(tenantId, existing);
  await authorizePermission(permissionActor(tenantId, actor), Permission.DOCUMENTS_UPDATE, {
    tenantId,
    ...(existing.owner ? { ownerId: existing.owner.toString() } : {}),
    ...(departmentId ? { departmentId } : {}),
    ...((payload.category ?? existing.category) ? { documentCategory: payload.category ?? existing.category ?? undefined } : {}),
    ...(classificationName ? { documentClassification: classificationName } : {}),
  });
}

async function documentScopeFilter(tenantId: string, actorId: string, scopes: PermissionScopes | null): Promise<Record<string, unknown>> {
  if (!scopes) return {};
  const constraints: Record<string, unknown>[] = [];
  if (scopes.selfOnly) constraints.push({ owner: new mongoose.Types.ObjectId(actorId) });
  if (scopes.departmentIds.length > 0) {
    constraints.push({ departmentId: { $in: scopes.departmentIds.map((id) => new mongoose.Types.ObjectId(id)) } });
  }
  if (scopes.documentCategories.length > 0) {
    constraints.push({ $expr: { $in: [{ $toLower: { $ifNull: ["$category", ""] } }, scopes.documentCategories] } });
  }
  if (scopes.documentClassifications.length > 0) {
    const classificationIds = await resolveClassificationScopeIds(tenantId, scopes.documentClassifications);
    constraints.push({ $or: [
      { classificationId: { $in: classificationIds } },
      {
        $and: [
          { $or: [{ classificationId: null }, { classificationId: { $exists: false } }] },
          { $expr: { $in: [{ $toLower: { $ifNull: ["$classification", ""] } }, scopes.documentClassifications] } },
        ],
      },
    ] });
  }
  return constraints.length > 0 ? { $and: constraints } : {};
}

function computeChecksum(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/** File extensions surfaced to the upload form for each allowed MIME type. */

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
    searchStatus: ((doc as unknown as { searchStatus?: string }).searchStatus ?? "STALE") as "STALE" | "INDEXING" | "READY" | "FAILED",
    currentGeneration: (doc as unknown as { currentGeneration?: { toString(): string } | null }).currentGeneration?.toString() ?? null,
    pendingGeneration: (doc as unknown as { pendingGeneration?: { toString(): string } | null }).pendingGeneration?.toString() ?? null,
    lastSearchStatusChange: (doc as unknown as { lastSearchStatusChange?: Date })?.lastSearchStatusChange?.toISOString() ?? new Date().toISOString(),
    lastProcessingError: (doc as unknown as { lastProcessingError?: { stage: string; code: string; message: string } | null }).lastProcessingError ?? null,
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
  processingDispatcher: ProcessingDispatcher;
  triggerPort?: OutboxTriggerPort;
}) {
  const { storageProvider, securityScanner, processingDispatcher, triggerPort } = deps;

  async function uploadDocument(
    file: MulterFile,
    metadataInput: unknown,
    tenantId: string,
    actor: DocumentActor,
  ): Promise<UploadDocumentResult> {
    if (!file) {
      throw new AppError(400, "BAD_REQUEST", "File is required");
    }

    const validatedFile = validateDocumentFile(file, {
      maxSizeBytes: config.MAX_FILE_SIZE_BYTES,
    });

    await checkUploadAllowed(tenantId, file.size);

    const metadata = validateUploadDocumentInput(metadataInput);
    const taxonomy = await resolveUploadTaxonomy(tenantId, metadata);
    await authorizePermission(permissionActor(tenantId, actor), Permission.DOCUMENTS_CREATE, {
      tenantId,
      ownerId: actor.userId,
      ...(taxonomy.departmentId ? { departmentId: taxonomy.departmentId.toString() } : {}),
      ...(taxonomy.category ? { documentCategory: taxonomy.category } : {}),
      documentClassification: taxonomy.classificationName ?? "internal",
    });
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
      created = await createDocumentWithPrivatePolicy({
        tenantId: tenantId as unknown as DocumentDocument["tenantId"],
        fileName: safeName,
        originalFileName: file.originalname,
        fileSize: file.size,
        mimeType: validatedFile.mimeType,
        storageKey,
        checksum,
        status: "uploaded",
        metadata: {
          title: metadata.title,
          description: metadata.description ?? "",
          tags: metadata.tags ?? [],
        },
        category: taxonomy.category,
        department: taxonomy.department,
        classification: taxonomy.classification ?? "internal",
        categoryId: taxonomy.categoryId ?? undefined,
        departmentId: taxonomy.departmentId ?? undefined,
        classificationId: taxonomy.classificationId ?? undefined,
        owner: actor.userId as unknown as DocumentDocument["owner"],
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
        uploadedBy: actor.userId as unknown as DocumentDocument["uploadedBy"],
      } as unknown as Omit<DocumentDocument, "_id" | "createdAt" | "updatedAt">, {
        tenantId: tenantId as unknown as DocumentVersionDocument["tenantId"],
        version: 1, versionLabel: "v1", fileName: safeName, fileSize: file.size, mimeType: validatedFile.mimeType,
        checksum, storageKey, uploadedBy: actor.userId as unknown as DocumentVersionDocument["uploadedBy"],
        uploadReason: "initial", changeDescription: null,
      } as unknown as Omit<DocumentVersionDocument, "_id" | "documentId" | "createdAt">);
    } catch (error) {
      await storageProvider.deleteFile(storageKey);
      throw error;
    }

    await getAuditWriter().write({
      tenantId,
      resourceType: "Document",
      resourceId: created._id.toString(),
      action: "DOCUMENT_UPLOADED",
      actorId: actor.userId,
      actorEmail: actor.email ?? "",
      actorRole: actor.role,
      actorKind: "USER",
      changes: {
        fileName: safeName,
        fileSize: file.size,
        mimeType: validatedFile.mimeType,
        title: metadata.title,
        checksum,
      },
    });

    await processingDispatcher.dispatchDocumentUploaded(
      created._id.toString(),
      tenantId,
      actor.userId,
      1,
    );

    // T18 — document_uploaded trigger, ONLY after the upload succeeded.
    // Best-effort: a notification outbox failure must never fail the completed
    // upload — the outbox scheduler retries pending entries asynchronously.
    try {
      await publishDocumentUploadedTrigger(triggerPort ?? getNotificationOutboxDispatcher(), {
        tenantId,
        actorId: actor.userId,
        documentId: created._id.toString(),
        documentTitle: created.metadata?.title ?? null,
        department: (created as unknown as { department?: string | null }).department ?? null,
        classification: (created as unknown as { classification?: string }).classification ?? null,
      });
    } catch (triggerError) {
      console.error("[documents-upload:document-uploaded-trigger]", triggerError);
    }

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
    actor: DocumentActor,
  ): Promise<ListDocumentsResult> {
    const payload = validateListDocumentsInput(input);

    const capability = await authorizePermissionCapability(
      permissionActor(tenantId, actor),
      Permission.DOCUMENTS_READ,
    );
    const filter: Record<string, unknown> = {
      deletedAt: null,
      ...(await documentScopeFilter(tenantId, actor.userId, capability.scope)),
    };

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

    const accessPipeline = await getDocumentAccessAuthorizationService().buildDiscoverPipeline({ tenantId, actorId: actor.userId });
    const { totalRecords, documents } = await findAuthorizedDocumentsPage(
      tenantId, filter, accessPipeline, payload.page, payload.pageSize, { [sortField]: sortOrder, _id: 1 },
    );

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
    actor: DocumentActor,
  ): Promise<{ document: DocumentPublicView }> {
    await loadAndAuthorizeDocument(tenantId, documentId, actor, Permission.DOCUMENTS_READ);
    await getDocumentAccessAuthorizationService().authorizeDocumentAction({ tenantId, actorId: actor.userId }, documentId, "read");
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
    actor: DocumentActor,
  ): Promise<UpdateDocumentMetadataResult> {
    const payload = validateUpdateDocumentMetadataInput(input);

    const existing = await loadAndAuthorizeDocument(tenantId, documentId, actor, Permission.DOCUMENTS_UPDATE);
    await authorizeProposedDocumentUpdate(tenantId, actor, existing, payload);
    await getDocumentAccessAuthorizationService().authorizeDocumentAction({ tenantId, actorId: actor.userId }, documentId, "update");

    const update: Record<string, unknown> = {};
    if (payload.title !== undefined) update["metadata.title"] = payload.title;
    if (payload.description !== undefined) update["metadata.description"] = payload.description;
    if (payload.tags !== undefined) update["metadata.tags"] = payload.tags;
    if (payload.category !== undefined) update.category = payload.category;
    if (payload.department !== undefined) update.department = payload.department;
    if (payload.classification !== undefined) update.classification = payload.classification;
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
      actorId: actor.userId,
      actorEmail: actor.email ?? "",
      actorRole: actor.role,
      actorKind: "USER",
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

  async function openDocumentContent(
    documentId: string,
    tenantId: string,
    actor: DocumentActor,
    permission: PermissionValue,
    policyAction: "read" | "download",
    auditDownload: boolean,
  ): Promise<{ stream: import("node:stream").Readable; contentType: string; fileName: string; fileSize: number }> {
    await loadAndAuthorizeDocument(tenantId, documentId, actor, permission);
    await getDocumentAccessAuthorizationService().authorizeDocumentAction(
      { tenantId, actorId: actor.userId },
      documentId,
      policyAction,
    );
    const document = await findDocumentByTenantAndId(tenantId, documentId);

    if (!document) {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found");
    }

    if (document.deletedAt) {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found");
    }

    const stream = await storageProvider.getFileStream(document.storageKey);
    const contentType = storageProvider.getContentType(document.fileName);

    if (auditDownload) {
      await getAuditWriter().write({
        tenantId,
        resourceType: "Document",
        resourceId: documentId,
        action: "DOCUMENT_DOWNLOADED",
        actorId: actor.userId,
        actorEmail: actor.email ?? "",
        actorRole: actor.role,
        actorKind: "USER",
        changes: { fileName: document.fileName },
      });
    }

    return {
      stream,
      contentType,
      fileName: document.fileName,
      fileSize: document.fileSize,
    };
  }

  async function downloadDocument(
    documentId: string,
    tenantId: string,
    actor: DocumentActor,
  ) {
    return openDocumentContent(
      documentId,
      tenantId,
      actor,
      Permission.DOCUMENTS_DOWNLOAD,
      "download",
      true,
    );
  }

  async function previewDocument(
    documentId: string,
    tenantId: string,
    actor: DocumentActor,
  ) {
    return openDocumentContent(
      documentId,
      tenantId,
      actor,
      Permission.DOCUMENTS_READ,
      "read",
      false,
    );
  }

  async function replaceDocument(
    documentId: string,
    file: MulterFile,
    metadataInput: unknown,
    tenantId: string,
    actor: DocumentActor,
  ): Promise<ReplaceDocumentResult> {
    if (!file) {
      throw new AppError(400, "BAD_REQUEST", "File is required for replacement");
    }

    const validatedFile = validateDocumentFile(file, {
      maxSizeBytes: config.MAX_FILE_SIZE_BYTES,
    });

    const existing = await loadAndAuthorizeDocument(tenantId, documentId, actor, Permission.DOCUMENTS_UPDATE);
    await getDocumentAccessAuthorizationService().authorizeDocumentAction({ tenantId, actorId: actor.userId }, documentId, "replace");

    if (existing.deletedAt) {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found");
    }

    await checkUploadAllowed(tenantId, file.size);

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
        mimeType: validatedFile.mimeType,
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
        mimeType: validatedFile.mimeType,
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
      actorId: actor.userId,
      actorEmail: actor.email ?? "",
      actorRole: actor.role,
      actorKind: "USER",
      changes: {
        fromVersion: (existing as unknown as { version: number }).version,
        toVersion: newVersion,
        oldFileName: existing.fileName,
        newFileName: safeName,
      },
    });

    await processingDispatcher.dispatchDocumentUploaded(
      documentId,
      tenantId,
      actor.userId,
      newVersion,
    );

    const updated = await findDocumentByTenantAndId(tenantId, documentId);
    if (!updated) {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found");
    }

    return { document: serializeDocument(updated) };
  }

  async function archiveDocument(
    documentId: string,
    tenantId: string,
    actor: DocumentActor,
  ): Promise<ArchiveDocumentResult> {
    await loadAndAuthorizeDocument(tenantId, documentId, actor, Permission.DOCUMENTS_ARCHIVE);
    await getDocumentAccessAuthorizationService().authorizeDocumentAction({ tenantId, actorId: actor.userId }, documentId, "archive");
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
      archivedBy: actor.userId as unknown as DocumentDocument["archivedBy"],
    } as unknown as Partial<DocumentDocument>);

    await getAuditWriter().write({
      tenantId,
      resourceType: "Document",
      resourceId: documentId,
      action: "DOCUMENT_ARCHIVED",
      actorId: actor.userId,
      actorEmail: actor.email ?? "",
      actorRole: actor.role,
      actorKind: "USER",
      changes: { fileName: document.fileName },
    });

    const updated = await findDocumentByTenantAndId(tenantId, documentId);
    if (!updated) throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found");

    return { document: serializeDocument(updated) };
  }

  async function restoreDocument(
    documentId: string,
    tenantId: string,
    actor: DocumentActor,
  ): Promise<ArchiveDocumentResult> {
    await loadAndAuthorizeDocument(tenantId, documentId, actor, Permission.DOCUMENTS_ARCHIVE);
    await getDocumentAccessAuthorizationService().authorizeDocumentAction({ tenantId, actorId: actor.userId }, documentId, "restore");
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
      actorId: actor.userId,
      actorEmail: actor.email ?? "",
      actorRole: actor.role,
      actorKind: "USER",
      changes: { fileName: document.fileName },
    });

    const updated = await findDocumentByTenantAndId(tenantId, documentId);
    if (!updated) throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found");

    return { document: serializeDocument(updated) };
  }

  async function removeDocumentFromRetrieval(
    tenantId: string,
    documentId: string,
  ): Promise<void> {
    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    const documentObjectId = new mongoose.Types.ObjectId(documentId);
    const retiredAt = new Date();

    await Promise.all([
      ChunkEmbeddingModel.deleteMany({
        tenantId: tenantObjectId,
        documentId: documentObjectId,
      }).exec(),

      DocumentChunkModel.deleteMany({
        tenantId: tenantObjectId,
        documentId: documentObjectId,
      }).exec(),

      IndexGenerationModel.updateMany(
        {
          tenantId: tenantObjectId,
          documentId: documentObjectId,
          status: { $ne: "RETIRED" },
        },
        {
          $set: {
            status: "RETIRED",
            retiredAt,
          },
        },
      ).exec(),
    ]);
  }

  async function softDeleteDocument(
    documentId: string,
    tenantId: string,
    actor: DocumentActor,
  ): Promise<void> {
    await loadAndAuthorizeDocument(tenantId, documentId, actor, Permission.DOCUMENTS_DELETE);
    await getDocumentAccessAuthorizationService().authorizeDocumentAction({ tenantId, actorId: actor.userId }, documentId, "delete");
    const document = await findDocumentByTenantAndId(tenantId, documentId);

    if (!document) {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found");
    }

    if (document.deletedAt) {
      throw new AppError(404, DOCUMENT_NOT_FOUND, "Document not found");
    }

    await updateDocumentByTenantAndId(tenantId, documentId, {
      deletedAt: new Date(),
      deletedBy: actor.userId as unknown as DocumentDocument["deletedBy"],
      searchStatus: "STALE",
      activeChunkGeneration: null,
      currentGeneration: null,
      pendingGeneration: null,
    } as unknown as Partial<DocumentDocument>);

    await removeDocumentFromRetrieval(tenantId, documentId);

    await getAuditWriter().write({
      tenantId,
      resourceType: "Document",
      resourceId: documentId,
      action: "DOCUMENT_SOFT_DELETED",
      actorId: actor.userId,
      actorEmail: actor.email ?? "",
      actorRole: actor.role,
      actorKind: "USER",
      changes: { fileName: document.fileName },
    });
  }

  async function permanentDeleteDocument(
    documentId: string,
    tenantId: string,
    actor: DocumentActor,
  ): Promise<void> {
    await loadAndAuthorizeDocument(tenantId, documentId, actor, Permission.DOCUMENTS_DELETE);
    await getDocumentAccessAuthorizationService().authorizeDocumentAction({ tenantId, actorId: actor.userId }, documentId, "delete");
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

    // Defensive/idempotent cleanup for documents soft-deleted before retrieval
    // lifecycle cleanup was introduced.
    await removeDocumentFromRetrieval(tenantId, documentId);
    await IndexGenerationModel.deleteMany({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      documentId: new mongoose.Types.ObjectId(documentId),
    }).exec();

    await deleteDocumentByTenantAndId(tenantId, documentId);

    await getAuditWriter().write({
      tenantId,
      resourceType: "Document",
      resourceId: documentId,
      action: "DOCUMENT_PERMANENTLY_DELETED",
      actorId: actor.userId,
      actorEmail: actor.email ?? "",
      actorRole: actor.role,
      actorKind: "USER",
      changes: { fileName: document.fileName, versionsRemoved: versions.length },
    });
  }

  async function uploadOptions(tenantId: string, actor: DocumentActor) {
    const capability = await authorizePermissionCapability(
      permissionActor(tenantId, actor),
      Permission.DOCUMENTS_CREATE,
    );
    const scopes = capability.scope;
    const classificationFilter: Record<string, unknown> = { tenantId, status: "active" };
    if (scopes?.documentClassifications.length) classificationFilter.normalizedName = { $in: scopes.documentClassifications };
    const [classifications, categories, departments] = await Promise.all([
      DocumentClassificationModel.find(classificationFilter).select("name level").sort({ name: 1 }).lean().exec(),
      DocumentCategoryModel.find({ tenantId, status: "active", ...(scopes?.documentCategories.length ? { name: { $in: scopes.documentCategories.map((value) => new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")) } } : {}) }).select("name").sort({ name: 1 }).lean().exec(),
      DepartmentModel.find({ tenantId, status: "active", ...(scopes?.departmentIds.length ? { _id: { $in: scopes.departmentIds } } : {}) }).select("name").sort({ name: 1 }).lean().exec(),
    ]);

    const allowedMimeTypes = config.ALLOWED_MIME_TYPES.split(",").map((t) => t.trim());
    const fileExtensions = getFileExtensionsForMimeTypes(allowedMimeTypes)
      .map((ext) => `.${ext}`);

    // The entitlement fileSizeMb limit is authoritative when it is stricter
    // than the global upload ceiling (multer enforces the global ceiling).
    let maxFileSizeBytes = config.MAX_FILE_SIZE_BYTES;
    try {
      const fileSizeMb = await getEntitlementService().getEffectiveLimit(tenantId, "fileSizeMb");
      maxFileSizeBytes = Math.min(config.MAX_FILE_SIZE_BYTES, fileSizeMb * 1024 * 1024);
    } catch {
      // Fall back to the global upload limit when no entitlement snapshot exists.
    }

    return {
      taxonomy: {
        classifications: classifications.map((c) => ({ id: c._id.toString(), name: c.name, level: c.level })),
        categories: categories.map((c) => ({ id: c._id.toString(), name: c.name })),
        departments: departments.map((d) => ({ id: d._id.toString(), name: d.name })),
      },
      upload: {
        maxFileSizeBytes,
        allowedMimeTypes,
        fileExtensions,
      },
    };
  }

  async function listVersions(
    documentId: string,
    tenantId: string,
    actor: DocumentActor,
  ): Promise<ListVersionsResult> {
    await loadAndAuthorizeDocument(tenantId, documentId, actor, Permission.DOCUMENTS_READ);
    await getDocumentAccessAuthorizationService().authorizeDocumentAction({ tenantId, actorId: actor.userId }, documentId, "read");
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
    previewDocument,
    replaceDocument,
    archiveDocument,
    restoreDocument,
    softDeleteDocument,
    permanentDeleteDocument,
    listVersions,
    uploadOptions,
  };
}
