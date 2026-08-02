import type { ModelAdapter } from "../agents/agents.types.js";
import { logger } from "../../common/logger/logger.js";
import type {
  CitationVerificationResult,
  CitationVerificationInput,
  CitationVerificationAgent,
} from "./answerPipeline.types.js";
import { parseCitationVerificationResult } from "./answerPipeline.schemas.js";
import {
  CITATION_VERIFICATION_SYSTEM_PROMPT,
  CITATION_VERIFICATION_PROMPT_VERSION,
  buildCitationVerificationUserPrompt,
  formatClaimsForVerification,
} from "./prompts/citationVerification.prompt.js";
import { formatEvidenceForPrompt } from "./prompts/answerWriter.prompt.js";

const EMPTY_VERIFICATION_RESULT: CitationVerificationResult = {
  claims: [],
  overallSupport: "none",
  unsupportedCount: 0,
  tokenUsage: { totalTokens: 0 },
};

export class CitationVerificationLLMAgent implements CitationVerificationAgent {
  readonly promptVersion = CITATION_VERIFICATION_PROMPT_VERSION;

  constructor(private readonly model: ModelAdapter) {}

  async execute(
    input: CitationVerificationInput,
  ): Promise<CitationVerificationResult> {
    const start = Date.now();

    if (input.draftAnswer.claims.length === 0) {
      return EMPTY_VERIFICATION_RESULT;
    }

    const claimsText = formatClaimsForVerification(input.draftAnswer.claims);

    const evidenceText = formatEvidenceForPrompt(
      input.evidenceBundle.items.map((item) => ({
        textExcerpt: item.textExcerpt,
        documentId: item.citationAnchor.documentId,
        chunkId: item.citationAnchor.chunkId,
        documentVersionId: item.citationAnchor.documentVersionId,
        pageNumber: item.citationAnchor.pageNumber,
        sectionTitle: item.citationAnchor.sectionTitle,
      })),
    );

    const userPrompt = buildCitationVerificationUserPrompt(
      claimsText,
      evidenceText,
    );

    try {
      const response = await this.model.complete({
        messages: [
          { role: "system", content: CITATION_VERIFICATION_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0,
        maxTokens: 1500,
      });

      const content = response.choices[0]?.message?.content ?? "";
      const result = parseCitationVerificationResult(content);
      result.tokenUsage = { totalTokens: response.usage.totalTokens };

      logger.info(
        {
          claimsCount: result.claims.length,
          overallSupport: result.overallSupport,
          unsupportedCount: result.unsupportedCount,
          latencyMs: Date.now() - start,
          tokensUsed: response.usage.totalTokens,
        },
        "Citation Verification agent completed",
      );

      return result;
    } catch (err) {
      logger.warn(
        { err, latencyMs: Date.now() - start },
        "Citation Verification agent failed, returning empty result",
      );
      return EMPTY_VERIFICATION_RESULT;
    }
  }
}
