import type { CopilotPlan, CopilotStep, GuideInstruction, GuidePlan } from "../copilot.types.js";

const ROUTE_GUIDE: Record<string, { route: string; elementId: string }> = {
  documents: { route: "/dashboard/documents", elementId: "documents-page" },
  users: { route: "/dashboard/users", elementId: "users-page" },
  roles: { route: "/dashboard/roles", elementId: "roles-page" },
  settings: { route: "/dashboard/settings", elementId: "settings-page" },
  audit: { route: "/dashboard/audit", elementId: "audit-page" },
  chat: { route: "/dashboard/chat", elementId: "chat-page" },
  analytics: { route: "/dashboard/analytics", elementId: "analytics-page" },
  emails: { route: "/dashboard/emails", elementId: "emails-page" },
  "knowledge-gaps": { route: "/dashboard/knowledge-gaps", elementId: "knowledge-gaps-page" },
  imports: { route: "/dashboard/users/import", elementId: "users-page" },
  billing: { route: "/checkout", elementId: "billing-page" },
};

export function buildGuideInstructions(plan: CopilotPlan): GuidePlan {
  const instructions: GuideInstruction[] = [];

  for (const step of plan.steps) {
    const stepInstructions = buildStepInstructions(step);
    instructions.push(...stepInstructions);
  }

  instructions.push(
    { type: "celebrate", message: "All done!" },
    { type: "complete", message: `Done! ${plan.summary}` },
  );

  return { plan, instructions };
}

function buildStepInstructions(step: CopilotStep): GuideInstruction[] {
  const result: GuideInstruction[] = [];

  if (step.action === "navigate") {
    const route = resolveRoute(step);
    result.push({ type: "navigate", route, params: step.parameters as Record<string, string> | undefined });
    result.push({ type: "waitForUser", message: step.description });

    const elementId = resolvePageElementId(route);
    if (elementId) {
      result.push({ type: "scrollTo", elementId });
      result.push({ type: "highlight", elementId, message: step.description });
      result.push({ type: "showArrow", elementId, position: "top" });
      result.push({ type: "showTooltip", elementId, message: step.description, position: "top" });
      result.push({ type: "focus", elementId });
      result.push({ type: "waitForUser", message: step.description });
    }
    return result;
  }

  if (step.tool) {
    const params = (step.parameters ?? {}) as Record<string, unknown>;
    const elementId = typeof params.elementId === "string" ? params.elementId : undefined;
    const position = ["top", "bottom", "left", "right"].includes(String(params.position))
      ? (params.position as "top" | "bottom" | "left" | "right")
      : "top";

    if (elementId) {
      result.push({ type: "scrollTo", elementId });
      const sectionId = typeof params.sectionId === "string" ? params.sectionId : undefined;
      if (sectionId) result.push({ type: "expandSection", sectionId });
      const dialogId = typeof params.dialogId === "string" ? params.dialogId : undefined;
      if (dialogId) result.push({ type: "openDialog", dialogId });
      result.push({ type: "highlight", elementId, message: step.description });
      result.push({ type: "showArrow", elementId, position });
      result.push({ type: "showTooltip", elementId, message: step.description, position });
      result.push({ type: "focus", elementId });
      result.push({ type: "waitForUser", message: step.description });
      return result;
    }

    result.push({
      type: "showHint",
      message: `I will now perform: ${step.description}`,
      position,
    });
    return result;
  }

  result.push({
    type: "showHint",
    message: step.description,
    position: "bottom",
  });

  return result;
}

function resolveRoute(step: CopilotStep): string {
  const params = step.parameters as Record<string, string> | undefined;
  const target = params?.route;
  if (target) return target;

  for (const [key, guide] of Object.entries(ROUTE_GUIDE)) {
    if (step.description.toLowerCase().includes(key)) {
      return guide.route;
    }
  }

  return "/dashboard";
}

function resolvePageElementId(route: string): string | null {
  const normalized = route.split("?")[0].replace(/\/+$/, "");
  for (const guide of Object.values(ROUTE_GUIDE)) {
    if (guide.route === normalized) return guide.elementId;
  }
  if (normalized === "/dashboard") return "dashboard-page";
  return null;
}
