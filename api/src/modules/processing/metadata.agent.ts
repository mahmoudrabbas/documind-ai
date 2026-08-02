import { z } from "zod";
import type { ModelAdapter } from "../agents/agents.types.js";
import { logger } from "../../common/logger/logger.js";
import type {
  MetadataAgent,
  ExtractionArtifacts,
  MetadataAgentOutput,
} from "./ports/metadataAgent.port.js";
import { metadataCandidateSchema } from "./ports/metadataAgent.port.js";
import {
  METADATA_SYSTEM_PROMPT,
  METADATA_PROMPT_VERSION,
  buildMetadataUserPrompt,
} from "./prompts/metadata.prompt.js";

const MetadataOutputSchema = z.object({
  candidates: z.array(metadataCandidateSchema),
  summary: z.string(),
  overallConfidence: z.number().min(0).max(1),
  requiresReview: z.boolean(),
});

const EMPTY_OUTPUT: MetadataAgentOutput = {
  candidates: [],
  summary: "Failed to extract metadata",
  overallConfidence: 0,
  requiresReview: true,
};

export class MetadataLLMAgent implements MetadataAgent {
  readonly promptVersion = METADATA_PROMPT_VERSION;

  constructor(private readonly model: ModelAdapter) {}

  async proposeMetadata(artifacts: ExtractionArtifacts): Promise<MetadataAgentOutput> {
    const start = Date.now();

    const userPrompt = buildMetadataUserPrompt(
      artifacts.fileName,
      artifacts.mimeType,
      artifacts.extractedText,
      artifacts.pageCount,
      artifacts.language,
      artifacts.title,
      artifacts.author,
      artifacts.creationDate,
      artifacts.modificationDate,
      artifacts.existingMetadata ?? null,
    );

    try {
      const response = await this.model.complete({
        messages: [
          { role: "system", content: METADATA_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        maxTokens: 3000,
      });

      const content = response.choices[0]?.message?.content ?? "";
      const parsed = MetadataOutputSchema.parse(JSON.parse(
        content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim(),
      ));

      logger.info(
        {
          candidateCount: parsed.candidates.length,
          overallConfidence: parsed.overallConfidence,
          requiresReview: parsed.requiresReview,
          latencyMs: Date.now() - start,
          tokensUsed: response.usage.totalTokens,
        },
        "Metadata LLM agent completed",
      );

      return parsed;
    } catch (err) {
      logger.warn(
        { err, latencyMs: Date.now() - start },
        "Metadata LLM agent failed, returning empty output",
      );
      return EMPTY_OUTPUT;
    }
  }
}
