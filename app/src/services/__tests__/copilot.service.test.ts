import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

vi.mock("@/lib/api-client", () => ({
  api: { post: vi.fn(), get: vi.fn(), delete: vi.fn() },
}));

import { api } from "@/lib/api-client";
import {
  generatePlan,
  executeStep,
  confirmStep,
  getPlan,
  cancelPlan,
  getSuggestions,
} from "@/services/copilot.service";
import type { CopilotPlan, CopilotSuggestion } from "@/types/api/copilot.types";

const plan: CopilotPlan = {
  id: "plan_1",
  summary: "Invite a new employee",
  mode: "action",
  steps: [
    {
      stepIndex: 0,
      action: "execute",
      description: "List users",
      tool: "listUsers",
      parameters: null,
      confirmationLevel: "safe",
      requiredPermission: "users:read",
      status: "pending",
      result: null,
      errorMessage: null,
    },
  ],
  estimatedDurationMs: 1000,
  createdAt: "2026-07-31T00:00:00Z",
  updatedAt: "2026-07-31T00:00:00Z",
  status: "active",
};

describe("copilot.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generatePlan posts query, mode, and currentRoute", async () => {
    (api.post as Mock).mockResolvedValue({ data: plan });

    const result = await generatePlan("Invite a user", "guide", "/dashboard");

    expect(api.post).toHaveBeenCalledWith("/copilot/plan", {
      query: "Invite a user",
      mode: "guide",
      currentRoute: "/dashboard",
    });
    expect(result).toEqual(plan);
  });

  it("generatePlan defaults to action mode", async () => {
    (api.post as Mock).mockResolvedValue({ data: plan });

    await generatePlan("Invite a user");

    const [, body] = (api.post as Mock).mock.calls[0];
    expect(body.mode).toBe("action");
  });

  it("executeStep posts planId, stepIndex, and parameters", async () => {
    const result = {
      step: { stepIndex: 0, status: "completed" },
      result: { ok: true, data: null, error: null, latencyMs: 5 },
      confirmationRequired: false,
      confirmationRequest: null,
    };
    (api.post as Mock).mockResolvedValue({ data: result });

    await executeStep("plan_1", 0, { page: 1 });

    expect(api.post).toHaveBeenCalledWith("/copilot/execute", {
      planId: "plan_1",
      stepIndex: 0,
      parameters: { page: 1 },
    });
    expect(result.result.ok).toBe(true);
  });

  it("confirmStep posts the approve decision", async () => {
    const result = {
      step: { stepIndex: 1, status: "completed" },
      result: { ok: true, data: null, error: null, latencyMs: 10 },
      confirmationRequired: false,
      confirmationRequest: null,
    };
    (api.post as Mock).mockResolvedValue({ data: result });

    await confirmStep("plan_1", 1, "approve");

    expect(api.post).toHaveBeenCalledWith("/copilot/confirm", {
      planId: "plan_1",
      stepIndex: 1,
      decision: "approve",
    });
  });

  it("getPlan fetches the plan by id", async () => {
    (api.get as Mock).mockResolvedValue({ data: plan });

    const result = await getPlan("plan_1");

    expect(api.get).toHaveBeenCalledWith("/copilot/plans/plan_1");
    expect(result.id).toBe("plan_1");
  });

  it("cancelPlan deletes the plan and returns the cancelled flag", async () => {
    (api.delete as Mock).mockResolvedValue({ data: { cancelled: true } });

    const result = await cancelPlan("plan_1");

    expect(api.delete).toHaveBeenCalledWith("/copilot/plans/plan_1");
    expect(result).toBe(true);
  });

  it("getSuggestions fetches suggestions", async () => {
    const suggestions: CopilotSuggestion[] = [
      { label: "Search documents", description: "Find documents", icon: "search", query: "search" },
    ];
    (api.get as Mock).mockResolvedValue({ data: suggestions });

    const result = await getSuggestions();

    expect(api.get).toHaveBeenCalledWith("/copilot/suggestions");
    expect(result).toEqual(suggestions);
  });
});
