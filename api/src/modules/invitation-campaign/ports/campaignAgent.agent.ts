import type { ModelAdapter } from "../../agents/agents.types.js";
import { logger } from "../../../common/logger/logger.js";
import type {
  CampaignAgent,
  CampaignAnalysisInput,
  CampaignAnalysisResult,
  CampaignProgressInput,
  CampaignSummaryInput,
} from "./campaignAgent.port.js";
import {
  CAMPAIGN_AGENT_PROMPT_VERSION,
  CAMPAIGN_ANALYSIS_SYSTEM_PROMPT,
  PROGRESS_NARRATIVE_SYSTEM_PROMPT,
  SUMMARY_SYSTEM_PROMPT,
  buildCampaignAnalysisUserPrompt,
  buildProgressNarrativeUserPrompt,
  buildCampaignSummaryUserPrompt,
} from "../prompts/campaignPlan.prompt.js";

const DEFAULT_ANALYSIS_RESULT: CampaignAnalysisResult = {
  analysis: "Spreadsheet analysis is unavailable. Proceed with caution.",
  recommendations: ["Review the employee list manually before sending."],
  autoConfirm: false,
};

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    const cleaned = raw
      .replace(/```(?:json)?\s*/gi, "")
      .replace(/\s*```/g, "")
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

export class CampaignLLMAgent implements CampaignAgent {
  readonly promptVersion = CAMPAIGN_AGENT_PROMPT_VERSION;

  constructor(private readonly model: ModelAdapter) {}

  async analyzeSpreadsheet(input: CampaignAnalysisInput): Promise<CampaignAnalysisResult> {
    try {
      const userPrompt = buildCampaignAnalysisUserPrompt({
        originalFileName: input.fileName,
        headers: input.columnHeaders,
        sampleRows: input.sampleRows,
        totalRows: input.totalRows,
        validationSummary: input.validationSummary,
      });
      const response = await this.model.complete({
        messages: [
          { role: "system", content: CAMPAIGN_ANALYSIS_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        maxTokens: 500,
      });

      const content = response.choices[0]?.message?.content ?? "";
      const parsed = safeJsonParse<CampaignAnalysisResult>(content, DEFAULT_ANALYSIS_RESULT);

      logger.info(
        { autoConfirm: parsed.autoConfirm, recCount: parsed.recommendations.length },
        "CampaignAgent: spreadsheet analysis completed",
      );

      return parsed;
    } catch (err) {
      logger.warn({ err }, "CampaignAgent: analysis failed, using fallback");
      return DEFAULT_ANALYSIS_RESULT;
    }
  }

  async generateProgressNarrative(input: CampaignProgressInput): Promise<string> {
    try {
      const userPrompt = buildProgressNarrativeUserPrompt(input);
      const response = await this.model.complete({
        messages: [
          { role: "system", content: PROGRESS_NARRATIVE_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        maxTokens: 100,
      });

      return response.choices[0]?.message?.content?.trim() ?? this.fallbackNarrative(input.state);
    } catch {
      return this.fallbackNarrative(input.state);
    }
  }

  async generateCampaignSummary(input: CampaignSummaryInput): Promise<string> {
    try {
      const userPrompt = buildCampaignSummaryUserPrompt(input);
      const response = await this.model.complete({
        messages: [
          { role: "system", content: SUMMARY_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        maxTokens: 200,
      });

      return response.choices[0]?.message?.content?.trim() ?? this.fallbackSummary(input);
    } catch {
      return this.fallbackSummary(input);
    }
  }

  private fallbackNarrative(state: string): string {
    switch (state) {
      case "ANALYZING":
        return "Reading spreadsheet and analyzing employee data...";
      case "AWAITING_CONFIRMATION":
        return "Campaign plan ready — awaiting your confirmation.";
      case "RUNNING":
        return "Sending invitations...";
      case "COMPLETED":
        return "Campaign completed successfully.";
      case "PARTIALLY_COMPLETED":
        return "Campaign completed with some failures.";
      case "FAILED":
        return "Campaign failed. Please check the error details.";
      default:
        return "Campaign in progress...";
    }
  }

  private fallbackSummary(input: CampaignSummaryInput): string {
    const m = input.metrics;
    const total = m.created + m.failed;
    if (total === 0) return "No employees were processed in this campaign.";
    return [
      `Processed ${total} employee(s): ${m.created} created successfully, ${m.failed} failed.`,
      m.sent > 0 ? ` ${m.sent} invitation(s) sent, ${m.failedSends} failed.` : "",
    ].join("");
  }
}
