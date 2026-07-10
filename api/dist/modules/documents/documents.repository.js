import DocumentModel from "../../db/models/document.model.js";
import { tenantScopedFind, tenantScopedFindById, tenantScopedCreate, tenantScopedUpdateOne, tenantScopedDeleteOne, } from "../../db/repositories/tenantScopedRepository.js";
export function createDocument(data) {
    return tenantScopedCreate(DocumentModel, data);
}
export function findDocumentsByTenant(tenantId, page, pageSize, filter) {
    const query = tenantScopedFind(DocumentModel, tenantId, filter ?? {})
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize);
    return query.lean().exec();
}
export function countDocumentsByTenant(tenantId, filter) {
    return tenantScopedFind(DocumentModel, tenantId, filter ?? {}).countDocuments().exec();
}
export function findDocumentByTenantAndId(tenantId, documentId) {
    return tenantScopedFindById(DocumentModel, tenantId, documentId).exec();
}
export function updateDocumentByTenantAndId(tenantId, documentId, update) {
    return tenantScopedUpdateOne(DocumentModel, tenantId, { _id: documentId }, { $set: update }).exec();
}
export function deleteDocumentByTenantAndId(tenantId, documentId) {
    return tenantScopedDeleteOne(DocumentModel, tenantId, { _id: documentId }).exec();
}
//# sourceMappingURL=documents.repository.js.map