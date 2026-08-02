import { z } from "zod";
import mongoose from "mongoose";

export const mongoIdSchema = z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
  message: "Invalid ObjectId",
});

export const createCampaignQuerySchema = z.object({
  autoConfirm: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export const confirmCampaignParamsSchema = z.object({
  campaignId: mongoIdSchema,
});

export const listCampaignsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  state: z
    .enum([
      "ANALYZING",
      "AWAITING_CONFIRMATION",
      "RUNNING",
      "COMPLETED",
      "PARTIALLY_COMPLETED",
      "FAILED",
      "CANCELLED",
    ])
    .optional(),
});

export const cancelCampaignParamsSchema = z.object({
  campaignId: mongoIdSchema,
});
