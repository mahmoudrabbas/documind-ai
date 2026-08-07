import { logger } from "../../common/logger/logger.js";
import type {
  ModelCompletionMessage,
  ModelCompletionResponse,
  ModelCompletionUsage,
} from "../../modules/agents/agents.types.js";
import type { AvailabilityProbeModelAdapter } from "./failoverModelAdapter.js";

export interface ItiBedrockChatAdapterConfig {
  baseUrl: string;
  apiKey: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 500;
const DEFAULT_MODEL = "openai.gpt-oss-120b-1:0";
const PROBE_TIMEOUT_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * OpenAI-compatible request the ITI gateway accepts. Uses `model` (never the
 * legacy SBG `model_id`) and OpenAI message/tool shapes. `response_format` /
 * `json_schema` are intentionally never sent: the gateway does not document
 * native structured-output support, so AnswerWriter's server-side JSON.parse +
 * strict Zod validation remains the security boundary.
 */
interface OpenAIChatRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream: boolean;
  tools?: Array<Record<string, unknown>>;
  tool_choice?: string | Record<string, unknown>;
}

interface OpenAIChatResponse {
  id?: string;
  model?: string;
  choices?: Array<{
    index?: number;
    message?: { role?: string; content?: string };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  /**
   * Gateway-specific metadata. Application services must NOT depend on this
   * object; the adapter reads it only at the boundary and only when it carries
   * a valid numeric cost.
   */
  iti?: {
    estimated_cost_usd?: unknown;
    actual_cost_usd?: unknown;
  };
}

/**
 * ITI Bedrock chat adapter: a clean, focused replacement for the chat path
 * against the ITI Bedrock gateway. Unlike the legacy StudentBedrockProvider
 * (which owns embeddings/vision/audio and drops `tools`), this adapter speaks
 * the gateway's OpenAI-compatible protocol directly:
 *
 *   GET  <baseUrl>/models            availability probe
 *   POST <baseUrl>/chat/completions  chat completion
 *
 * The gateway must never be reached via the legacy StudentBedrockProvider
 * routes (/api/v1/student/*); those belong to the legacy provider.
 *
 * The adapter targets a single model (config.model), defaulting to the
 * documented ITI default when unset. ITI_BEDROCK_BASE_URL is the gateway
 * origin (includes the /v1 prefix, e.g. http://host.docker.internal:8787/v1);
 * SBG_BASE_URL belongs to the legacy StudentBedrockProvider and is not used
 * here.
 *
 * A successful HTTP 200 (even with malformed model content) is returned to the
 * caller as-is — it is NOT a provider outage and must not fail over. Only
 * infrastructure failures (network/timeout/429/5xx/unavailable) surface as
 * provider errors for the failover layer.
 */
export class ItiBedrockChatAdapter implements AvailabilityProbeModelAdapter {
  readonly providerKey = "iti-bedrock";
  readonly model: string;

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(config: ItiBedrockChatAdapterConfig) {
    if (!config.apiKey || config.apiKey.trim() === "") {
      throw new Error("ItiBedrockChatAdapter requires an API key");
    }
    if (!config.baseUrl || config.baseUrl.trim() === "") {
      throw new Error("ItiBedrockChatAdapter requires a base URL");
    }
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelayMs = config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.model = config.model?.trim() || DEFAULT_MODEL;
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
    const model = this.model;

    const request: OpenAIChatRequest = {
      model,
      messages: params.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: params.temperature ?? 0.7,
      top_p: params.topP,
      max_tokens: params.maxTokens,
      stream: false,
    };

    // The gateway reads tools/tool_choice when present. Forward the
    // provider-neutral schemas verbatim; a tool rejection surfaces as a
    // provider error and the failover layer moves to the next provider only
    // for infrastructure failures.
    if (params.tools && params.tools.length > 0) {
      request.tools = params.tools;
      if (params.toolChoice) {
        request.tool_choice = params.toolChoice;
      }
    }

    const startTime = Date.now();

    try {
      const response = await this.postChat(request, params.signal);
      const latencyMs = Date.now() - startTime;

      const choice = response.choices?.[0];
      const content = choice?.message?.content;
      if (!choice || typeof content !== "string") {
        throw new Error("No valid choices returned from ITI Bedrock chat");
      }

      const usage: ModelCompletionUsage = {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      };

      return {
        id: response.id ?? `${this.providerKey}-completion`,
        provider: this.providerKey,
        model: response.model ?? model,
        choices: [
          {
            index: choice.index ?? 0,
            message: {
              role: (choice.message?.role ?? "assistant") as "system" | "user" | "assistant",
              content,
            },
            finishReason: choice.finish_reason ?? null,
          },
        ],
        usage,
        latencyMs,
        estimatedCost: this.estimatedCostFromGateway(response, model, usage),
      };
    } catch (error) {
      logger.error({
        provider: this.providerKey,
        model,
        error: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - startTime,
      }, "ITI Bedrock chat completion failed");
      throw error;
    }
  }

