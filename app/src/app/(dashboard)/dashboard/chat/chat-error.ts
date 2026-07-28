import { ApiError } from "@/lib/api-client";

export type ChatErrorPresentation = {
  message: string;
  retryAfterSeconds: number | null;
};

export function getChatErrorPresentation(error: unknown): ChatErrorPresentation {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "LLM_RATE_LIMITED":
        return {
          message: "The AI provider is temporarily rate-limited. Please try again shortly.",
          retryAfterSeconds: error.retryAfterSeconds,
        };
      case "LLM_PROVIDER_UNAVAILABLE":
        return {
          message: "The AI provider is temporarily unavailable. Please try again shortly.",
          retryAfterSeconds: null,
        };
      case "LLM_TIMEOUT":
        return {
          message: "The AI provider timed out. Please try again.",
          retryAfterSeconds: null,
        };
      case "RETRIEVAL_UNAVAILABLE":
        return {
          message: "Document search is temporarily unavailable. Please try again shortly.",
          retryAfterSeconds: null,
        };
    }
  }

  return {
    message: "Failed to get a response. Please try again.",
    retryAfterSeconds: null,
  };
}
