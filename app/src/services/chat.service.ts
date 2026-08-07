import { apiClient } from "@/lib/api-client";
import type {
  ChatResponse,
  ChatVisionResponse,
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

export interface ChatVisionSendRequest {
  question: string;
  conversationId?: string;
  clientMessageId?: string;
  image: File;
}

export async function sendVisionMessage(
  input: ChatVisionSendRequest,
): Promise<ChatVisionResponse> {
  const formData = new FormData();
  formData.append("image", input.image);
  formData.append("question", input.question);
  if (input.conversationId) {
    formData.append("conversationId", input.conversationId);
  }
  if (input.clientMessageId) {
    formData.append("clientMessageId", input.clientMessageId);
  }

  const response = await apiClient<{
    success: boolean;
    data: ChatVisionResponse;
  }>("/chat/vision", {
    method: "POST",
    body: formData,
  });

  return response.data;
}

export async function transcribeAudio(
  audioBlob: Blob,
): Promise<{ text: string }> {
  const formData = new FormData();
  formData.append("audio", audioBlob, "recording.webm");

  const response = await apiClient<{
    success: boolean;
    data: { text: string };
  }>("/chat/stt", {
    method: "POST",
    body: formData,
  });

  return response.data;
}

/** Fetches a chat attachment image over an authenticated blob URL. */
export async function fetchChatAttachmentUrl(
  attachmentId: string,
): Promise<string> {
  const token = (await import("@/lib/auth-tokens")).getAccessToken();
  const baseUrl = (await import("@/constants/api")).API_BASE_URL;
  const response = await fetch(`${baseUrl}/chat/attachments/${attachmentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error("Failed to load attachment");
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
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
