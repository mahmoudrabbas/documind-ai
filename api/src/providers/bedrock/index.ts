export type { SBGConfig } from "./types.js";
export type { SBGChatModelsConfig } from "./types.js";
export type { SBGEmbeddingModelsConfig } from "./types.js";
export type { SBGChatRequest, SBGChatResponse } from "./types.js";
export type { SBGEmbedRequest, SBGEmbedResponse } from "./types.js";
export type { SBGImageRequest, SBGImageResponse } from "./types.js";
export type { SBGAudioRequest, SBGAudioResponse } from "./types.js";

export {
  SBGError,
  SBGAuthError,
  SBGRateLimitError,
  SBGTimeoutError,
  SBGModelUnavailableError,
  SBGNetworkError,
  SBGServiceUnavailableError,
  SBGQuotaExceededError,
  SBGValidationError,
  classifySBGError,
  isRetryableError,
} from "./errors.js";

export { StudentBedrockProvider, createStudentBedrockProvider } from "./studentBedrockProvider.js";