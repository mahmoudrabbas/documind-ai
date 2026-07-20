import { z } from "zod";

export const conflictTypeSchema = z.enum([
  "contradiction",
  "overlapping_dates",
  "inconsistent_values",
  "duplicate_content",
]);

export type ConflictType = z.infer<typeof conflictTypeSchema>;

export const conflictSeveritySchema = z.enum(["low", "medium", "high", "critical"]);

export type ConflictSeverity = z.infer<typeof conflictSeveritySchema>;

export const relationshipTypeSchema = z.enum([
  "VERSION_OF",
  "SUPERSEDES",
  "SUPERSEDED_BY",
  "DUPLICATE_OF",
  "RELATED_TO",
  "CONFLICTS_WITH",
]);

export type RelationshipType = z.infer<typeof relationshipTypeSchema>;

export const conflictEvidenceSchema = z.object({
  type: z.string(),
  sourceField: z.string(),
  sourceValue: z.unknown(),
  targetValue: z.unknown(),
  sourcePage: z.number().optional(),
  targetPage: z.number().optional(),
  explanation: z.string(),
});

export type ConflictEvidence = z.infer<typeof conflictEvidenceSchema>;

export const detectedRelationshipSchema = z.object({
  targetDocumentId: z.string(),
  relationshipType: relationshipTypeSchema,
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.object({
    type: z.string(),
    description: z.string(),
    sourceField: z.string().optional(),
  })),
  requiresApproval: z.boolean(),
});

export type DetectedRelationship = z.infer<typeof detectedRelationshipSchema>;

export const detectedConflictSchema = z.object({
  targetDocumentId: z.string(),
  conflictType: conflictTypeSchema,
  severity: conflictSeveritySchema,
  confidence: z.number().min(0).max(1),
  description: z.string(),
  evidence: z.array(conflictEvidenceSchema),
  requiresApproval: z.boolean(),
});

export type DetectedConflict = z.infer<typeof detectedConflictSchema>;

export interface DocumentComparisonInput {
  sourceDocument: {
    id: string;
    fileName: string;
    checksum: string;
    extractedText: string;
    metadata: {
      title?: string | null;
      effectiveDate?: Date | null;
      expiryDate?: Date | null;
      department?: string | null;
      classification?: string;
      tags?: string[];
      version?: number;
    };
  };
  candidateDocuments: Array<{
    id: string;
    fileName: string;
    checksum: string;
    extractedText: string;
    metadata: {
      title?: string | null;
      effectiveDate?: Date | null;
      expiryDate?: Date | null;
      department?: string | null;
      classification?: string;
      tags?: string[];
      version?: number;
    };
  }>;
}

export interface VersionConflictAgentOutput {
  relationships: DetectedRelationship[];
  conflicts: DetectedConflict[];
  summary: string;
  overallConfidence: number;
  requiresReview: boolean;
}

export interface VersionConflictAgent {
  analyzeDocument(input: DocumentComparisonInput): Promise<VersionConflictAgentOutput>;
}
