import { z } from "zod";

export const ChatSendBodySchema = z.object({
  message: z.string().min(1, "Message is required").max(2000),
  conversationId: z.string().optional(),
});

export type ChatSendBody = z.infer<typeof ChatSendBodySchema>;

export const ChatConversationIdParamSchema = z.object({
  conversationId: z.string().min(1, "conversationId is required"),
});

export const ChatListConversationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type ChatListConversationsQuery = z.infer<typeof ChatListConversationsQuerySchema>;
