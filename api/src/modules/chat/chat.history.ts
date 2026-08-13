import { sanitizeAssistantOutput } from "../../providers/llm/outputSanitizer.js";

export function safeHistoryForRag(
  messages: Array<{ role: string; content: string; sources: unknown[] }>,
): Array<{ role: "user" | "assistant"; content: string }> {
  return messages
    .filter((message) => message.role !== "assistant" || message.sources.length === 0)
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content:
        message.role === "assistant"
          ? sanitizeAssistantOutput(message.content)
          : message.content,
    }));
}
