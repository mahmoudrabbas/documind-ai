import type { GapSeverity } from "../../db/models/knowledgeGap.model.js";
import type { GapCandidateOutcome } from "../../db/models/gapOccurrence.model.js";

export interface GapCandidateInput {
  question: string;
  normalizedIntent?: string;
  outcome: GapCandidateOutcome;
  category?: string;
  confidence: number;
  evidenceSummaryIds?: string[];
  actorDepartment?: string;
}

export interface GapAgentProposal {
  topic: string;
  severity: GapSeverity;
  department?: string | null;
  suggestedAction?: string | null;
  requiredDocumentType?: string | null;
  duplicateGapId?: string | null;
  confidence: number;
  reasoning: string;
}

export interface KnowledgeGapAgentPort {
  proposeGapAnalysis(input: GapCandidateInput): Promise<GapAgentProposal>;
}
