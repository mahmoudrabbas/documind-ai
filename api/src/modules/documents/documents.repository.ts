import DocumentModel, { type DocumentDocument } from "../../db/models/document.model.js";
import {
  tenantScopedFind,
  tenantScopedFindById,
  tenantScopedCreate,
  tenantScopedUpdateOne,
  tenantScopedDeleteOne,
} from "../../db/repositories/tenantScopedRepository.js";

export function createDocument(
  data: Omit<DocumentDocument, "_id" | "createdAt" | "updatedAt">,
) {
  return tenantScopedCreate<DocumentDocument>(DocumentModel, data as DocumentDocument & { tenantId: unknown });
}

export function findDocumentsByTenant(
  tenantId: string,
  page: number,
  pageSize: number,
  filter?: Record<string, unknown>,
  sort?: Record<string, 1 | -1>,
) {
  const query = tenantScopedFind(DocumentModel, tenantId, filter ?? {})
    .sort(sort ?? { createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize);

  return query.lean<DocumentDocument[]>().exec();
}

export function countDocumentsByTenant(
  tenantId: string,
  filter?: Record<string, unknown>,
) {
  return tenantScopedFind(DocumentModel, tenantId, filter ?? {}).countDocuments().exec();
}

export function findDocumentByTenantAndId(tenantId: string, documentId: string) {
  return tenantScopedFindById(DocumentModel, tenantId, documentId).exec();
}

export function updateDocumentByTenantAndId(
  tenantId: string,
  documentId: string,
  update: Partial<DocumentDocument>,
) {
  return tenantScopedUpdateOne(
    DocumentModel,
    tenantId,
    { _id: documentId },
    { $set: update },
  ).exec();
}

export function deleteDocumentByTenantAndId(tenantId: string, documentId: string) {
  return tenantScopedDeleteOne(DocumentModel, tenantId, { _id: documentId }).exec();
}

export function findDocumentByChecksum(tenantId: string, checksum: string) {
  return tenantScopedFind(DocumentModel, tenantId, {
    checksum,
    deletedAt: null,
  })
    .lean<DocumentDocument[]>()
    .exec();
}
