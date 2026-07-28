export type GapStatus = "open" | "triaged" | "assigned" | "resolved" | "dismissed" | "reopened";
export type GapSeverity = "low" | "medium" | "high" | "critical";
export type GapSource = "refusal" | "weak_answer" | "conflict" | "negative_feedback" | "manual";
export type GapCandidateOutcome = "refused" | "weak" | "conflict" | "negative_feedback";
export type ReevaluationOutcome = "improved" | "not_improved" | "error";

export interface AgentProposal {
  topic: string;
  severity: GapSeverity;
  department?: string | null;
  suggestedAction?: string | null;
  requiredDocumentType?: string | null;
  duplicateGapId?: string | null;
  confidence: number;
  reasoning?: string | null;
}

export interface GapAuditRecord {
  action: string;
  actorId: string;
  timestamp: string;
  changes?: Record<string, unknown>;
}

export interface KnowledgeGap {
  id: string;
  tenantId: string;
  status: GapStatus;
  severity: GapSeverity;
  topic: string;
  representativeQuestion: string;
  normalizedIntent?: string | null;
  department?: string | null;
  departmentId?: string | null;
  clusterKey: string;
  occurrenceCount: number;
  firstOccurrence: string;
  lastOccurrence: string;
  assigneeId?: string | null;
  dueDate?: string | null;
  linkedDocumentIds: string[];
  resolutionNotes?: string | null;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  dismissedBy?: string | null;
  dismissedAt?: string | null;
  dismissalReason?: string | null;
  source: GapSource;
  sourceMetadata?: Record<string, unknown>;
  agentProposal?: AgentProposal | null;
  auditHistory: GapAuditRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface GapOccurrence {
  id: string;
  tenantId: string;
  gapId: string;
  question: string;
  normalizedIntent?: string | null;
  outcome: GapCandidateOutcome;
  category?: string | null;
  confidence: number;
  evidenceSummaryIds?: string[];
  conversationId?: string | null;
  messageId?: string | null;
  actorId?: string | null;
  actorDepartment?: string | null;
  traceId?: string | null;
  createdAt: string;
}

export interface GapReevaluation {
  id: string;
  tenantId: string;
  gapId: string;
  documentId: string;
  result: ReevaluationOutcome;
  evidenceBefore?: Record<string, unknown> | null;
  evidenceAfter?: Record<string, unknown> | null;
  notes?: string | null;
  evaluatedBy: string;
  createdAt: string;
}

export interface GapMetrics {
  totalGaps: number;
  byStatus: Record<GapStatus, number>;
  bySeverity: Record<GapSeverity, number>;
  bySource: Record<GapSource, number>;
  byDepartment: Record<string, number>;
  topUnresolved: KnowledgeGap[];
  resolutionRate: number;
}

export interface ListGapsQuery {
  page?: number;
  pageSize?: number;
  status?: GapStatus;
  severity?: GapSeverity;
  source?: GapSource;
  department?: string;
  assigneeId?: string;
  search?: string;
  sortBy?: "createdAt" | "updatedAt" | "occurrenceCount" | "severity";
  sortOrder?: "asc" | "desc";
}
