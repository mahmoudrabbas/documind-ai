export interface DocumentView {
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
  };
}

export interface DeleteDocumentResponse {
  success: boolean;
  message: string;
}
