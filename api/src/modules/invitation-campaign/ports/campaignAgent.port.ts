export interface CampaignAnalysisInput {
  fileName: string;
  columnHeaders: string[];
  sampleRows: Record<string, string>[];
  totalRows: number;
  validationSummary: {
    valid: number;
    warning: number;
    invalid: number;
    duplicates: number;
    alreadyRegistered: number;
    alreadyInvited: number;
  };
}

export interface CampaignPlan {
  analysis: string;
  validCount: number;
  warningCount: number;
  invalidCount: number;
  duplicateCount: number;
  alreadyRegisteredCount: number;
  alreadyInvitedCount: number;
  totalRows: number;
  recommendations: string[];
  autoConfirm: boolean;
}

export interface CampaignProgressInput {
  state: string;
  metrics: {
    totalRows: number;
    created: number;
    failed: number;
    sent: number;
    failedSends: number;
  };
}

export interface CampaignSummaryInput {
  metrics: {
    totalRows: number;
    valid: number;
    warning: number;
    invalid: number;
    duplicates: number;
    alreadyRegistered: number;
    alreadyInvited: number;
    created: number;
    failed: number;
    sent: number;
    failedSends: number;
    retryCount: number;
    durationMs: number;
  };
}

export interface CampaignAnalysisResult {
  analysis: string;
  recommendations: string[];
  autoConfirm: boolean;
}

export interface CampaignAgent {
  readonly promptVersion: string;
  analyzeSpreadsheet(input: CampaignAnalysisInput): Promise<CampaignAnalysisResult>;
  generateProgressNarrative(input: CampaignProgressInput): Promise<string>;
  generateCampaignSummary(input: CampaignSummaryInput): Promise<string>;
}

export class CampaignAgentFactory {
  static async fromEnv(): Promise<CampaignAgent> {
    if (process.env.FAKE_AGENT === "true" || process.env.NODE_ENV === "test") {
      const { createFakeCampaignAgent } = await import("./fakeCampaignAgent.js");
      return createFakeCampaignAgent();
    }
    const { getModelAdapterAsync } = await import("../../../providers/llm/index.js");
    const { CampaignLLMAgent } = await import("./campaignAgent.agent.js");
    const model = await getModelAdapterAsync();
    return new CampaignLLMAgent(model);
  }
}
