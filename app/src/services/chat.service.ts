import { apiClient } from "@/lib/api-client";
import type { ChatResponse } from "@/types/api/chat.types";

interface ChatSendRequest {
  message: string;
  conversationId?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
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
