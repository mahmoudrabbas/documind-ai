import type { ModelAdapter } from "../agents/agents.types.js";
import { logger } from "../../common/logger/logger.js";
import type { DraftAnswer, AnswerWriterInput, AnswerWriterAgent } from "./answerPipeline.types.js";
import { parseDraftAnswer } from "./answerPipeline.schemas.js";
import {
  ANSWER_WRITER_SYSTEM_PROMPT,
  ANSWER_WRITER_PROMPT_VERSION,
  buildAnswerWriterUserPrompt,
  formatEvidenceForPrompt,
} from "./prompts/answerWriter.prompt.js";

const EMPTY_DRAFT_ANSWER: DraftAnswer = {
  answerText: "",
  language: "en",
  claims: [],
  uncertainty: "Failed to parse agent output",
  refusalCandidate: true,
  refusalReason: "agent_output_parse_failure",
  tokenUsage: { totalTokens: 0 },
};

export class AnswerWriterLLMAgent implements AnswerWriterAgent {
  readonly promptVersion = ANSWER_WRITER_PROMPT_VERSION;

  constructor(private readonly model: ModelAdapter) {}

  async execute(input: AnswerWriterInput): Promise<DraftAnswer> {
    const start = Date.now();

    const evidenceText = formatEvidenceForPrompt(
      input.evidenceBundle.items.map((item) => ({
        textExcerpt: item.textExcerpt,
        documentId: item.citationAnchor.documentId,
        chunkId: item.citationAnchor.chunkId,
        documentVersionId: item.citationAnchor.documentVersionId,
        pageNumber: item.citationAnchor.pageNumber,
        sectionTitle: item.citationAnchor.sectionTitle,
        documentTitle: item.candidate.documentTitle,
      })),
    );

    const conversationContext = input.conversationContext
      .slice(-6)
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    const userPrompt = buildAnswerWriterUserPrompt(
      evidenceText,
      input.question,
      conversationContext,
    );

    try {
      const response = await this.model.complete({
        messages: [
          { role: "system", content: ANSWER_WRITER_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        maxTokens: 2000,
      });

      const content = response.choices[0]?.message?.content ?? "";
      const draft = parseDraftAnswer(content);
      draft.tokenUsage = { totalTokens: response.usage.totalTokens };

      logger.info(
        {
          claimsCount: draft.claims.length,
          refusalCandidate: draft.refusalCandidate,
          language: draft.language,
          latencyMs: Date.now() - start,
          tokensUsed: response.usage.totalTokens,
        },
        "Answer Writer agent completed",
      );

      return draft;
    } catch (err) {
      logger.warn(
        { err, latencyMs: Date.now() - start },
        "Answer Writer agent failed, returning empty draft",
      );
      return EMPTY_DRAFT_ANSWER;
    }
  }
}
