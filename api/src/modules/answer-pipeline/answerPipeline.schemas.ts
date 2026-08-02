import { z } from "zod";

const TokenUsageSchema = z.object({
  totalTokens: z.number().int().min(0),
});

// ---------------------------------------------------------------------------
// Claim
// ---------------------------------------------------------------------------

export const ClaimSchema = z.object({
  id: z.string().min(1).max(40),
  text: z.string().min(1).max(2000),
  evidenceItemIndices: z.array(z.number().int().min(0)).min(1),
  confidence: z.enum(["high", "medium", "low"]),
  citationAnchors: z.array(
    z.object({
      chunkId: z.string().min(1),
      documentId: z.string().min(1),
      documentVersionId: z.string().min(1),
      pageNumber: z.number().int().positive().optional(),
      sectionTitle: z.string().optional(),
    }),
  ),
});

// ---------------------------------------------------------------------------
// Draft Answer
// ---------------------------------------------------------------------------

export const DraftAnswerSchema = z.object({
  answerText: z.string().min(1).max(5000),
  language: z.enum(["en", "ar", "mixed"]),
  claims: z.array(ClaimSchema).min(0).max(20),
  uncertainty: z.string().max(1000).nullable(),
  refusalCandidate: z.boolean(),
  refusalReason: z.string().max(500).nullable(),
  tokenUsage: TokenUsageSchema.optional().default({ totalTokens: 0 }),
});

// ---------------------------------------------------------------------------
// Verified Claim
// ---------------------------------------------------------------------------

export const VerifiedClaimSchema = z.object({
  claimId: z.string().min(1).max(40),
  status: z.enum(["supported", "partially_supported", "unsupported"]),
  correctedAnchors: z.array(
    z.object({
      chunkId: z.string().min(1),
      documentId: z.string().min(1),
      documentVersionId: z.string().min(1),
      pageNumber: z.number().int().positive().optional(),
      sectionTitle: z.string().optional(),
    }),
  ),
  reason: z.string().max(500).nullable(),
});

// ---------------------------------------------------------------------------
// Citation Verification Result
// ---------------------------------------------------------------------------

export const CitationVerificationResultSchema = z.object({
  claims: z.array(VerifiedClaimSchema),
  overallSupport: z.enum(["full", "partial", "none"]),
  unsupportedCount: z.number().int().min(0),
  tokenUsage: TokenUsageSchema.optional().default({ totalTokens: 0 }),
});

// ---------------------------------------------------------------------------
// Compliance Result
// ---------------------------------------------------------------------------

export const ComplianceResultSchema = z.object({
  authorized: z.boolean(),
  promptInjectionDetected: z.boolean(),
  unsupportedClaims: z.boolean(),
  unsafeDisclosure: z.boolean(),
  conflictingEvidenceHandled: z.boolean(),
  languageCompliant: z.boolean(),
  refusalRequired: z.boolean(),
  refusalReason: z.string().max(500).nullable(),
  flags: z.array(z.string().max(100)),
  tokenUsage: TokenUsageSchema.optional().default({ totalTokens: 0 }),
});

// ---------------------------------------------------------------------------
// Knowledge Gap Candidate
// ---------------------------------------------------------------------------

export const KnowledgeGapCandidateSchema = z.object({
  question: z.string().min(1).max(2000),
  language: z.enum(["en", "ar", "mixed"]),
  outcome: z.enum(["refused", "weak", "conflict"]),
  confidence: z.number().min(0).max(1),
  traceId: z.string().min(1).max(128),
  tenantId: z.string().min(1).max(64),
  actorId: z.string().min(1).max(64),
  evidenceSummaryIds: z.array(z.string()),
  conflictingClaimCount: z.number().int().min(0),
  unsupportedClaimCount: z.number().int().min(0),
  detectedAt: z.string().datetime(),
});

// ---------------------------------------------------------------------------
// Draft Answer JSON parse + validate
// ---------------------------------------------------------------------------

export function parseDraftAnswer(raw: string): z.infer<typeof DraftAnswerSchema> {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed: unknown = JSON.parse(cleaned);
  return DraftAnswerSchema.parse(parsed);
}

// ---------------------------------------------------------------------------
// Citation Verification JSON parse + validate
// ---------------------------------------------------------------------------

export function parseCitationVerificationResult(
  raw: string,
): z.infer<typeof CitationVerificationResultSchema> {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed: unknown = JSON.parse(cleaned);
  return CitationVerificationResultSchema.parse(parsed);
}

// ---------------------------------------------------------------------------
// Compliance Result JSON parse + validate
// ---------------------------------------------------------------------------

export function parseComplianceResult(
  raw: string,
): z.infer<typeof ComplianceResultSchema> {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed: unknown = JSON.parse(cleaned);
  return ComplianceResultSchema.parse(parsed);
}
