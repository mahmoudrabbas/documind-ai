import type {
  CampaignAgent,
  CampaignAnalysisInput,
  CampaignAnalysisResult,
  CampaignProgressInput,
  CampaignSummaryInput,
} from "./campaignAgent.port.js";

export class FakeCampaignAgent implements CampaignAgent {
  readonly promptVersion = "1.0.0";

  async analyzeSpreadsheet(_input: CampaignAnalysisInput): Promise<CampaignAnalysisResult> {
    return {
      analysis: "Spreadsheet contains employee data ready for invitation.",
      recommendations: [
        "All valid employees appear ready for invitation.",
        "Review the 3 invalid email addresses before proceeding.",
      ],
      autoConfirm: _input.validationSummary.invalid === 0 && _input.validationSummary.duplicates === 0,
    };
  }

  async generateProgressNarrative(input: CampaignProgressInput): Promise<string> {
    if (input.state === "RUNNING") {
      return `Sending invitations — ${input.metrics.sent} of ${input.metrics.totalRows} sent so far...`;
    }
    if (input.state === "COMPLETED") {
      return `Campaign complete — ${input.metrics.sent} invitations delivered successfully.`;
    }
    if (input.state === "FAILED") {
      return "Campaign failed. Please check the error details.";
    }
    return "Campaign in progress...";
  }

  async generateCampaignSummary(input: CampaignSummaryInput): Promise<string> {
    const m = input.metrics;
    const total = m.created + m.failed;
    if (total === 0) return "No employees were processed in this campaign.";
    return [
      `Processed ${total} employee(s): ${m.created} created successfully, ${m.failed} failed.`,
      m.sent > 0 ? ` ${m.sent} invitation(s) sent, ${m.failedSends} failed.` : "",
      m.retryCount > 0 ? ` ${m.retryCount} retries were attempted.` : "",
    ].join("");
  }
}

export function createFakeCampaignAgent(): FakeCampaignAgent {
  return new FakeCampaignAgent();
}
