import { z } from "zod";

export const getEmailsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
  state: z.string().optional(),
  recipientEmail: z.string().optional(),
  templateId: z.string().optional(),
});
