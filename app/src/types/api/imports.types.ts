export type ImportBatchStatus =
  | "PENDING_MAPPING"
  | "VALIDATING"
  | "PROCESSING"
  | "COMPLETED"
  | "PARTIALLY_COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type ImportRowState = "VALID" | "WARNING" | "INVALID";

export interface BatchSummary {
  totalRows: number;
  validRows: number;
  warningRows: number;
  invalidRows: number;
  createdCount: number;
  failedCount: number;
}

export interface ImportRowView {
  rowNumber: number;
  state: ImportRowState;
  data: Record<string, string>;
  errors?: string[];
  warnings?: string[];
}

export interface ImportBatchView {
  id: string;
  tenantId: string;
  fileName: string;
  originalFileName: string;
  status: ImportBatchStatus;
  summary: BatchSummary;
  columnMapping: Record<string, string>;
  errorMessage?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportPreview {
  batchId: string;
  originalFileName: string;
  totalRows: number;
  suggestedMapping: Record<string, string>;
  columns: string[];
  rows: ImportRowView[];
  summary: BatchSummary;
}

export interface SingleBatchResponse {
  success: true;
  data: ImportBatchView;
}

export interface BatchWithRowsResponse {
  success: true;
  data: ImportBatchView & { rows?: ImportRowView[] };
}

export interface PreviewResponse {
  success: true;
  data: ImportPreview;
}

export interface ListBatchesResponse {
  success: true;
  data: {
    batches: ImportBatchView[];
    pagination: {
      page: number;
      pageSize: number;
      totalPages: number;
      totalRecords: number;
    };
  };
}

export interface ConfirmImportResponse {
  success: true;
  data: ImportBatchView;
}

export interface UpdateMappingResponse {
  success: true;
  data: ImportPreview;
}

export interface RetryResponse {
  success: true;
  data: ImportBatchView;
}

export interface CancelResponse {
  success: true;
  data: ImportBatchView;
}
