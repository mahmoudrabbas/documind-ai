import type { CitationAnchor, EvidenceBundle } from "../reranker/reranker.types.js";

export type { EvidenceBundle, CitationAnchor, SufficiencyLevel } from "../reranker/reranker.types.js";

// ---------------------------------------------------------------------------
// Token usage — returned by every LLM agent call
// ---------------------------------------------------------------------------

export interface TokenUsage {
  totalTokens: number;
}

// ---------------------------------------------------------------------------
// Claim — a single factual assertion in the draft answer
// ---------------------------------------------------------------------------

export type ClaimConfidence = "high" | "medium" | "low";

export interface Claim {
  id: string;
  text: string;
  evidenceItemIndices: number[];
  confidence: ClaimConfidence;
  citationAnchors: CitationAnchor[];
}

// ---------------------------------------------------------------------------
// Draft Answer — raw output from the Answer Writer agent
// ---------------------------------------------------------------------------

export type AnswerLanguage = "en" | "ar" | "mixed";

export interface DraftAnswer {
  answerText: string;
  language: AnswerLanguage;
  claims: Claim[];
  uncertainty: string | null;
  refusalCandidate: boolean;
  refusalReason: string | null;
  tokenUsage: TokenUsage;
}

// ---------------------------------------------------------------------------
// Citation Verification
// ---------------------------------------------------------------------------

export type ClaimVerificationStatus =
  | "supported"
  | "partially_supported"
  | "unsupported";

export interface VerifiedClaim {
  claimId: string;
  status: ClaimVerificationStatus;
  correctedAnchors: CitationAnchor[];
  reason: string | null;
}

export type OverallSupport = "full" | "partial" | "none";

export interface CitationVerificationResult {
  claims: VerifiedClaim[];
  overallSupport: OverallSupport;
  unsupportedCount: number;
  tokenUsage: TokenUsage;
}

// ---------------------------------------------------------------------------
// Compliance Result
// ---------------------------------------------------------------------------

export interface ComplianceResult {
  authorized: boolean;
  promptInjectionDetected: boolean;
  unsupportedClaims: boolean;
  unsafeDisclosure: boolean;
  conflictingEvidenceHandled: boolean;
  languageCompliant: boolean;
  refusalRequired: boolean;
  refusalReason: string | null;
  flags: string[];
  tokenUsage: TokenUsage;
}

// ---------------------------------------------------------------------------
// Final Answer — output of the deterministic finalizer
// ---------------------------------------------------------------------------

export type AnswerOutcome =
  | "approved"
  | "refused"
  | "clarified"
  | "conflict";

export interface FinalCitation {
  claimId: string;
  claimText: string;
  status: ClaimVerificationStatus;
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  pageNumber?: number;
  sectionTitle?: string;
}

export interface FinalAnswer {
  outcome: AnswerOutcome;
  answerText: string;
  citations: FinalCitation[];
  complianceResult: ComplianceResult;
  language: AnswerLanguage;
  traceId: string;
  promptVersions: {
    answerWriter: string;
    citationVerification: string;
    compliance: string;
  };
}

// ---------------------------------------------------------------------------
// Refusal Response
// ---------------------------------------------------------------------------

export interface RefusalResponse {
  outcome: "refused";
  answerText: string;
  reason: string;
  language: AnswerLanguage;
  traceId: string;
}

// ---------------------------------------------------------------------------
// Conflict Response
// ---------------------------------------------------------------------------

export interface ConflictResponse {
  outcome: "conflict";
  answerText: string;
  conflictingClaims: string[];
  language: AnswerLanguage;
  traceId: string;
}

// ---------------------------------------------------------------------------
// Knowledge Gap Candidate — emitted for downstream processing
// ---------------------------------------------------------------------------

export type GapOutcome = "refused" | "weak" | "conflict";

export interface KnowledgeGapCandidate {
  question: string;
  language: AnswerLanguage;
  outcome: GapOutcome;
  confidence: number;
  traceId: string;
  tenantId: string;
  actorId: string;
  evidenceSummaryIds: string[];
  conflictingClaimCount: number;
  unsupportedClaimCount: number;
  detectedAt: string;
}

// ---------------------------------------------------------------------------
// Knowledge Gap Port — interface for emitting gap candidates
// ---------------------------------------------------------------------------

export interface KnowledgeGapPort {
  emitCandidate(candidate: KnowledgeGapCandidate): Promise<void>;
}

// ---------------------------------------------------------------------------
// Agent Input Types
// ---------------------------------------------------------------------------

export interface AnswerWriterInput {
  evidenceBundle: EvidenceBundle;
  question: string;
  language: AnswerLanguage;
  conversationContext: Array<{ role: "user" | "assistant"; content: string }>;
  maxClaims: number;
}

export interface CitationVerificationInput {
  draftAnswer: DraftAnswer;
  evidenceBundle: EvidenceBundle;
}

export interface ComplianceInput {
  draftAnswer: DraftAnswer;
  verificationResult: CitationVerificationResult;
  evidenceBundle: EvidenceBundle;
  userQuestion: string;
  language: AnswerLanguage;
  tenantId: string;
  actorId: string;
}

// ---------------------------------------------------------------------------
// Agent Interfaces
// ---------------------------------------------------------------------------

export interface AnswerWriterAgent {
  execute(input: AnswerWriterInput): Promise<DraftAnswer>;
}

export interface CitationVerificationAgent {
  execute(input: CitationVerificationInput): Promise<CitationVerificationResult>;
}

export interface ComplianceAgent {
  execute(input: ComplianceInput): Promise<ComplianceResult>;
}

// ---------------------------------------------------------------------------
// Pipeline Configuration
// ---------------------------------------------------------------------------

export interface AgentModelConfig {
  temperature: number;
  maxTokens: number;
  promptVersion: string;
}

export interface AnswerPipelineConfig {
  answerWriter: AgentModelConfig;
  citationVerification: AgentModelConfig;
  compliance: AgentModelConfig;
  maxRetries: number;
  maxDraftRewrites: number;
  gapEmissionEnabled: boolean;
}

export const DEFAULT_ANSWER_PIPELINE_CONFIG: AnswerPipelineConfig = {
  answerWriter: {
    temperature: 0.1,
    maxTokens: 2000,
    promptVersion: "1.0.0",
  },
  citationVerification: {
    temperature: 0,
    maxTokens: 1500,
    promptVersion: "1.0.0",
  },
  compliance: {
    temperature: 0,
    maxTokens: 1000,
    promptVersion: "1.0.0",
  },
  maxRetries: 2,
  maxDraftRewrites: 1,
  gapEmissionEnabled: true,
};

// ---------------------------------------------------------------------------
// Pipeline Input / Output
// ---------------------------------------------------------------------------

export interface AnswerPipelineInput {
  evidenceBundle: EvidenceBundle;
  question: string;
  language: AnswerLanguage;
  conversationContext: Array<{ role: "user" | "assistant"; content: string }>;
  tenantId: string;
  actorId: string;
  traceId: string;
  requestId: string;
}

export interface AnswerPipelineOutput {
  finalAnswer: FinalAnswer;
  gapCandidate: KnowledgeGapCandidate | null;
  latencyMs: number;
  totalTokensUsed: number;
  estimatedCost: number;
  retriesUsed: number;
}
