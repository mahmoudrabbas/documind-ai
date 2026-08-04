import { apiClient, API_BASE_URL, ApiError } from "@/lib/api-client";
import { getAccessToken } from "@/lib/auth-tokens";
import { getLocaleFromCookie } from "@/lib/i18n/i18n.utils";
import type {
  ChatResponse,
  ChatSource,
  ConversationListResponse,
  ConversationMessagesResponse,
} from "@/types/api/chat.types";

export interface ChatSendRequest {
  message: string;
  conversationId?: string;
}

export interface StreamChatCallbacks {
  onToken(content: string): void;
  onSources(sources: ChatSource[]): void;
  onDone(payload: { messageId: string; conversationId: string }): void;
}

export async function streamChat(
  input: ChatSendRequest,
  callbacks: StreamChatCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const url = `${API_BASE_URL}/chat/stream`;
  const accessToken = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept-Language": getLocaleFromCookie(),
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({
      message: input.message,
      conversationId: input.conversationId,
    }),
    signal,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const parsedHeader = Number(response.headers.get("retry-after"));
    const retryFromHeader =
      !Number.isNaN(parsedHeader) && parsedHeader > 0
        ? parsedHeader
        : null;
    const retryFromBody =
      typeof (body as { retryAfterSeconds?: unknown })?.retryAfterSeconds ===
        "number" &&
      (body as { retryAfterSeconds: number }).retryAfterSeconds > 0
        ? (body as { retryAfterSeconds: number }).retryAfterSeconds
        : null;
    const retryAfterSeconds = retryFromBody ?? retryFromHeader;

    throw new ApiError({
      status: response.status,
      code:
        typeof body?.error === "string"
          ? body.error
          : body?.error && typeof body.error === "object"
            ? (body.error as { code?: unknown }).code?.toString()
            : undefined,
      message:
        typeof body?.error === "object" &&
        typeof (body.error as { message?: unknown }).message === "string"
          ? (body.error as { message: string }).message
          : typeof body?.message === "string"
            ? body.message
            : `Request failed with status ${response.status}`,
      details:
        body?.details ??
        (typeof body?.error === "object"
          ? (body.error as { details?: unknown }).details
          : undefined),
      retryAfterSeconds,
    });
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new ApiError({
      status: 0,
      code: "NETWORK_ERROR",
      message: "Streaming response not readable",
    });
  }

  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let completed = false;

  const processEvents = (chunk: string): void => {
    if (completed) {
      return;
    }
    buffer += chunk;
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      if (completed) {
        return;
      }
      const data = event
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trim())
        .join("\n");
      if (!data) {
        continue;
      }
      let payload: unknown;
      try {
        payload = JSON.parse(data);
      } catch {
        continue;
      }
      const record = payload as Record<string, unknown>;
      switch (record.type) {
        case "token":
          callbacks.onToken(
            typeof record.content === "string" ? record.content : "",
          );
          break;
        case "sources":
          callbacks.onSources(
            Array.isArray(record.sources)
              ? (record.sources as ChatSource[])
              : [],
          );
          break;
        case "done":
          completed = true;
          callbacks.onDone({
            messageId: record.messageId as string,
            conversationId: record.conversationId as string,
          });
          return;
        case "error":
          throw new ApiError({
            status: 0,
            code: "STREAM_ERROR",
            message:
              typeof record.message === "string"
                ? record.message
                : "Streaming failed",
          });
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    processEvents(decoder.decode(value, { stream: true }));
  }
  processEvents(decoder.decode());
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
