import type {
  KnowledgeGapPort,
  KnowledgeGapCandidate,
} from "../answer-pipeline/answerPipeline.types.js";

export type { KnowledgeGapPort, KnowledgeGapCandidate };

export interface KnowledgeGap {
  id: string;
  tenantId: string;
  question: string;
  language: "en" | "ar" | "mixed";
  outcome: "refused" | "weak" | "conflict";
  confidence: number;
  status: "open" | "assigned" | "resolved" | "dismissed" | "reopened";
  severity: "low" | "medium" | "high" | "critical";
  topic: string | null;
  department: string | null;
  clusterKey: string | null;
  count: number;
  firstOccurrence: string;
  lastOccurrence: string;
  assignee: string | null;
  dueDate: string | null;
  linkedDocumentIds: string[];
  resolutionNotes: string | null;
  evidenceSummaryIds: string[];
  conflictingClaimCount: number;
  unsupportedClaimCount: number;
  traceId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
