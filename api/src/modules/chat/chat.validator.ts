import { z } from "zod";

export const ChatSendBodySchema = z.object({
  message: z.string().min(1, "Message is required").max(2000),
  conversationId: z.string().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      }),
    )
    .max(20)
    .optional(),
});

export type ChatSendBody = z.infer<typeof ChatSendBodySchema>;
