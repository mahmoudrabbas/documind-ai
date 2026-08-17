import { apiClient, API_BASE_URL } from "@/lib/api-client";
import { getAccessToken } from "@/lib/auth-tokens";
import { getLocaleFromCookie } from "@/lib/i18n/i18n.utils";
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

export type ChatProgressStage =
  | "intent"
  | "search"
  | "evidence"
  | "answer"
  | "verify"
  | "finalize";

export class ChatStreamError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly receivedAnyEvent: boolean,
  ) {
    super(message);
    this.name = "ChatStreamError";
  }
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

export async function sendMessageStream(
  input: ChatSendRequest,
  options: { onStage?: (stage: ChatProgressStage) => void },
): Promise<ChatResponse> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}/chat/send/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      Authorization: `Bearer ${token}`,
      "Accept-Language": getLocaleFromCookie(),
    },
    body: JSON.stringify(input),
    credentials: "include",
  });

  if (!response.ok || !response.body) {
    // Failure before any SSE event: the caller can safely fall back to the
    // plain JSON endpoint because the workflow never started.
    throw new ChatStreamError(
      `Chat stream failed with status ${response.status}`,
      "STREAM_UNAVAILABLE",
      response.status,
      false,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedAnyEvent = false;
  let result: ChatResponse | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex !== -1) {
      const frame = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      separatorIndex = buffer.indexOf("\n\n");

      let eventName = "message";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith(":")) continue;
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;

      const payload = JSON.parse(data) as {
        stage?: ChatProgressStage;
        data?: ChatResponse;
        message?: string;
        error?: string;
        code?: string;
        statusCode?: number;
      };

      if (eventName === "stage" && payload.stage) {
        receivedAnyEvent = true;
        options.onStage?.(payload.stage);
      } else if (eventName === "done" && payload.data) {
        receivedAnyEvent = true;
        result = payload.data;
      } else if (eventName === "error") {
        const code = payload.error ?? payload.code ?? "CHAT_STREAM_FAILED";
        throw new ChatStreamError(
          payload.message ?? "Chat request failed",
          code,
          payload.statusCode ?? 502,
          receivedAnyEvent,
        );
      }
    }
  }

  if (!result) {
    throw new ChatStreamError(
      "Chat stream ended without a result",
      "STREAM_INCOMPLETE",
      502,
      receivedAnyEvent,
    );
  }
  return result;
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
  try {
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
  } catch {
    return { text: "" };
  }
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
