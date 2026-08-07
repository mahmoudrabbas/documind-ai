export interface SBGConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

export interface SBGChatModelsConfig {
  primary: string[];
  fast: string[];
}

export interface SBGEmbeddingModelsConfig {
  models: string[];
}

export interface SBGImageModelConfig {
  model: string;
}

export interface SBGAudioModelConfig {
  model: string;
}

export interface SBGModel {
  model_id: string;
  provider_name: string;
  supports_chat: boolean;
  display_name: string;
  is_active: boolean;
}

export interface SBGChatTool {
  type: string;
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface SBGChatRequest {
  model_id: string;
  messages: SBGChatMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: SBGChatTool[];
  tool_choice?: string | { type: "function"; function: { name: string } };
}

export interface SBGChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface SBGChatResponse {
  id: string;
  model: string;
  choices: SBGChatChoice[];
  usage: SBGChatUsage;
  created: number;
}

export interface SBGChatChoice {
  index: number;
  message: SBGChatMessage;
  finish_reason: string | null;
}

export interface SBGChatUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface SBGEmbedRequest {
  model_id: string;
  texts: string[];
}

export interface SBGEmbedResponse {
  data: SBGEmbedData[];
  model: string;
  usage: SBGEmbedUsage;
}

export interface SBGEmbedData {
  embedding: number[];
  index: number;
  object: "embedding";
}

export interface SBGEmbedUsage {
  prompt_tokens: number;
  total_tokens: number;
}

export interface SBGImageRequest {
  model_id: string;
  prompt: string;
  n?: number;
  size?: string;
}

export interface SBGImageResponse {
  data: SBGImageData[];
  created: number;
}

export interface SBGImageData {
  url: string;
  revised_prompt?: string;
}

export interface SBGAudioRequest {
  model_id: string;
  input: string;
  voice?: string;
}

export interface SBGAudioResponse {
  data: string;
  format: string;
}

export interface SBGModelsResponse {
  data: SBGModel[];
}