import {
  type EmbeddingInput,
  type EmbeddingResult,
  type EmbeddingProvider,
} from "../embedding/embeddingProvider.port.js";
import {
  type ModelAdapter,
  type ModelCompletionMessage,
  type ModelCompletionResponse,
  type ModelCompletionUsage,
} from "../../modules/agents/agents.types.js";
import { logger } from "../../common/logger/logger.js";
import {
  SBGConfig,
  SBGChatModelsConfig,
  SBGEmbeddingModelsConfig,
  SBGChatRequest,
  SBGChatResponse,
  SBGEmbedRequest,
  SBGEmbedResponse,
  SBGImageRequest,
  SBGImageResponse,
  SBGAudioRequest,
  SBGAudioResponse,
  SBGModel,
  SBGModelsResponse,
} from "./types.js";
import {
  classifySBGError,
  isRetryableError,
  SBGAuthError,
  SBGRateLimitError,
  SBGTimeoutError,
  SBGServiceUnavailableError,
} from "./errors.js";

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;

function getEnvModels(
  envVar: string,
  fallback: string[]
): string[] {
  const value = process.env[envVar];
  if (!value || value.trim() === "") {
    return fallback;
  }
  return value.split(",").map((m) => m.trim()).filter((m) => m.length > 0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new SBGTimeoutError(`Request timed out after ${timeoutMs}ms`, error);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export class StudentBedrockProvider implements EmbeddingProvider, ModelAdapter {
  readonly name = "student-bedrock";
  readonly providerKey = "student-bedrock";

  readonly model: string;
  readonly dimensions: number;

  private readonly config: SBGConfig;
  private readonly chatModels: SBGChatModelsConfig;
  private readonly embeddingModels: SBGEmbeddingModelsConfig;
  private readonly imageModel: string;
  private readonly audioModel: string;

  private currentChatModelIndex = 0;
  private currentEmbeddingModelIndex = 0;

  constructor(
    config: SBGConfig,
    chatModels: SBGChatModelsConfig,
    embeddingModels: SBGEmbeddingModelsConfig,
    imageModel: string,
    audioModel: string
  ) {
    this.config = config;
    this.chatModels = chatModels;
    this.embeddingModels = embeddingModels;
    this.imageModel = imageModel;
    this.audioModel = audioModel;

    this.model = chatModels.primary[0] ?? chatModels.fast[0] ?? "anthropic.claude-sonnet-4-6";
    this.dimensions = 1024;
  }

  private peekCurrentChatModel(isFast = false): string {
    const models = isFast ? this.chatModels.fast : this.chatModels.primary;
    if (models.length === 0) {
      return this.chatModels.primary[0] ?? "anthropic.claude-sonnet-4-6";
    }
    return models[this.currentChatModelIndex % models.length];
  }

  private advanceChatModel(isFast = false): string {
    const model = this.peekCurrentChatModel(isFast);
    this.currentChatModelIndex++;
    return model;
  }

  private peekCurrentEmbeddingModel(): string {
    if (this.embeddingModels.models.length === 0) {
      return "amazon.titan-embed-text-v2:0";
    }
    return this.embeddingModels.models[this.currentEmbeddingModelIndex % this.embeddingModels.models.length];
  }

  private advanceEmbeddingModel(): string {
    const model = this.peekCurrentEmbeddingModel();
    this.currentEmbeddingModelIndex++;
    return model;
  }

  private async makeRequest<T>(endpoint: string, body: unknown): Promise<T> {
    const url = `${this.config.baseUrl}/api/v1/student${endpoint}`;
    const startTime = Date.now();

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await fetchWithTimeout(url, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }, this.config.timeoutMs);

        const durationMs = Date.now() - startTime;

        if (!response.ok) {
          const errorText = await response.text().catch(() => "Unknown error");
          let error: Error;

          switch (response.status) {
            case 401: {
              error = new SBGAuthError(`Authentication failed: ${errorText}`);
              break;
            }
            case 402: {
              error = new Error(`Quota exceeded: ${errorText}`);
              break;
            }
            case 429: {
              const retryAfter = response.headers.get("retry-after");
              const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
              error = new SBGRateLimitError(`Rate limited: ${errorText}`, retryAfterMs);
              break;
            }
            case 400: {
              error = new Error(`Bad request: ${errorText}`);
              break;
            }
            case 408: {
              error = new SBGTimeoutError(`Request timeout: ${errorText}`);
              break;
            }
            case 503: {
              error = new SBGServiceUnavailableError(`Service unavailable: ${errorText}`);
              break;
            }
            default: {
              if (response.status >= 500) {
                error = new SBGServiceUnavailableError(`Server error: ${errorText}`);
              } else {
                error = new Error(`HTTP ${response.status}: ${errorText}`);
              }
              break;
            }
          }

          logger.warn({
            provider: this.name,
            endpoint,
            attempt,
            maxRetries: this.config.maxRetries,
            statusCode: response.status,
            durationMs,
            error: error.message,
          }, "SBG request failed");

          lastError = error;

          if (!isRetryableError(error)) {
            throw error;
          }

          if (attempt < this.config.maxRetries) {
            const backoffMs = this.config.retryDelayMs * Math.pow(2, attempt - 1);
            logger.info({
              provider: this.name,
              endpoint,
              attempt,
              backoffMs,
            }, "Retrying SBG request after backoff");
            await sleep(backoffMs);
            continue;
          }
        }

        const data = await response.json() as T;

        logger.info({
          provider: this.name,
          endpoint,
          attempt,
          durationMs,
        }, "SBG request succeeded");

        return data;
      } catch (error) {
        const sbgError = classifySBGError(error);
        lastError = sbgError;

        logger.warn({
          provider: this.name,
          endpoint,
          attempt,
          maxRetries: this.config.maxRetries,
          error: sbgError.message,
          code: sbgError.code,
          retryable: sbgError.retryable,
        }, "SBG request error");

        if (!sbgError.retryable || attempt >= this.config.maxRetries) {
          throw sbgError;
        }

        const backoffMs = this.config.retryDelayMs * Math.pow(2, attempt - 1);
        logger.info({
          provider: this.name,
          endpoint,
          attempt,
          backoffMs,
        }, "Retrying SBG request after backoff");
        await sleep(backoffMs);
      }
    }

    throw lastError ?? new Error("Unknown error after retries");
  }

  /**
   * Lightweight liveness probe used by proactive failover. Reaches the gateway
   * models endpoint and reports availability without surfacing the key.
   */
  async checkAvailability(
    signal?: AbortSignal,
  ): Promise<{ available: boolean; reason?: string }> {
    const url = `${this.config.baseUrl}/api/v1/student/models`;
    const probeSignal = signal
      ? AbortSignal.any([AbortSignal.timeout(5_000), signal])
      : AbortSignal.timeout(5_000);
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
        signal: probeSignal,
      });
      return {
        available: response.ok,
        reason: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        available: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async embedBatch(inputs: EmbeddingInput[]): Promise<EmbeddingResult[]> {
    const model = this.advanceEmbeddingModel();
    const results: EmbeddingResult[] = [];

    for (const input of inputs) {
      const _idempotencyKey = input.idempotencyKey;

      try {
        const request: SBGEmbedRequest = {
          model_id: model,
          texts: [input.text],
        };

        const response = await this.makeRequest<SBGEmbedResponse>("/embed", request);

        const embedding = response.data[0];
        const tokenUsage = response.usage?.total_tokens ?? 0;

        results.push({
          chunkId: input.chunkId,
          vector: embedding.embedding,
          tokenUsage,
          costUsd: 0,
          modelVersion: model,
        });

        logger.debug({
          provider: this.name,
          model,
          chunkId: input.chunkId,
          dimensions: embedding.embedding.length,
          tokenUsage,
        }, "Embedding generated");
      } catch (error) {
        logger.error({
          provider: this.name,
          model,
          chunkId: input.chunkId,
          error: error instanceof Error ? error.message : String(error),
        }, "Embedding generation failed");
        throw error;
      }
    }

    return results;
  }

  async complete(params: {
    messages: ModelCompletionMessage[];
    tools?: Record<string, unknown>[];
    toolChoice?: string | Record<string, unknown>;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    signal?: AbortSignal;
    structuredOutput?: { type: "json_object" };
  }): Promise<ModelCompletionResponse> {
    // `structuredOutput` is accepted for interface uniformity but intentionally
    // NOT forwarded to the SBG gateway: the gateway request contract does not
    // document response_format support, and sending an unrecognized field could
    // turn an otherwise-working request into a 400. AnswerWriter still parses
    // and strictly validates whatever this provider returns, so malformed
    // output fails closed there.
    const isFast = params.maxTokens !== undefined && params.maxTokens < 1000;
    const model = this.advanceChatModel(isFast);

    const request: SBGChatRequest = {
      model_id: model,
      messages: params.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: params.temperature ?? 0.7,
      top_p: params.topP ?? 1.0,
      max_tokens: params.maxTokens,
      stream: false,
    };

    const startTime = Date.now();

    try {
      const response = await this.makeRequest<SBGChatResponse>("/chat", request);
      const latencyMs = Date.now() - startTime;

      const choice = response.choices[0];
      if (!choice) {
        throw new Error("No choices returned from SBG chat");
      }

      const usage: ModelCompletionUsage = {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      };

      const estimatedCost = this.estimateCost(model, usage);

      return {
        id: response.id,
        provider: this.providerKey,
        model: response.model,
        choices: [
          {
            index: choice.index,
            message: {
              role: choice.message.role,
              content: choice.message.content,
            },
            finishReason: choice.finish_reason,
          },
        ],
        usage,
        latencyMs,
        estimatedCost,
      };
    } catch (error) {
      logger.error({
        provider: this.name,
        model,
        error: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - startTime,
      }, "Chat completion failed");
      throw error;
    }
  }

  async generateImage(prompt: string, options?: { n?: number; size?: string }): Promise<string[]> {
    const request: SBGImageRequest = {
      model_id: this.imageModel,
      prompt,
      n: options?.n ?? 1,
      size: options?.size,
    };

    const response = await this.makeRequest<SBGImageResponse>("/generate-image", request);
    return response.data.map((d) => d.url);
  }

  async generateAudio(text: string, voice?: string): Promise<string> {
    const request: SBGAudioRequest = {
      model_id: this.audioModel,
      input: text,
      voice,
    };

    const response = await this.makeRequest<SBGAudioResponse>("/audio", request);
    return response.data;
  }

  private async fetchAvailableModels(): Promise<SBGModel[]> {
    const url = `${this.config.baseUrl}/api/v1/student/models`;
    try {
      const response = await fetchWithTimeout(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${this.config.apiKey}`,
        },
      }, this.config.timeoutMs);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        logger.warn({
          provider: this.name,
          statusCode: response.status,
          error: errorText,
        }, "Failed to fetch available models from gateway");
        return [];
      }

      const data = await response.json() as SBGModelsResponse;
      return Array.isArray(data.data) ? data.data : [];
    } catch (error) {
      logger.warn({
        provider: this.name,
        error: error instanceof Error ? error.message : String(error),
      }, "Could not reach gateway to validate models (continuing with configured models)");
      return [];
    }
  }

  async validateModels(): Promise<void> {
    const availableModels = await this.fetchAvailableModels();
    if (availableModels.length === 0) {
      logger.warn({ provider: this.name }, "No models fetched from gateway; skipping model validation");
      return;
    }

    const availableIds = new Set(availableModels.map((m) => m.model_id));
    const allConfigured = [
      ...this.chatModels.primary,
      ...this.chatModels.fast,
      ...this.embeddingModels.models,
    ];

    for (const modelId of allConfigured) {
      if (!availableIds.has(modelId)) {
        logger.warn({
          provider: this.name,
          modelId,
        }, "Configured model not found in gateway; it may fail at runtime");
      }
    }
  }

  private estimateCost(model: string, usage: ModelCompletionUsage): number {
    const modelLower = model.toLowerCase();
    if (modelLower.includes("opus")) {
      return (usage.promptTokens / 1_000_000) * 15 + (usage.completionTokens / 1_000_000) * 75;
    }
    if (modelLower.includes("sonnet")) {
      return (usage.promptTokens / 1_000_000) * 3 + (usage.completionTokens / 1_000_000) * 15;
    }
    if (modelLower.includes("deepseek") || modelLower.includes("gpt-oss")) {
      return (usage.totalTokens / 1_000_000) * 0.5;
    }
    return 0;
  }

  getEmbeddingModel(): string {
    return this.peekCurrentEmbeddingModel();
  }

  getChatModel(): string {
    return this.peekCurrentChatModel();
  }

  async validateConnection(): Promise<boolean> {
    try {
      await this.makeRequest<SBGEmbedResponse>("/embed", {
        model_id: this.peekCurrentEmbeddingModel(),
        texts: ["test"],
      });
      return true;
    } catch {
      return false;
    }
  }
}

export function createStudentBedrockProvider(): StudentBedrockProvider {
  const apiKey = process.env.SBG_API_KEY;
  const baseUrl = process.env.BEDROCK_GATEWAY_URL || process.env.SBG_BASE_URL || "http://apiaccess.iti.net.eg";

  if (!apiKey || apiKey.trim() === "") {
    throw new Error("SBG_API_KEY environment variable is required for student-bedrock provider");
  }

  const config: SBGConfig = {
    apiKey,
    baseUrl: baseUrl.replace(/\/$/, ""),
    timeoutMs: parseInt(process.env.BEDROCK_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS), 10),
    maxRetries: parseInt(process.env.BEDROCK_MAX_RETRIES || String(DEFAULT_MAX_RETRIES), 10),
    retryDelayMs: parseInt(process.env.BEDROCK_RETRY_DELAY_MS || String(DEFAULT_RETRY_DELAY_MS), 10),
  };

  const chatModels: SBGChatModelsConfig = {
    primary: getEnvModels("BEDROCK_CHAT_MODELS", [
      "anthropic.claude-opus-4-7",
      "anthropic.claude-sonnet-4-6",
      "deepseek.v3.2",
      "openai.gpt-oss-120b",
    ]),
    fast: getEnvModels("BEDROCK_FAST_CHAT_MODELS", [
      "anthropic.claude-sonnet-4-6",
      "deepseek.v3.2",
    ]),
  };

  const embeddingModels: SBGEmbeddingModelsConfig = {
    models: getEnvModels("BEDROCK_EMBEDDING_MODELS", [
      "amazon.titan-embed-text-v2:0",
      "us.cohere.embed-v4:0",
    ]),
  };

  const imageModel = process.env.BEDROCK_IMAGE_MODEL || "amazon.nova-canvas-v1:0";
  const audioModel = process.env.BEDROCK_AUDIO_MODEL || "amazon.nova-sonic-v1:0";

  const provider = new StudentBedrockProvider(config, chatModels, embeddingModels, imageModel, audioModel);

  provider.validateModels().catch((error) => {
    logger.warn({
      provider: provider.name,
      error: error instanceof Error ? error.message : String(error),
    }, "Startup model validation failed (non-fatal)");
  });

  return provider;
}