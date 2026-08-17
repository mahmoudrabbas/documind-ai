import { z } from "zod";

export const copilotMessageSchema = z.object({
  utterance: z.string().trim().min(1).max(2048),
  locale: z.enum(["en", "ar"]).default("en"),
  routeContext: z.string().trim().max(256).optional(),
});

export const copilotGuideResolveSchema = z.object({
  flowId: z.string().trim().min(1).max(64),
  locale: z.enum(["en", "ar"]).default("en"),
});

export const copilotActionSchema = z.object({
  utterance: z.string().trim().min(1).max(2048).optional(),
  toolName: z.string().trim().min(1).max(128).optional(),
  toolInput: z.record(z.string(), z.unknown()).optional(),
  locale: z.enum(["en", "ar"]).default("en"),
}).refine(
  (data) => data.utterance !== undefined || (data.toolName !== undefined && data.toolInput !== undefined),
  { message: "Either utterance or toolName+toolInput must be provided" }
);

export const copilotActionConfirmSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500).optional(),
  approvalId: z.string().trim().min(1).max(64),
});

export type CopilotMessageInput = z.infer<typeof copilotMessageSchema>;
export type CopilotGuideResolveInput = z.infer<typeof copilotGuideResolveSchema>;
export type CopilotActionInput = z.infer<typeof copilotActionSchema>;
export type CopilotActionConfirmInput = z.infer<typeof copilotActionConfirmSchema>;