export type ConfirmationLevel = "safe" | "medium" | "high";
export type PlanMode = "guide" | "action";
export type PlanStatus = "active" | "completed" | "cancelled" | "failed";
export type StepStatus = "pending" | "running" | "completed" | "failed" | "awaiting_confirmation" | "cancelled";

export interface CopilotPlan {
  id: string;
  summary: string;
  mode: PlanMode;
  steps: CopilotStep[];
  estimatedDurationMs: number;
  createdAt: string;
  updatedAt: string;
  status: PlanStatus;
}

export interface CopilotStep {
  stepIndex: number;
  action: string;
  description: string;
  tool: string | null;
  parameters: Record<string, unknown> | null;
  confirmationLevel: ConfirmationLevel;
  requiredPermission: string | null;
  status: StepStatus;
  result: ToolResult | null;
  errorMessage: string | null;
  retryCount?: number;
}

export interface ToolResult {
  ok: boolean;
  data: unknown;
  error: string | null;
  latencyMs: number;
  auditEvent: {
    action: string;
    resourceType: string;
    resourceId: string;
  } | null;
}

/**
 * Runtime context supplied to every tool invocation. All values are derived
 * server-side from the authenticated actor — never trusted from LLM output.
 */
export interface ToolContext {
  tenantId: string;
  actorId: string;
  actorEmail: string;
  actorRole: string;
  traceId: string;
  requestId: string;
  /** Preferred language of the actor, e.g. "en" | "ar". */
  language?: string;
  /** Resolved custom role id, when the actor has one assigned. */
  customRoleId?: string;
  /** Department ids resolved from the actor's employee profile. */
  departmentIds?: string[];
  /** Document currently open in the UI, when provided. */
  currentDocumentId?: string;
  /** Entity currently selected in the UI, when provided. */
  selectedEntityId?: string;
  /** Effective permission grants resolved for the actor in this tenant. */
  effectivePermissions?: string[];
}

/**
 * Visual guidance emitted by the guide executor. Commands target STABLE UI
 * identifiers (elementId / sectionId), never CSS selectors.
 */
export type GuideInstruction =
  | { type: "navigate"; route: string; params?: Record<string, string> }
  | { type: "highlight"; elementId: string; message: string }
  | { type: "showArrow"; elementId: string; position: "top" | "bottom" | "left" | "right" }
  | { type: "focus"; elementId: string }
  | { type: "scrollTo"; elementId: string }
  | { type: "expandSection"; sectionId: string }
  | { type: "openDialog"; dialogId: string }
  | { type: "showTooltip"; elementId: string; message: string; position?: "top" | "bottom" | "left" | "right" }
  | { type: "waitForUser"; message: string }
  | { type: "showHint"; message: string; position?: "top" | "bottom" | "left" | "right" }
  | { type: "celebrate"; message: string }
  | { type: "complete"; message: string };

export interface GuidePlan {
  plan: CopilotPlan;
  instructions: GuideInstruction[];
}

export interface PlannerInput {
  query: string;
  mode: PlanMode;
  currentRoute?: string;
  tenantId: string;
  actorRole: string;
  traceId: string;
  requestId: string;
  language?: string;
  customRoleId?: string;
  departmentIds?: string[];
  currentDocumentId?: string;
  selectedEntityId?: string;
  effectivePermissions?: string[];
}

export type CopilotPlanEvent =
  | { type: "intent.detected"; mode: PlanMode; source: "explicit" | "auto"; at: string }
  | { type: "plan.ready"; planId: string; at: string }
  | { type: "step.started"; planId: string; stepIndex: number; tool: string | null; at: string }
  | { type: "step.retrying"; planId: string; stepIndex: number; tool: string | null; attempt: number; at: string }
  | { type: "step.confirmation_required"; planId: string; stepIndex: number; tool: string; level: ConfirmationLevel; at: string }
  | { type: "step.confirmed"; planId: string; stepIndex: number; decision: "approve" | "reject"; at: string }
  | { type: "step.completed"; planId: string; stepIndex: number; tool: string | null; ok: boolean; at: string }
  | { type: "step.failed"; planId: string; stepIndex: number; tool: string | null; error: string | null; at: string }
  | { type: "step.cancelled"; planId: string; stepIndex: number; at: string }
  | { type: "rollback.started"; planId: string; stepIndex: number; tool: string; at: string }
  | { type: "rollback.completed"; planId: string; stepIndex: number; tool: string; at: string }
  | { type: "rollback.failed"; planId: string; stepIndex: number; tool: string; error: string; at: string }
  | { type: "plan.completed"; planId: string; at: string }
  | { type: "plan.failed"; planId: string; at: string }
  | { type: "plan.cancelled"; planId: string; at: string };

export interface CopilotSuggestion {
  label: string;
  description: string;
  icon: string;
  query: string;
}
