import { apiClient } from "@/lib/api-client";
import type {
  ChatResponse,
  ConversationListResponse,
  ConversationMessagesResponse,
} from "@/types/api/chat.types";

interface ChatSendRequest {
  message: string;
  conversationId?: string;
}

export async function sendMessage(input: ChatSendRequest): Promise<ChatResponse> {
  const response = await apiClient<{
    success: boolean;
    data: ChatResponse;
  }>("/chat/send", {
    method: "POST",
    body: input as unknown as Record<string, unknown>,
  });

  return response.data;
}

export async function listConversations(
  page = 1,
  pageSize = 20,
): Promise<ConversationListResponse> {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));

  const response = await apiClient<{
    success: boolean;
    data: ConversationListResponse;
  }>(`/chat/conversations?${params.toString()}`, {
    method: "GET",
  });

  return response.data;
}

export async function getConversationMessages(
  conversationId: string,
): Promise<ConversationMessagesResponse> {
  const response = await apiClient<{
    success: boolean;
    data: ConversationMessagesResponse;
  }>(`/chat/conversations/${conversationId}/messages`, {
    method: "GET",
  });

  return response.data;
}

export async function deleteConversation(
  conversationId: string,
): Promise<void> {
  await apiClient<{
    success: boolean;
    data: { deleted: boolean };
  }>(`/chat/conversations/${conversationId}`, {
    method: "DELETE",
  });
}
