import { logger } from "../../common/logger/logger.js";
import type {
  CitationVerifierInput,
  CitationVerifierOutput,
} from "./chatAgentIO.js";
import { buildCitationVerificationDiagnostics } from "./generationDiagnostics.js";
import type { ChatAnswerDecisionValue } from "./chatWorkflowContracts.js";

const GROUNDED_ANSWER: ChatAnswerDecisionValue = "grounded_answer";

function dedupeInOrder(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

/**
 * Deterministic, provider-neutral citation verification core. Pure and
 * stateless: it never loads evidence, never resolves identity, and never calls
 * a model.
 *
 * Invariant enforced: a `grounded_answer` may only survive when at least one
 * cited chunk id is a member of the approved evidence bundle (the
 * server-authorized, reranker-approved ids). Invalid cited ids are stripped
 * from the surviving answer; when NO citation survives, the answer fails
 * closed to MISSING_CITATIONS so the consumer downgrades it.
 * Non-grounded answers carry no claims to validate and are reported as
 * skipped (verified: true, zero citations). Claim-level checks
 * (unsupportedClaims) are an explicit extension point and stay empty.
 */
export class CitationVerificationService {
  static verify(request: CitationVerifierInput): CitationVerifierOutput {
    const cited = dedupeInOrder(request.citedChunkIds);
    const approved = dedupeInOrder(request.approvedEvidenceIds ?? []);

    let output: CitationVerifierOutput;
    if (request.decision !== GROUNDED_ANSWER) {
      output = {
        verified: true,
        validatedCitationIds: [],
        rejectedCitationIds: [],
        unsupportedClaims: [],
        reasonCode: "CITATIONS_SKIPPED",
      };
    } else {
      const approvedSet = new Set(approved);
      const validated: string[] = [];
      const rejected: string[] = [];
      for (const id of cited) {
        if (approvedSet.has(id)) {
          validated.push(id);
        } else {
          rejected.push(id);
        }
      }

      // Deterministic display order: follow the approved-evidence (reranker
      // bundle) order for validated ids so citations render consistently.
      if (approved.length > 0 && validated.length > 0) {
        const rank = new Map(approved.map((id, index) => [id, index]));
        validated.sort((a, b) => rank.get(a)! - rank.get(b)!);
      }

      // Grounded answers only fail closed when NO citation survives validation:
      // partially-invalid outputs keep grounded with the validated subset (the
      // rejected ids are dropped, never persisted or exposed). Rejected ids are
      // still reported so consumers can audit which cited ids were stripped.
      const verified = validated.length > 0;
      output = {
        verified,
        validatedCitationIds: validated,
        rejectedCitationIds: rejected,
        unsupportedClaims: [],
        reasonCode: verified ? "CITATIONS_VERIFIED" : "MISSING_CITATIONS",
      };
    }

    // Issue 6 observability: one metadata-only log per verification. Built by
    // buildCitationVerificationDiagnostics; carries decisions, counts, and the
    // reason code only — never chunk ids, document ids, or content.
    logger.info(
      buildCitationVerificationDiagnostics(request, output),
      "citation verification outcome",
    );
    return output;
  }
}
