import { ApiError } from "@/lib/api-client";
import { ChatStreamError } from "@/services/chat.service";

export type ChatErrorPresentation = {
  message: string;
  retryAfterSeconds: number | null;
};

export function getChatErrorPresentation(
  error: unknown,
  t: (key: string) => string,
): ChatErrorPresentation {
  if (error instanceof ChatStreamError) {
    switch (error.code) {
      case "LLM_RATE_LIMITED":
        return {
          message: t("chat.error.rateLimited"),
          retryAfterSeconds: null,
        };
      case "LLM_PROVIDER_UNAVAILABLE":
        return {
          message: t("chat.error.providerUnavailable"),
          retryAfterSeconds: null,
        };
      case "LLM_TIMEOUT":
        return {
          message: t("chat.error.timedOut"),
          retryAfterSeconds: null,
        };
      case "ENTITLEMENT_EXCEEDED":
        return {
          message: t("chat.error.quotaExhausted"),
          retryAfterSeconds: null,
        };
      case "RETRIEVAL_UNAVAILABLE":
        return {
          message: t("chat.error.retrievalUnavailable"),
          retryAfterSeconds: null,
        };
    }
  }

  if (error instanceof ApiError) {
    switch (error.code) {
      case "LLM_RATE_LIMITED":
        return {
          message: t("chat.error.rateLimited"),
          retryAfterSeconds: error.retryAfterSeconds,
        };
      case "LLM_PROVIDER_UNAVAILABLE":
        return {
          message: t("chat.error.providerUnavailable"),
          retryAfterSeconds: null,
        };
      case "LLM_TIMEOUT":
        return {
          message: t("chat.error.timedOut"),
          retryAfterSeconds: null,
        };
      case "ENTITLEMENT_EXCEEDED":
        return {
          message: t("chat.error.quotaExhausted"),
          retryAfterSeconds: error.retryAfterSeconds,
        };
      case "RETRIEVAL_UNAVAILABLE":
        return {
          message: t("chat.error.retrievalUnavailable"),
          retryAfterSeconds: null,
        };
      case "VISION_UNAVAILABLE":
        return {
          message: t("chat.error.visionUnavailable"),
          retryAfterSeconds: null,
        };
      case "VISION_STORAGE_FAILED":
        return {
          message: t("chat.error.visionStorageFailed"),
          retryAfterSeconds: null,
        };
      case "ATTACHMENT_NOT_FOUND":
        return {
          message: t("chat.error.attachmentNotFound"),
          retryAfterSeconds: null,
        };
      case "UNSUPPORTED_FILE_TYPE":
        return {
          message: t("chat.error.unsupportedFileType"),
          retryAfterSeconds: null,
        };
      case "FILE_SIZE_LIMIT_EXCEEDED":
      case "FILE_UPLOAD_ERROR":
        return {
          message: t("chat.error.fileTooLarge"),
          retryAfterSeconds: null,
        };
      case "FILE_SIGNATURE_MISMATCH":
        return {
          message: t("chat.error.fileSignatureMismatch"),
          retryAfterSeconds: null,
        };
      case "FILE_ZERO_BYTES":
        return {
          message: t("chat.error.fileZeroBytes"),
          retryAfterSeconds: null,
        };
      case "VALIDATION_ERROR":
        return {
          message: t("chat.error.validation"),
          retryAfterSeconds: null,
        };
    }
  }

  return {
    message: t("chat.error.generic"),
    retryAfterSeconds: null,
  };
}
