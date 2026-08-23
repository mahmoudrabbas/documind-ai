import { z } from "zod";

export type ActionRisk = "low" | "reversible" | "destructive";

export const actionRiskSchema = z.enum(["low", "reversible", "destructive"]);

export interface ActionPlan {
  runId: string;
  intent: string;
  toolName: string;
  risk: ActionRisk;
  requiresConfirmation: boolean;
  summary: string;
  target: { type: string; id: string; label: string } | null;
  undo?: { description: string; toolName?: string };
}

export const actionPlanSchema = z.object({
  runId: z.string().trim().min(1).max(64),
  intent: z.string().trim().min(1).max(512),
  toolName: z.string().trim().min(1).max(128),
  risk: actionRiskSchema,
  requiresConfirmation: z.boolean(),
  summary: z.string().trim().min(1).max(512),
  target: z
    .object({
      type: z.string().trim().min(1).max(64),
      id: z.string().trim().min(1).max(64),
      label: z.string().trim().min(1).max(256),
    })
    .nullable(),
  undo: z
    .object({
      description: z.string().trim().min(1).max(512),
      toolName: z.string().trim().min(1).max(128).optional(),
    })
    .optional(),
});

export interface ActionResult {
  runId: string;
  status: "completed" | "failed" | "rejected" | "expired";
  toolName: string;
  output: Record<string, unknown> | null;
  message: string;
  undo?: { description: string; toolName?: string };
}

export const actionResultSchema = z.object({
  runId: z.string().trim().min(1).max(64),
  status: z.enum(["completed", "failed", "rejected", "expired"]),
  toolName: z.string().trim().min(1).max(128),
  output: z.record(z.string(), z.unknown()).nullable(),
  message: z.string().trim().min(1).max(1024),
  undo: z
    .object({
      description: z.string().trim().min(1).max(512),
      toolName: z.string().trim().min(1).max(128).optional(),
    })
    .optional(),
});

export type ActionQuestionType =
  | "text"
  | "email"
  | "enum"
  | "document"
  | "user"
  | "settings"
  | "grants";

export interface ActionQuestion {
  field: string;
  type: ActionQuestionType;
  labelKey: string;
  /** Shown verbatim when no localized label exists for `labelKey`. */
  label: string;
  options?: { value: string; label: string }[];
}

export interface ActionDraft {
  draftId: string;
  toolName: string;
  summary: string;
  /** Fields the user already provided (for the transcript). */
  answered: { field: string; value: string }[];
  /** The single question to answer next, or null when all fields are present. */
  question: ActionQuestion | null;
  questionsRemaining: number;
  /** Feedback for the last answer when it could not be used (e.g. no matching
   * document). Absent when the last answer was accepted. */
  message?: string | null;
}

export const actionQuestionSchema = z.object({
  field: z.string().trim().min(1).max(64),
  type: z.enum(["text", "email", "enum", "document", "user", "settings", "grants"]),
  labelKey: z.string().trim().min(1).max(256),
  label: z.string().trim().min(1).max(256),
  options: z
    .array(
      z.object({
        value: z.string().trim().min(1).max(128),
        label: z.string().trim().min(1).max(256),
      }),
    )
    .optional(),
});

export const actionDraftSchema = z.object({
  draftId: z.string().trim().min(1).max(64),
  toolName: z.string().trim().min(1).max(128),
  summary: z.string().trim().min(1).max(512),
  answered: z.array(
    z.object({
      field: z.string().trim().min(1).max(64),
      value: z.string().trim().min(1).max(512),
    }),
  ),
  question: actionQuestionSchema.nullable(),
  questionsRemaining: z.number().int().min(0),
  message: z.string().trim().min(1).max(512).nullable().optional(),
});

export interface ClassifierDecision {
  mode: "guide" | "action" | "clarify";
  confidence: number;
  flowIdHint: string | null;
  toolNameHint: string | null;
  reasonCode: string;
}

export const classifierDecisionSchema = z.object({
  mode: z.enum(["guide", "action", "clarify"]),
  confidence: z.number().min(0).max(1),
  flowIdHint: z.string().trim().min(1).max(64).nullable(),
  toolNameHint: z.string().trim().min(1).max(128).nullable(),
  reasonCode: z.string().trim().min(1).max(64),
});