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