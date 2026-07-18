export type OcrLanguage = "ar" | "en" | "ar+en";

export type QualityIssueType =
  | "blank_page"
  | "unreadable"
  | "garbled_text"
  | "broken_table"
  | "rotated_page"
  | "duplicated_page"
  | "low_confidence"
  | "low_text_density"
  | "mixed_language_mismatch";

export type QualityIssueSeverity = "info" | "warning" | "critical";

export interface QualityIssue {
  type: QualityIssueType;
  severity: QualityIssueSeverity;
  message: string;
  pageNumber: number;
}

export type QualityStatus = "READY" | "READY_WITH_WARNINGS" | "REVIEW_REQUIRED" | "FAILED";

export type ReviewDecision = "approved" | "rejected" | "retry";

export type OcrPageStatus = "pending" | "processing" | "completed" | "failed" | "retry";

export interface OcrPageResultView {
  id: string;
  documentId: string;
  tenantId: string;
  documentVersion: number;
  pageNumber: number;
  text: string;
  confidence: number;
  language: OcrLanguage;
  provider: string;
  providerModel: string;
  durationMs: number;
  costUsd: number;
  warnings: string[];
  status: OcrPageStatus;
  failureReason: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentQualityView {
  id: string;
  documentId: string;
  tenantId: string;
  documentVersion: number;
  overallConfidence: number;
  qualityStatus: QualityStatus;
  issues: QualityIssue[];
  pageConfidences: Record<string, number>;
  pageStatuses: Record<string, QualityStatus>;
  summary: string;
  requiresReview: boolean;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewDecision: ReviewDecision | null;
  reviewNotes: string | null;
  ocrProvider: string;
  ocrModelVersion: string;
  totalPagesProcessed: number;
  totalPagesOcr: number;
  totalCostUsd: number;
  durationMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface OcrTriggerResponse {
  message: string;
  jobId: string;
  idempotencyKey: string;
}

export interface OcrPageResultsResponse {
  success: boolean;
  data: {
    pages: OcrPageResultView[];
  };
}

export interface DocumentQualityResponse {
  success: boolean;
  data: DocumentQualityView | null;
}

export interface OcrUsageSummaryResponse {
  success: boolean;
  data: {
    pagesUsed: number;
    periodStart: string;
    periodEnd: string;
  };
}

export interface ReviewQualityResponse {
  success: boolean;
  data: DocumentQualityView;
}
