import { z } from "zod";

export const feedbackRatingSchema = z.enum(["thumbs_up", "thumbs_down"]);
export const feedbackCategorySchema = z.enum(["inaccurate", "incomplete", "irrelevant", "harmful", "other"]);

export const submitFeedbackSchema = z.object({
  messageId: z.string().trim().min(1, "Message ID is required"),
  conversationId: z.string().trim().min(1, "Conversation ID is required"),
  rating: feedbackRatingSchema,
  category: feedbackCategorySchema.optional(),
  comment: z.string().trim().max(500).optional(),
});

export const listFeedbackQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  rating: feedbackRatingSchema.optional(),
  category: feedbackCategorySchema.optional(),
  messageId: z.string().trim().optional(),
  conversationId: z.string().trim().optional(),
  userId: z.string().trim().optional(),
});

export type SubmitFeedbackInput = z.infer<typeof submitFeedbackSchema>;
export type ListFeedbackQueryInput = z.infer<typeof listFeedbackQuerySchema>;