  async checkAvailability(
    signal?: AbortSignal,
  ): Promise<{ available: boolean; reason?: string }> {
    // OpenAI-compatible gateway probe. The ITI base URL already includes the
    // version prefix (e.g. .../v1), so the models route is <baseUrl>/models.
    // The legacy StudentBedrockProvider route /api/v1/student/models is not
    // served by this gateway and must not be used here.
    const url = `${this.baseUrl}/models`;
    const probeSignal = signal
      ? AbortSignal.any([AbortSignal.timeout(PROBE_TIMEOUT_MS), signal])
      : AbortSignal.timeout(PROBE_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
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

  private async postChat(
    request: OpenAIChatRequest,
    callerSignal?: AbortSignal,
  ): Promise<OpenAIChatResponse> {
    const url = `${this.baseUrl}/chat/completions`;
    const attempts = Math.max(1, this.maxRetries);
    let lastError: unknown = new Error("Unknown ITI Bedrock error");

    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (callerSignal?.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
      const onCallerAbort = () => controller.abort();
      callerSignal?.addEventListener("abort", onCallerAbort, { once: true });

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw httpError(response);
        }

        return (await response.json()) as OpenAIChatResponse;
      } catch (error) {
        // Honor caller cancellation: no retry, no backoff.
        if (callerSignal?.aborted) {
          throw error;
        }
        const providerError = toProviderError(error);
        lastError = providerError;
        if (providerError.retryable && attempt < this.maxRetries) {
          const backoffMs = this.retryDelayMs * Math.pow(2, attempt - 1);
          logger.warn({
            provider: this.providerKey,
            attempt,
            backoffMs,
            error: providerError.message,
          }, "Retrying ITI Bedrock chat request after backoff");
          await sleep(backoffMs);
          continue;
        }
        throw providerError;
      } finally {
        clearTimeout(timeoutId);
        callerSignal?.removeEventListener("abort", onCallerAbort);
      }
    }

    throw lastError;
  }

  /**
   * Adapter-boundary cost mapping. Uses the gateway's estimated_cost_usd only
   * when it is a valid non-negative finite number; otherwise falls back to the
   * local safe estimate (0 for unknown models). Never invents a cost.
   */
  private estimatedCostFromGateway(
    response: OpenAIChatResponse,
    model: string,
    usage: ModelCompletionUsage,
  ): number {
    const gatewayCost = numericCost(response.iti?.estimated_cost_usd);
    if (gatewayCost !== undefined) return gatewayCost;
    return this.estimateCost(model, usage);
  }

  private estimateCost(model: string, usage: ModelCompletionUsage): number {
    const modelLower = model.toLowerCase();
    if (modelLower.includes("opus")) {
      return (
        (usage.promptTokens / 1_000_000) * 15 +
        (usage.completionTokens / 1_000_000) * 75
      );
    }
    if (modelLower.includes("sonnet")) {
      return (
        (usage.promptTokens / 1_000_000) * 3 +
        (usage.completionTokens / 1_000_000) * 15
      );
    }
    if (modelLower.includes("deepseek") || modelLower.includes("gpt-oss")) {
      return (usage.totalTokens / 1_000_000) * 0.5;
    }
    return 0;
  }
}

function numericCost(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return value;
}

interface ProviderHttpError extends Error {
  status?: number;
  code?: string;
  headers?: Headers;
  retryable?: boolean;
}

function httpError(response: Response): ProviderHttpError {
  // The gateway response body is deliberately NOT included: it can contain
  // gateway internals and must never leak into logs or errors.
  const error = new Error(`HTTP ${response.status}`) as ProviderHttpError;
  error.status = response.status;
  error.headers = response.headers;
  // So mapLlmProviderError classifies it as LLM_RATE_LIMITED with the gateway's
  // retry-after header intact.
  if (response.status === 429) {
    error.code = "rate_limit_exceeded";
  }
  return error;
}

function toProviderError(error: unknown): ProviderHttpError {
  const providerError = error as ProviderHttpError;
  if (!(error instanceof Error)) {
    const wrapped = new Error(String(error)) as ProviderHttpError;
    return wrapped;
  }

  if (providerError.name === "AbortError") {
    // Our own timeout fired (caller abort is handled by the caller): surface a
    // provider timeout that the failover layer maps to LLM_TIMEOUT.
    providerError.status = 408;
    providerError.retryable = true;
    return providerError;
  }

  if (providerError.status !== undefined) {
    providerError.retryable =
      providerError.status === 429 ||
      providerError.status === 408 ||
      providerError.status >= 500;
    return providerError;
  }

  // Network-level failures (DNS, ECONNREFUSED, ECONNRESET) are retryable.
  providerError.retryable = true;
  return providerError;
}
