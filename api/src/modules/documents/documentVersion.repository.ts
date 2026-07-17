import DocumentVersionModel, {
  type DocumentVersionDocument,
} from "../../db/models/documentVersion.model.js";
import {
  tenantScopedCreate,
  tenantScopedFind,
} from "../../db/repositories/tenantScopedRepository.js";

export function createVersion(
  data: Omit<DocumentVersionDocument, "_id" | "createdAt">,
) {
  return tenantScopedCreate<DocumentVersionDocument>(
    DocumentVersionModel,
    data as DocumentVersionDocument & { tenantId: unknown },
  );
}

export function findVersionsByDocument(tenantId: string, documentId: string) {
  return tenantScopedFind(DocumentVersionModel, tenantId, { documentId })
    .sort({ version: -1 })
    .lean<DocumentVersionDocument[]>()
    .exec();
}

export function findLatestVersion(tenantId: string, documentId: string) {
  return tenantScopedFind(DocumentVersionModel, tenantId, { documentId })
    .sort({ version: -1 })
    .limit(1)
    .lean<DocumentVersionDocument[]>()
    .exec()
    .then((results) => results[0] ?? null);
}
