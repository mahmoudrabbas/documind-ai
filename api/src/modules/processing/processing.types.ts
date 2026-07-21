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

export type QualityStatus = "READY" | "READY_WITH_WARNINGS" | "REVIEW_REQUIRED" | "FAILED" | "READY_FOR_INDEXING" | "REJECTED";

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

export interface TriggerOcrInput {
  documentId: string;
  version?: number;
  language?: OcrLanguage;
  pageNumbers?: number[];
}

export interface ReviewQualityInput {
  decision: ReviewDecision;
  notes?: string;
  pageNumbers?: number[];
}

export interface RetryOcrInput {
  pageNumbers?: number[];
  version?: number;
}

export interface OcrUsageSummaryView {
  tenantId: string;
  pagesUsed: number;
  periodStart: string;
  periodEnd: string;
}

export type MetadataFieldType =
  | "title"
  | "documentType"
  | "department"
  | "effectiveDate"
  | "expiryDate"
  | "version"
  | "owner"
  | "language"
  | "classification"
  | "tags"
  | "accessRecommendation"
  | "description";

export type CandidateStatus = "pending" | "approved" | "rejected" | "superseded";

export interface MetadataCandidateView {
  id: string;
  documentId: string;
  tenantId: string;
  documentVersion: number;
  fieldType: MetadataFieldType;
  proposedValue: unknown;
  confidence: number;
  evidence: Array<{
    type: string;
    description: string;
    sourceField?: string;
    sourcePage?: number;
    sourceText?: string;
  }>;
  agentName: string;
  status: CandidateStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  appliedValue: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewCandidateInput {
  decision: "approved" | "rejected";
  appliedValue?: unknown;
  notes?: string;
}

export type RelationshipType =
  | "VERSION_OF"
  | "SUPERSEDES"
  | "SUPERSEDED_BY"
  | "DUPLICATE_OF"
  | "RELATED_TO"
  | "CONFLICTS_WITH";

export type RelationshipStatus = "active" | "pending" | "rejected" | "superseded";

export interface DocumentRelationshipView {
  id: string;
  sourceDocumentId: string;
  targetDocumentId: string;
  tenantId: string;
  relationshipType: RelationshipType;
  confidence: number;
  evidence: Array<{
    type: string;
    description: string;
    sourceField?: string;
  }>;
  status: RelationshipStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ConflictType = "contradiction" | "overlapping_dates" | "inconsistent_values" | "duplicate_content";

export type ConflictSeverity = "low" | "medium" | "high" | "critical";

export type ConflictStatus = "detected" | "reviewing" | "resolved" | "dismissed" | "escalated";

export type ConflictResolution = "keep_source" | "keep_target" | "merge" | "archive_both" | "escalate";

export interface ConflictFindingView {
  id: string;
  sourceDocumentId: string;
  targetDocumentId: string;
  tenantId: string;
  conflictType: ConflictType;
  severity: ConflictSeverity;
  description: string;
  evidence: Array<{
    type: string;
    sourceField: string;
    sourceValue: unknown;
    targetValue: unknown;
    sourcePage?: number;
    targetPage?: number;
    explanation: string;
  }>;
  status: ConflictStatus;
  resolution: ConflictResolution | null;
  resolutionNotes: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResolveConflictInput {
  resolution: ConflictResolution;
  notes?: string;
}

export interface TriggerMetadataAnalysisInput {
  documentId: string;
  version?: number;
}

export interface TriggerVersionConflictAnalysisInput {
  documentId: string;
  candidateDocumentIds?: string[];
}
