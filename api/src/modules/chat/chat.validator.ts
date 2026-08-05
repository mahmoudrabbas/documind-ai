import { z } from "zod";

export const ChatSendBodySchema = z.object({
  message: z.string().min(1, "Message is required").max(2000),
  conversationId: z.string().optional(),
});

export type ChatSendBody = z.infer<typeof ChatSendBodySchema>;

/**
 * Body fields for the vision endpoint. The image arrives as a multipart
 * field named `image` (validated by the multer fileFilter in the controller),
 * `question` is the text prompt sent with the image.
 */
export const ChatVisionBodySchema = z.object({
  question: z.string().min(1, "Question is required").max(2000),
  conversationId: z.string().optional(),
  /**
   * Client-generated idempotency key. A retry with the same key in the same
   * conversation returns the existing exchange instead of analyzing again.
   */
  clientMessageId: z.string().min(1).max(128).optional(),
});

export type ChatVisionBody = z.infer<typeof ChatVisionBodySchema>;

export const ChatAttachmentIdParamSchema = z.object({
  attachmentId: z.string().min(1, "attachmentId is required"),
});

export type ChatAttachmentIdParam = z.infer<typeof ChatAttachmentIdParamSchema>;

export const ChatConversationIdParamSchema = z.object({
  conversationId: z.string().min(1, "conversationId is required"),
});

export const ChatListConversationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type ChatListConversationsQuery = z.infer<typeof ChatListConversationsQuerySchema>;
