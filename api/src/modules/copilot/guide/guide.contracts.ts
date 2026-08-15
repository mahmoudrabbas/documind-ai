import { z } from "zod";

export type GuidePlacement = "top" | "bottom" | "start" | "end" | "auto";
export type GuideInteraction = "click" | "input" | "navigate" | "observe" | "none";

export const guidePlacementSchema = z.enum(["top", "bottom", "start", "end", "auto"]);
export const guideInteractionSchema = z.enum(["click", "input", "navigate", "observe", "none"]);

export interface GuideTargetRef {
  targetId: string;
  route?: string;
  optional?: boolean;
}

export const guideTargetRefSchema = z.object({
  targetId: z.string().trim().min(1).max(128),
  route: z.string().trim().min(1).max(256).optional(),
  optional: z.boolean().default(false),
});

export interface GuideStepCompletion {
  event: "click" | "route_change" | "value_present" | "manual";
  routeMatch?: string;
}

export const guideStepCompletionSchema = z.object({
  event: z.enum(["click", "route_change", "value_present", "manual"]),
  routeMatch: z.string().trim().min(1).max(256).optional(),
});

export interface GuideStepFallback {
  onMissing: "skip" | "stop" | "wait" | "wait-stop";
  waitMs?: number;
}

export const guideStepFallbackSchema = z.object({
  onMissing: z.enum(["skip", "stop", "wait", "wait-stop"]),
  waitMs: z.number().int().positive().max(60000).optional(),
});

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

export const guideStepSchema = z.object({
  stepId: z.string().trim().min(1).max(64),
  order: z.number().int().positive(),
  title: z.string().trim().min(1).max(128),
  instruction: z.string().trim().min(1).max(1024),
  target: guideTargetRefSchema,
  placement: guidePlacementSchema,
  interaction: guideInteractionSchema,
  completion: guideStepCompletionSchema,
  fallback: guideStepFallbackSchema,
});

export interface GuideSession {
  sessionId: string;
  flowId: string;
  locale: "en" | "ar";
  dir: "ltr" | "rtl";
  steps: GuideStep[];
  entryRoute: string;
}

export const guideSessionSchema = z.object({
  sessionId: z.string().trim().min(1).max(64),
  flowId: z.string().trim().min(1).max(64),
  locale: z.enum(["en", "ar"]),
  dir: z.enum(["ltr", "rtl"]),
  steps: z.array(guideStepSchema).min(1),
  entryRoute: z.string().trim().min(1).max(256),
});

export type GuideStepTemplate = Omit<GuideStep, "title" | "instruction"> & {
  titleKey: string;
  instructionKey: string;
};

export const guideStepTemplateSchema = z.object({
  stepId: z.string().trim().min(1).max(64),
  order: z.number().int().positive(),
  titleKey: z.string().trim().min(1).max(128),
  instructionKey: z.string().trim().min(1).max(1024),
  target: guideTargetRefSchema,
  placement: guidePlacementSchema,
  interaction: guideInteractionSchema,
  completion: guideStepCompletionSchema,
  fallback: guideStepFallbackSchema,
});

export interface GuideFlow {
  flowId: string;
  titleKey: string;
  requiredPermissions: readonly string[];
  entryRoute: string;
  steps: GuideStepTemplate[];
}

export const guideFlowSchema = z.object({
  flowId: z.string().trim().min(1).max(64),
  titleKey: z.string().trim().min(1).max(128),
  requiredPermissions: z.array(z.string().trim().min(1).max(128)).max(20),
  entryRoute: z.string().trim().min(1).max(256),
  steps: z.array(guideStepTemplateSchema).min(1),
});

export interface GuideTargetRegistryEntry {
  targetId: string;
  route: string;
  description: string;
  requiredPermissions?: readonly string[];
}

export const guideTargetRegistryEntrySchema = z.object({
  targetId: z.string().trim().min(1).max(128),
  route: z.string().trim().min(1).max(256),
  description: z.string().trim().min(1).max(512),
  requiredPermissions: z.array(z.string().trim().min(1).max(128)).max(20).optional(),
});

export type GuideTargetRegistry = ReadonlyMap<string, GuideTargetRegistryEntry>;