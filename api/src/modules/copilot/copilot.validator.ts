import { z } from "zod";

export const planQuerySchema = z.object({
  query: z.string().min(1).max(2000),
  mode: z.enum(["guide", "action", "auto"]).optional().default("auto"),
  currentRoute: z.string().max(500).optional(),
  currentDocumentId: z.string().max(100).optional(),
  selectedEntityId: z.string().max(100).optional(),
});

export const executeStepSchema = z.object({
  planId: z.string().min(1),
  stepIndex: z.number().int().min(0),
  parameters: z.record(z.string(), z.unknown()).optional(),
  currentDocumentId: z.string().max(100).optional(),
  selectedEntityId: z.string().max(100).optional(),
});

export const confirmStepSchema = z.object({
  planId: z.string().min(1),
  stepIndex: z.number().int().min(0),
  decision: z.enum(["approve", "reject"]),
  currentDocumentId: z.string().max(100).optional(),
  selectedEntityId: z.string().max(100).optional(),
});

export const cancelPlanSchema = z.object({
  planId: z.string().min(1),
});
