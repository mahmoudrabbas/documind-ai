import { AppError } from "../../common/errors/AppError.js";
import { NOT_FOUND } from "../../common/errors/errorCodes.js";
import { storageProvider } from "../../providers/storage/index.js";
import { createDocument, countDocumentsByTenant, findDocumentsByTenant, findDocumentByTenantAndId, updateDocumentByTenantAndId, deleteDocumentByTenantAndId, } from "./documents.repository.js";
import { validateUploadDocumentInput, validateListDocumentsInput, validateUpdateDocumentMetadataInput, } from "./documents.validator.js";
function serializeDocument(doc) {
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
export async function uploadDocument(file, metadataInput, tenantId, userId) {
    if (!file) {
        throw new AppError(400, "BAD_REQUEST", "File is required");
    }
    const metadata = validateUploadDocumentInput(metadataInput);
    const storagePath = await storageProvider.saveFile(file.buffer, file.originalname, tenantId);
    let created;
    try {
        created = await createDocument({
            tenantId: tenantId,
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
            uploadedBy: userId,
        });
    }
    catch (error) {
        await storageProvider.deleteFile(storagePath);
        throw error;
    }
    return {
        document: serializeDocument(created),
    };
}
export async function listDocuments(input, tenantId) {
    const payload = validateListDocumentsInput(input);
    const filter = {};
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
export async function getDocument(documentId, tenantId) {
    const document = await findDocumentByTenantAndId(tenantId, documentId);
    if (!document) {
        throw new AppError(404, NOT_FOUND, "Document not found");
    }
    return {
        document: serializeDocument(document),
    };
}
export async function updateDocumentMetadata(documentId, input, tenantId) {
    const payload = validateUpdateDocumentMetadataInput(input);
    const existing = await findDocumentByTenantAndId(tenantId, documentId);
    if (!existing) {
        throw new AppError(404, NOT_FOUND, "Document not found");
    }
    const update = {};
    if (payload.title !== undefined) {
        update["metadata.title"] = payload.title;
    }
    if (payload.description !== undefined) {
        update["metadata.description"] = payload.description;
    }
    if (payload.tags !== undefined) {
        update["metadata.tags"] = payload.tags;
    }
    await updateDocumentByTenantAndId(tenantId, documentId, update);
    const updated = await findDocumentByTenantAndId(tenantId, documentId);
    if (!updated) {
        throw new AppError(404, NOT_FOUND, "Document not found");
    }
    return {
        document: serializeDocument(updated),
    };
}
export async function deleteDocument(documentId, tenantId) {
    const document = await findDocumentByTenantAndId(tenantId, documentId);
    if (!document) {
        throw new AppError(404, NOT_FOUND, "Document not found");
    }
    await storageProvider.deleteFile(document.storagePath);
    await deleteDocumentByTenantAndId(tenantId, documentId);
}
//# sourceMappingURL=documents.service.js.map