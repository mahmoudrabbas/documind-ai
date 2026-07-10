export interface DocumentPublicView {
  id: string;
  tenantId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: "uploading" | "uploaded" | "processing" | "processed" | "failed";
  metadata: {
    title: string | null;
    description: string | null;
    tags: string[];
  };
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface UploadDocumentInput {
  title: string;
  description?: string;
  tags?: string[];
}

export interface UploadDocumentResult {
  document: DocumentPublicView;
}

export interface ListDocumentsInput {
  page: number;
  pageSize: number;
  status?: string;
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
}

export interface UpdateDocumentMetadataResult {
  document: DocumentPublicView;
}
