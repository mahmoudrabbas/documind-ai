/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CampaignLLMAgent } from "../ports/campaignAgent.agent.js";
import { FakeCampaignAgent } from "../ports/fakeCampaignAgent.js";
import type { CampaignAnalysisInput, CampaignProgressInput, CampaignSummaryInput } from "../ports/campaignAgent.port.js";

class FakeModel {
  readonly providerKey = "fake";
  private readonly responseText: string;

  constructor(responseText: string) {
    this.responseText = responseText;
  }

  async complete(): Promise<any> {
    return {
      choices: [{ message: { content: this.responseText } }],
    };
  }
}

const sampleInput: CampaignAnalysisInput = {
  fileName: "employees.xlsx",
  totalRows: 50,
  columnHeaders: ["email", "firstName", "lastName", "department"],
  validationSummary: {
    valid: 47,
    warning: 1,
    invalid: 2,
    duplicates: 3,
    alreadyRegistered: 1,
    alreadyInvited: 0,
  },
  sampleRows: [
    { email: "alice@example.com", firstName: "Alice", lastName: "Smith", department: "Engineering" },
    { email: "bob@example.com", firstName: "Bob", lastName: "Jones", department: "Marketing" },
  ],
};

const progressInput: CampaignProgressInput = {
  state: "RUNNING",
  metrics: { totalRows: 50, created: 20, failed: 0, sent: 18, failedSends: 2 },
};

const summaryInput: CampaignSummaryInput = {
  metrics: {
    totalRows: 50,
    valid: 47,
    warning: 1,
    invalid: 2,
    duplicates: 3,
    alreadyRegistered: 1,
    alreadyInvited: 0,
    created: 45,
    failed: 2,
    sent: 43,
    failedSends: 4,
    retryCount: 1,
    durationMs: 120000,
  },
};

describe("CampaignLLMAgent", () => {
  it("analyzeSpreadsheet returns parsed JSON from model", async () => {
    const model = new FakeModel(JSON.stringify({
      analysis: "Spreadsheet contains 50 employees for onboarding.",
      recommendations: ["Review 2 invalid emails.", "Check 3 duplicates."],
      autoConfirm: false,
    }));
    const agent = new CampaignLLMAgent(model as any);
    const result = await agent.analyzeSpreadsheet(sampleInput);
    assert.equal(result.analysis, "Spreadsheet contains 50 employees for onboarding.");
    assert.equal(result.recommendations.length, 2);
    assert.equal(result.autoConfirm, false);
  });

  it("analyzeSpreadsheet falls back when model returns garbage", async () => {
    const model = new FakeModel("not valid json");
    const agent = new CampaignLLMAgent(model as any);
    const result = await agent.analyzeSpreadsheet(sampleInput);
    assert.ok(result.analysis.length > 0);
    assert.equal(result.autoConfirm, false);
  });

  it("analyzeSpreadsheet falls back when model throws", async () => {
    const model = {
      providerKey: "fake",
      async complete() {
        throw new Error("Model failed");
      },
    };
    const agent = new CampaignLLMAgent(model as any);
    const result = await agent.analyzeSpreadsheet(sampleInput);
    assert.ok(result.analysis.length > 0);
  });

  it("generateProgressNarrative returns model output", async () => {
    const model = new FakeModel("Sending invitations — 18 of 50 sent so far...");
    const agent = new CampaignLLMAgent(model as any);
    const result = await agent.generateProgressNarrative(progressInput);
    assert.ok(result.includes("18"));
  });

  it("generateProgressNarrative falls back on error", async () => {
    const model = {
      providerKey: "fake",
      async complete() {
        throw new Error("fail");
      },
    };
    const agent = new CampaignLLMAgent(model as any);
    const result = await agent.generateProgressNarrative(progressInput);
    assert.ok(result.length > 0);
  });

  it("generateCampaignSummary returns model output", async () => {
    const model = new FakeModel("Successfully invited 43 of 47 eligible employees.");
    const agent = new CampaignLLMAgent(model as any);
    const result = await agent.generateCampaignSummary(summaryInput);
    assert.ok(result.includes("43"));
  });

  it("generateCampaignSummary falls back on error", async () => {
    const model = {
      providerKey: "fake",
      async complete() {
        throw new Error("fail");
      },
    };
    const agent = new CampaignLLMAgent(model as any);
    const result = await agent.generateCampaignSummary(summaryInput);
    assert.ok(result.length > 0);
  });

  it("reports prompt version", () => {
    const model = new FakeModel("");
    const agent = new CampaignLLMAgent(model as any);
    assert.equal(agent.promptVersion, "1.0.0");
  });
});

describe("FakeCampaignAgent", () => {
  it("analyzeSpreadsheet returns deterministic results", async () => {
    const agent = new FakeCampaignAgent();
    const result = await agent.analyzeSpreadsheet(sampleInput);
    assert.ok(result.analysis.length > 0);
    assert.ok(result.recommendations.length > 0);
    assert.equal(result.autoConfirm, false);
  });

  it("generates progress narrative for each state", async () => {
    const agent = new FakeCampaignAgent();
    const running = await agent.generateProgressNarrative({ state: "RUNNING", metrics: { totalRows: 50, created: 20, failed: 0, sent: 18, failedSends: 2 } });
    assert.ok(running.includes("Sending"));
    const completed = await agent.generateProgressNarrative({ state: "COMPLETED", metrics: { totalRows: 50, created: 45, failed: 2, sent: 43, failedSends: 4 } });
    assert.ok(completed.includes("complete"));
  });

  it("generates campaign summary from metrics", async () => {
    const agent = new FakeCampaignAgent();
    const summary = await agent.generateCampaignSummary(summaryInput);
    assert.ok(summary.includes("45")); // created count
    assert.ok(summary.includes("43")); // sent count
  });
});

describe("CampaignAgentFactory", () => {
  it("returns FakeCampaignAgent when FAKE_AGENT is true", async () => {
    const orig = process.env.FAKE_AGENT;
    process.env.FAKE_AGENT = "true";
    const { CampaignAgentFactory } = await import("../ports/campaignAgent.port.js");
    const agent = await CampaignAgentFactory.fromEnv();
    assert.ok(agent instanceof FakeCampaignAgent || agent.constructor.name === "FakeCampaignAgent");
    process.env.FAKE_AGENT = orig;
  });
});
