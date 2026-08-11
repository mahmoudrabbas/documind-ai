import OpenAI from "openai";
import type {
  ModelCompletionMessage,
  ModelCompletionResponse,
  ModelStructuredOutput,
} from "../../modules/agents/agents.types.js";
import type { AvailabilityProbeModelAdapter } from "./failoverModelAdapter.js";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const PROBE_TIMEOUT_MS = 5_000;

export class GroqChatAdapter implements AvailabilityProbeModelAdapter {
  readonly providerKey = "groq";
  readonly runtimeIdentity;

  private client: OpenAI;
  readonly model: string;
  private apiKey: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.client = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });
    this.model = model;
    this.runtimeIdentity = Object.freeze({ provider: this.providerKey, model, modelRevisionStatus: "unavailable" as const, componentVersion: "groq-chat-adapter-v1" });
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

    const requestParams = this.buildRequestParams(params);

    const response = await this.client.chat.completions.create(requestParams, {
      signal: params.signal,
    });

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
