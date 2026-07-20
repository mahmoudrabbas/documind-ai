import { z } from "zod";

export const metadataFieldSchema = z.enum([
  "title",
  "documentType",
  "department",
  "effectiveDate",
  "expiryDate",
  "version",
  "owner",
  "language",
  "classification",
  "tags",
  "accessRecommendation",
  "description",
]);

export type MetadataFieldType = z.infer<typeof metadataFieldSchema>;

export const metadataEvidenceSchema = z.object({
  type: z.string(),
  description: z.string(),
  sourceField: z.string().optional(),
  sourcePage: z.number().optional(),
  sourceText: z.string().optional(),
});

export type MetadataEvidence = z.infer<typeof metadataEvidenceSchema>;

export const metadataCandidateSchema = z.object({
  fieldType: metadataFieldSchema,
  proposedValue: z.unknown(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(metadataEvidenceSchema),
  requiresApproval: z.boolean(),
});

export type MetadataCandidate = z.infer<typeof metadataCandidateSchema>;

export interface ExtractionArtifacts {
  documentId: string;
  documentVersion: number;
  fileName: string;
  mimeType: string;
  extractedText: string;
  pageCount: number;
  language?: string;
  title?: string;
  author?: string;
  creationDate?: string;
  modificationDate?: string;
  checksum: string;
  existingMetadata?: {
    title?: string | null;
    description?: string | null;
    tags?: string[];
    category?: string | null;
    department?: string | null;
    classification?: string;
    effectiveDate?: Date | null;
    expiryDate?: Date | null;
  };
}

export interface MetadataAgentOutput {
  candidates: MetadataCandidate[];
  summary: string;
  overallConfidence: number;
  requiresReview: boolean;
}

export interface MetadataAgent {
  proposeMetadata(artifacts: ExtractionArtifacts): Promise<MetadataAgentOutput>;
}
