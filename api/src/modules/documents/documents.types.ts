export type DocumentClassification = "public" | "internal" | "confidential" | "restricted" | "highly_confidential";

export interface DocumentPublicView {
  id: string;
  tenantId: string;
  fileName: string;
  originalFileName: string;
  fileSize: number;
  mimeType: string;
  status: "uploading" | "uploaded" | "processing" | "processed" | "failed";
  metadata: {
    title: string | null;
    description: string | null;
    tags: string[];
  };
  category: string | null;
  department: string | null;
  classification: DocumentClassification;
  owner: string | null;
  effectiveDate: string | null;
  expiryDate: string | null;
  version: number;
  versionLabel: string;
  isArchived: boolean;
  archivedAt: string | null;
  archivedBy: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
  quarantineStatus: "none" | "quarantined" | "cleared";
  scanResult: {
    scanner: string;
    scannedAt: string;
    result: "clean" | "infected" | "error";
    details?: string;
  } | null;
  checksum: string;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentVersionView {
  id: string;
  documentId: string;
  tenantId: string;
  version: number;
  versionLabel: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  checksum: string;
  uploadedBy: string;
  uploadReason: "initial" | "replace" | "restore";
  changeDescription: string | null;
  createdAt: string;
}

export interface UploadDocumentInput {
  title: string;
  description?: string;
  tags?: string[];
}

export interface UploadDocumentResult {
  document: DocumentPublicView;
  duplicateWarning?: { existingDocumentId: string; existingTitle: string };
}

export interface ListDocumentsInput {
  page: number;
  pageSize: number;
  status?: string;
  search?: string;
  category?: string;
  classification?: DocumentClassification;
  isArchived?: boolean;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface ListDocumentsResult {
  documents: DocumentPublicView[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalRecords: number;
  };
}

export interface UpdateDocumentMetadataInput {
  title?: string;
  description?: string;
  tags?: string[];
  category?: string;
  department?: string;
  classification?: DocumentClassification;
  owner?: string;
  effectiveDate?: string | Date | null;
  expiryDate?: string | Date | null;
  versionLabel?: string;
}

export interface UpdateDocumentMetadataResult {
  document: DocumentPublicView;
}

export interface ReplaceDocumentInput {
  changeDescription?: string;
}

export interface ReplaceDocumentResult {
  document: DocumentPublicView;
}

export interface ArchiveDocumentResult {
  document: DocumentPublicView;
}

export interface ListVersionsResult {
  versions: DocumentVersionView[];
}
