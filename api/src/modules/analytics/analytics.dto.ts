import { z } from "zod";

export const analyticsQuerySchema = z.object({
  tenantId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  departmentId: z.string().optional(),
  actorId: z.string().optional(),
  eventType: z.string().optional(),
  limit: z.coerce.number().optional(),
  offset: z.coerce.number().optional(),
});

export const exportRequestSchema = z.object({
  type: z.enum(["csv", "xlsx"]).default("csv"),
  filters: z.record(z.string(), z.unknown()).optional(),
});

export const insightRequestSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  focusArea: z.enum(["all", "cost", "quality", "performance", "usage_pattern"]).optional().default("all"),
});
