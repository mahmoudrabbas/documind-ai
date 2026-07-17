export type DocumentClassification = "public" | "internal" | "confidential" | "restricted";

export interface DocumentView {
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

export interface DocumentListResponse {
  success: boolean;
  data: {
    documents: DocumentView[];
    pagination: {
      page: number;
      pageSize: number;
      totalPages: number;
      totalRecords: number;
    };
  };
}

export interface SingleDocumentResponse {
  success: boolean;
  data: {
    document: DocumentView;
    duplicateWarning?: {
      existingDocumentId: string;
      existingTitle: string;
    };
  };
}

export interface DeleteDocumentResponse {
  success: boolean;
  message: string;
}

export interface DocumentVersionsResponse {
  success: boolean;
  data: {
    versions: DocumentVersionView[];
  };
}
