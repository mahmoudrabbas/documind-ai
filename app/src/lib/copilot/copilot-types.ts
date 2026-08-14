/**
 * Copilot frontend types — mirror of the backend `/copilot` contracts
 * (`api/src/modules/copilot/{copilot.validator,copilot.service,guide/guide.contracts,action/action.contracts}`).
 * Keep in sync when the backend contract changes; the parity test enforces the
 * `data-guide-id` side of the contract only.
 */

export type GuidePlacement = "top" | "bottom" | "start" | "end" | "auto";
export type GuideInteraction =
  "click" | "input" | "navigate" | "observe" | "none";
export type CompletionEventType =
  "click" | "route_change" | "value_present" | "manual";
export type FallbackPolicy = "skip" | "stop" | "wait";

export interface GuideTargetRef {
  targetId: string;
  route?: string;
  optional?: boolean;
}

export interface GuideStepCompletion {
  event: CompletionEventType;
  routeMatch?: string;
}

export interface GuideStepFallback {
  onMissing: FallbackPolicy;
  waitMs?: number;
}

export interface GuideStep {
  stepId: string;
  order: number;
  title: string;
  instruction: string;
  target: GuideTargetRef;
  placement: GuidePlacement;
  interaction: GuideInteraction;
  completion: GuideStepCompletion;
  fallback: GuideStepFallback;
}

export interface GuideSession {
  sessionId: string;
  flowId: string;
  locale: "en" | "ar";
  dir: "ltr" | "rtl";
  steps: GuideStep[];
  entryRoute: string;
}

export type GuideFlowCategory =
  | "documents"
  | "users"
  | "roles"
  | "settings"
  | "billing"
  | "chat"
  | "platform";

export type GuideFlowAudience = "employee" | "admin" | "all";

export type GuideFlowMeta = {
  flowId: string;
  title: string;
  category?: GuideFlowCategory;
  audience?: GuideFlowAudience;
  keywords?: string[];
  available: boolean;
};

export type GuideTargetEntry = {
  targetId: string;
  route: string;
  description: string;
  requiredPermissions?: readonly string[];
};

export type ActionRisk = "low" | "reversible" | "destructive";

export interface ActionPlan {
  runId: string;
  intent: string;
  toolName: string;
  risk: ActionRisk;
  requiresConfirmation: boolean;
  summary: string;
  target: { type: string; id: string; label: string } | null;
  undo?: { description: string; toolName?: string };
  approvalId?: string;
}

export type ActionResultStatus =
  "completed" | "failed" | "rejected" | "expired";

export interface ActionResult {
  runId: string;
  status: ActionResultStatus;
  toolName: string;
  output: Record<string, unknown> | null;
  message: string;
  undo?: { description: string; toolName?: string };
}

export interface ClarifyPayload {
  message: string;
  suggestedFlows: string[];
  suggestedActions: string[];
}

export type CopilotMode = "guide" | "action" | "clarify";

export interface CopilotMessageResult {
  mode: CopilotMode;
  guideSession?: GuideSession;
  actionPlan?: ActionPlan;
  approvalId?: string;
  clarify?: ClarifyPayload;
}

export type CopilotLifecycleEvent =
  | "copilot.classified"
  | "guide.session.created"
  | "action.plan.created"
  | "action.awaiting_confirmation"
  | "action.executed"
  | "action.failed"
  | "copilot.completed";

export interface CopilotLifecyclePayload {
  runId?: string;
  status?: string;
  approvalId?: string;
  risk?: ActionRisk;
  plan?: ActionPlan;
  result?: ActionResult;
  [key: string]: unknown;
}
