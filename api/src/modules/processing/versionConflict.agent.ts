import { z } from "zod";
import type { ModelAdapter } from "../agents/agents.types.js";
import { logger } from "../../common/logger/logger.js";
import type {
  VersionConflictAgent,
  DocumentComparisonInput,
  VersionConflictAgentOutput,
} from "./ports/versionConflictAgent.port.js";
import {
  detectedRelationshipSchema,
  detectedConflictSchema,
} from "./ports/versionConflictAgent.port.js";
import {
  VERSION_CONFLICT_SYSTEM_PROMPT,
  VERSION_CONFLICT_PROMPT_VERSION,
  buildVersionConflictUserPrompt,
} from "./prompts/versionConflict.prompt.js";

const VersionConflictOutputSchema = z.object({
  relationships: z.array(detectedRelationshipSchema),
  conflicts: z.array(detectedConflictSchema),
  summary: z.string(),
  overallConfidence: z.number().min(0).max(1),
  requiresReview: z.boolean(),
});

const EMPTY_OUTPUT: VersionConflictAgentOutput = {
  relationships: [],
  conflicts: [],
  summary: "Failed to analyze document relationships",
  overallConfidence: 0,
  requiresReview: true,
};

export class VersionConflictLLMAgent implements VersionConflictAgent {
  readonly promptVersion = VERSION_CONFLICT_PROMPT_VERSION;

  constructor(private readonly model: ModelAdapter) {}

  async analyzeDocument(input: DocumentComparisonInput): Promise<VersionConflictAgentOutput> {
    const start = Date.now();

    if (input.candidateDocuments.length === 0) {
      return {
        relationships: [],
        conflicts: [],
        summary: `No candidate documents to compare with "${input.sourceDocument.fileName}".`,
        overallConfidence: 0,
        requiresReview: false,
      };
    }

    const userPrompt = buildVersionConflictUserPrompt(
      input.sourceDocument.fileName,
      input.sourceDocument.extractedText,
      input.sourceDocument.metadata as Record<string, unknown>,
      input.candidateDocuments.map((c) => ({
        id: c.id,
        fileName: c.fileName,
        extractedText: c.extractedText,
        metadata: c.metadata as Record<string, unknown>,
      })),
    );

    try {
      const response = await this.model.complete({
        messages: [
          { role: "system", content: VERSION_CONFLICT_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        maxTokens: 4000,
      });

      const content = response.choices[0]?.message?.content ?? "";
      const parsed = VersionConflictOutputSchema.parse(JSON.parse(
        content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim(),
      ));

      logger.info(
        {
          relationshipsCount: parsed.relationships.length,
          conflictsCount: parsed.conflicts.length,
          overallConfidence: parsed.overallConfidence,
          latencyMs: Date.now() - start,
          tokensUsed: response.usage.totalTokens,
        },
        "Version Conflict LLM agent completed",
      );

      return parsed;
    } catch (err) {
      logger.warn(
        { err, latencyMs: Date.now() - start },
        "Version Conflict LLM agent failed, returning empty output",
      );
      return EMPTY_OUTPUT;
    }
  }
}
