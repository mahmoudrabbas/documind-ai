import OpenAI from "openai";
import { LLM_RATE_LIMITED } from "../../common/errors/errorCodes.js";
import { mapLlmProviderError } from "./providerError.js";
import type {
  ModelCompletionMessage,
  ModelCompletionResponse,
  ModelStructuredOutput,
} from "../../modules/agents/agents.types.js";
import type { AvailabilityProbeModelAdapter } from "./failoverModelAdapter.js";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const PROBE_TIMEOUT_MS = 5_000;

// The app's adapter layers (FallbackModelAdapter / FailoverModelAdapter) own
// retry and failover decisions. Keeping the SDK's automatic retries minimal
// avoids double-backoff latency: a rate-limited or failing request surfaces
// quickly so the controlled error reaches the caller (or the next provider in
// the chain) instead of silently burning seconds on SDK backoff.
const MAX_SDK_RETRIES = 1;

export class GroqChatAdapter implements AvailabilityProbeModelAdapter {
  readonly providerKey = "groq";

  private client: OpenAI;
  private model: string;
  private apiKey: string;
  private rateLimitedUntil: number | null = null;
  private rateLimitRetryAfterSeconds: number | null = null;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.client = new OpenAI({
      apiKey,
      baseURL: GROQ_BASE_URL,
      maxRetries: MAX_SDK_RETRIES,
    });
    this.model = model;
  }

  /**
   * When Groq reports a rate limit (429) with a retry-after window, every
   * subsequent completion for this model is short-circuited for that window:
   * the controlled LLM_RATE_LIMITED error is thrown immediately without a
   * network round-trip. This prevents a degraded provider from stalling the
   * whole chat request (intent query + answer writer) for the duration of the
   * quota window and avoids hammering an already-limited endpoint.
   */
  private throwIfRateLimited(): void {
    if (
      this.rateLimitedUntil !== null &&
      Date.now() < this.rateLimitedUntil
    ) {
      throw mapLlmProviderError({
        status: 429,
        code: "rate_limit_exceeded",
        headers: new Headers({
          "retry-after": String(this.rateLimitRetryAfterSeconds ?? 60),
        }),
      });
    }
  }

  private recordRateLimit(caught: unknown): void {
    const mapped = mapLlmProviderError(caught);
    if (mapped.code !== LLM_RATE_LIMITED) return;
    const retryAfterSeconds =
      typeof mapped.details === "object" &&
      mapped.details !== null &&
      "retryAfterSeconds" in mapped.details
        ? (mapped.details as { retryAfterSeconds?: number }).retryAfterSeconds
        : undefined;
    if (retryAfterSeconds === undefined) return;
    this.rateLimitedUntil = Date.now() + retryAfterSeconds * 1000;
    this.rateLimitRetryAfterSeconds = retryAfterSeconds;
  }

  /**
   * Lightweight liveness probe used by proactive failover: reach the Groq
   * models endpoint. Returns availability without ever surfacing the key.
   */
  async checkAvailability(
    signal?: AbortSignal,
  ): Promise<{ available: boolean; reason?: string }> {
    try {
      const response = await fetch(`${GROQ_BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: signal ?? AbortSignal.timeout(PROBE_TIMEOUT_MS),
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

  /**
   * Builds the provider request params. Exposed separately so the native
   * structured-output mapping can be asserted without a network call.
   */
  buildRequestParams(params: {
    messages: ModelCompletionMessage[];
    tools?: Record<string, unknown>[];
    toolChoice?: string | Record<string, unknown>;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    structuredOutput?: ModelStructuredOutput;
  }): OpenAI.ChatCompletionCreateParamsNonStreaming {
    const requestParams: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model: this.model,
      messages: params.messages.map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      })),
      temperature: params.temperature ?? 0.7,
      top_p: params.topP,
      max_tokens: params.maxTokens,
    };

    // Map the provider-neutral structured-output request to Groq's native
    // OpenAI-compatible JSON mode. JSON mode guarantees a syntactically valid
    // JSON object, so the model cannot emit literal control characters inside
    // string values. Server-side strict parsing/validation still applies.
    if (params.structuredOutput?.type === "json_object") {
      requestParams.response_format = { type: "json_object" };
    }

    if (params.tools && params.tools.length > 0) {
      requestParams.tools = params.tools as unknown as OpenAI.ChatCompletionTool[];
      if (params.toolChoice) {
        requestParams.tool_choice = params.toolChoice as
          | "auto"
          | "none"
          | "required"
          | { type: "function"; function: { name: string } };
      }
    }

    return requestParams;
  }

  async complete(params: {
    messages: ModelCompletionMessage[];
    tools?: Record<string, unknown>[];
    toolChoice?: string | Record<string, unknown>;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    signal?: AbortSignal;
    structuredOutput?: ModelStructuredOutput;
  }): Promise<ModelCompletionResponse> {
    const startTime = Date.now();

    this.throwIfRateLimited();

    const requestParams = this.buildRequestParams(params);

    let response: OpenAI.ChatCompletion;
    try {
      response = await this.client.chat.completions.create(requestParams, {
        signal: params.signal,
      });
    } catch (error) {
      // Honor caller cancellation: never cooldown or mask an abort.
      if (params.signal?.aborted) {
        throw error;
      }
      this.recordRateLimit(error);
      throw error;
    }

    // A successful call means the provider is healthy again: clear any stale
    // cooldown (e.g. the quota window reset or the key was rotated).
    this.rateLimitedUntil = null;
    this.rateLimitRetryAfterSeconds = null;

    const choice = response.choices[0];
    const latencyMs = Date.now() - startTime;

    return {
      id: response.id,
      provider: "groq",
      model: response.model,
      choices: [
        {
          index: choice.index,
          message: {
            role: choice.message.role as "system" | "user" | "assistant",
            content: choice.message.content ?? "",
          },
          finishReason: choice.finish_reason,
        },
      ],
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
      latencyMs,
      estimatedCost: 0,
    };
  }
}
