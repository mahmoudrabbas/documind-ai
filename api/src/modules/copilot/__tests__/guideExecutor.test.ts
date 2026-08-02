import { describe, it, expect } from "vitest";
import type { CopilotPlan, CopilotStep } from "../copilot.types.js";
import { buildGuideInstructions } from "../executors/guideExecutor.js";

function makePlan(steps: CopilotStep[], mode: "guide" | "action" = "guide"): CopilotPlan {
  return {
    id: "plan-1",
    summary: "Test plan",
    mode,
    steps,
    estimatedDurationMs: 5000,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "active",
  };
}

function makeStep(overrides: Partial<CopilotStep> & { action: string }): CopilotStep {
  return {
    stepIndex: 0,
    description: "Do something",
    tool: null,
    parameters: null,
    confirmationLevel: "safe",
    requiredPermission: null,
    status: "pending",
    result: null,
    errorMessage: null,
    ...overrides,
  };
}

describe("buildGuideInstructions", () => {
  it("returns a complete instruction with a final complete step", () => {
    const plan = makePlan([
      makeStep({ stepIndex: 0, action: "navigate", description: "Go to documents page", tool: null }),
    ]);
    const guide = buildGuideInstructions(plan);
    expect(guide.instructions.length).toBeGreaterThan(0);
    expect(guide.instructions[guide.instructions.length - 1].type).toBe("complete");
  });

  it("emits navigate instruction for navigation steps", () => {
    const plan = makePlan([
      makeStep({ stepIndex: 0, action: "navigate", description: "Go to documents page", tool: null }),
    ]);
    const guide = buildGuideInstructions(plan);
    const nav = guide.instructions.find((i): i is Extract<typeof i, { type: "navigate" }> => i.type === "navigate");
    expect(nav).toBeDefined();
    expect(nav!.route).toContain("/dashboard");
  });

  it("emits waitForUser after navigate", () => {
    const plan = makePlan([
      makeStep({ stepIndex: 0, action: "navigate", description: "Go to users page", tool: null }),
    ]);
    const guide = buildGuideInstructions(plan);
    const wait = guide.instructions.find((i) => i.type === "waitForUser");
    expect(wait).toBeDefined();
  });

  it("emits showHint for tool steps", () => {
    const plan = makePlan([
      makeStep({
        stepIndex: 0,
        action: "searchDocuments",
        description: "Search for invoices",
        tool: "searchDocuments",
      }),
    ]);
    const guide = buildGuideInstructions(plan);
    const hint = guide.instructions.find((i): i is Extract<typeof i, { type: "showHint" }> => i.type === "showHint");
    expect(hint).toBeDefined();
    expect(hint!.message).toContain("Search for invoices");
  });

  it("emits showHint for non-navigate, non-tool steps", () => {
    const plan = makePlan([
      makeStep({ stepIndex: 0, action: "someAction", description: "Generic step", tool: null }),
    ]);
    const guide = buildGuideInstructions(plan);
    const hint = guide.instructions.find((i) => i.type === "showHint");
    expect(hint).toBeDefined();
  });

  it("handles multi-step plans", () => {
    const plan = makePlan([
      makeStep({ stepIndex: 0, action: "navigate", description: "Go to documents" }),
      makeStep({ stepIndex: 1, action: "searchDocuments", description: "Search", tool: "searchDocuments" }),
    ]);
    const guide = buildGuideInstructions(plan);
    expect(guide.instructions.filter((i) => i.type === "complete")).toHaveLength(1);
    expect(guide.instructions.length).toBeGreaterThan(2);
  });

  it("uses provided route parameter when available", () => {
    const plan = makePlan([
      makeStep({
        stepIndex: 0,
        action: "navigate",
        description: "Navigate",
        tool: null,
        parameters: { route: "/custom-route" },
      }),
    ]);
    const guide = buildGuideInstructions(plan);
    const nav = guide.instructions.find((i) => i.type === "navigate");
    expect(nav).toBeDefined();
  });

  it("resolves the imports keyword to the bulk import page", () => {
    const plan = makePlan([
      makeStep({ stepIndex: 0, action: "navigate", description: "Go to the imports page", tool: null }),
    ]);
    const guide = buildGuideInstructions(plan);
    const nav = guide.instructions.find((i) => i.type === "navigate");
    expect(nav).toBeDefined();
    if (nav && nav.type === "navigate") {
      expect(nav.route).toBe("/dashboard/users/import");
    }
  });

  it("emits a full coaching sequence for navigate steps with a known route", () => {
    const plan = makePlan([
      makeStep({ stepIndex: 0, action: "navigate", description: "Go to the users page", tool: null }),
    ]);
    const guide = buildGuideInstructions(plan);
    const types = guide.instructions.map((i) => i.type);
    expect(types).toEqual([
      "navigate",
      "waitForUser",
      "scrollTo",
      "highlight",
      "showArrow",
      "showTooltip",
      "focus",
      "waitForUser",
      "celebrate",
      "complete",
    ]);
    const highlight = guide.instructions.find((i) => i.type === "highlight");
    if (highlight && highlight.type === "highlight") {
      expect(highlight.elementId).toBe("users-page");
    }
    const arrow = guide.instructions.find((i) => i.type === "showArrow");
    if (arrow && arrow.type === "showArrow") {
      expect(arrow.elementId).toBe("users-page");
    }
  });

  it("emits no element coaching for an unknown route", () => {
    const plan = makePlan([
      makeStep({
        stepIndex: 0,
        action: "navigate",
        description: "Navigate",
        tool: null,
        parameters: { route: "/custom-route" },
      }),
    ]);
    const guide = buildGuideInstructions(plan);
    const types = guide.instructions.map((i) => i.type);
    expect(types).not.toContain("highlight");
    expect(types).not.toContain("showArrow");
  });

  it("emits a full coaching sequence when the step targets an element", () => {
    const plan = makePlan([
      makeStep({
        stepIndex: 0,
        action: "openDialog",
        description: "Open the invite user dialog",
        tool: "inviteUser",
        parameters: { elementId: "invite-user-button", dialogId: "invite-user-dialog", position: "bottom" },
      }),
    ]);
    const guide = buildGuideInstructions(plan);
    const types = guide.instructions.map((i) => i.type);
    expect(types).toEqual([
      "scrollTo",
      "openDialog",
      "highlight",
      "showArrow",
      "showTooltip",
      "focus",
      "waitForUser",
      "celebrate",
      "complete",
    ]);
  });

  it("expands a section when the step targets a section", () => {
    const plan = makePlan([
      makeStep({
        stepIndex: 0,
        action: "review",
        description: "Review recent activity",
        tool: "getSystemHealth",
        parameters: { elementId: "recent-activity", sectionId: "activity-section" },
      }),
    ]);
    const guide = buildGuideInstructions(plan);
    const types = guide.instructions.map((i) => i.type);
    expect(types).toContain("expandSection");
    const expand = guide.instructions.find((i) => i.type === "expandSection");
    if (expand && expand.type === "expandSection") {
      expect(expand.sectionId).toBe("activity-section");
    }
  });

  it("falls back to showHint when no elementId is present", () => {
    const plan = makePlan([
      makeStep({
        stepIndex: 0,
        action: "searchDocuments",
        description: "Search for invoices",
        tool: "searchDocuments",
        parameters: { query: "invoices" },
      }),
    ]);
    const guide = buildGuideInstructions(plan);
    const hint = guide.instructions.find((i) => i.type === "showHint");
    expect(hint).toBeDefined();
  });

  it("ends with a celebrate step before complete", () => {
    const plan = makePlan([
      makeStep({ stepIndex: 0, action: "navigate", description: "Go to documents page", tool: null }),
    ]);
    const guide = buildGuideInstructions(plan);
    const celebrateIdx = guide.instructions.findIndex((i) => i.type === "celebrate");
    const completeIdx = guide.instructions.findIndex((i) => i.type === "complete");
    expect(celebrateIdx).toBeGreaterThanOrEqual(0);
    expect(completeIdx).toBeGreaterThan(celebrateIdx);
  });
});
