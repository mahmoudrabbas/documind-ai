import { z } from "zod";
import type { ModelAdapter } from "../../../modules/agents/agents.types.js";
import { logger } from "../../../common/logger/logger.js";
import type {
  SpreadsheetMappingAgent,
  ColumnMappingProposal,
  FieldDefinition,
} from "./spreadsheetMappingAgent.port.js";
import {
  SPREADSHEET_MAPPING_SYSTEM_PROMPT,
  SPREADSHEET_MAPPING_PROMPT_VERSION,
  buildSpreadsheetMappingUserPrompt,
} from "../prompts/spreadsheetMapping.prompt.js";

const ColumnMappingSchema = z.object({
  excelHeader: z.string(),
  targetField: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  alternatives: z.array(z.string()),
});

const SpreadsheetMappingOutputSchema = z.object({
  columnMappings: z.array(ColumnMappingSchema),
  unmappedHeaders: z.array(z.string()),
  suggestedRoleId: z.string().optional(),
  suggestedDepartmentId: z.string().optional(),
});

export class SpreadsheetMappingLLMAgent implements SpreadsheetMappingAgent {
  readonly promptVersion = SPREADSHEET_MAPPING_PROMPT_VERSION;

  constructor(private readonly model: ModelAdapter) {}

  async proposeMapping(input: {
    tenantId: string;
    headers: string[];
    sampleRows: Record<string, unknown>[];
    availableFields: FieldDefinition[];
    existingRoles: Array<{ id: string; name: string }>;
    existingDepartments: Array<{ id: string; name: string }>;
  }): Promise<ColumnMappingProposal> {
    const start = Date.now();

    const userPrompt = buildSpreadsheetMappingUserPrompt(
      input.headers,
      input.sampleRows,
      input.availableFields,
      input.existingRoles,
      input.existingDepartments,
    );

    try {
      const response = await this.model.complete({
        messages: [
          { role: "system", content: SPREADSHEET_MAPPING_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        maxTokens: 2000,
      });

      const content = response.choices[0]?.message?.content ?? "";
      const parsed = SpreadsheetMappingOutputSchema.parse(JSON.parse(
        content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim(),
      ));

      logger.info(
        {
          mappedCount: parsed.columnMappings.filter((m) => m.targetField !== null).length,
          unmappedCount: parsed.unmappedHeaders.length,
          latencyMs: Date.now() - start,
          tokensUsed: response.usage.totalTokens,
        },
        "Spreadsheet Mapping LLM agent completed",
      );

      return parsed;
    } catch (err) {
      logger.warn(
        { err, latencyMs: Date.now() - start },
        "Spreadsheet Mapping LLM agent failed, returning empty mapping",
      );
      return {
        columnMappings: input.headers.map((h) => ({
          excelHeader: h,
          targetField: null,
          confidence: "low" as const,
          alternatives: [],
        })),
        unmappedHeaders: [...input.headers],
      };
    }
  }
}
